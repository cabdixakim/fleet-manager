import { Router } from "express";
import { db } from "@workspace/db";
import {
  subcontractorsTable,
  subcontractorTransactionsTable,
  trucksTable,
  driversTable,
  tripsTable,
  tripExpensesTable,
  usersTable,
  periodsTable,
  batchesTable,
  truckDriverAssignmentsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, count, inArray, notInArray, and, isNull, gte, lte } from "drizzle-orm";
import { calculateTripFinancials, REVENUE_RECOGNISED_STATUSES } from "../lib/financials";
import { logAudit } from "../lib/audit";

const router = Router();

async function getSessionUserRole(req: any): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.role ?? null;
}

async function getSubBalance(subId: number) {
  const trucks = await db
    .select({ id: trucksTable.id })
    .from(trucksTable)
    .where(eq(trucksTable.subcontractorId, subId));

  let totalNetPayable = 0;
  let inProgressExpenses = 0;

  if (trucks.length > 0) {
    const truckIds = trucks.map((t) => t.id);

    // Revenue-recognised trips owned by this sub's trucks (excluding amended_out, which is handled separately below)
    const revenueStatuses = REVENUE_RECOGNISED_STATUSES.filter((s) => s !== "amended_out");
    const deliveredTrips = await db
      .select({
        id: tripsTable.id,
        incidentFlag: tripsTable.incidentFlag,
        incidentRevenueOwner: tripsTable.incidentRevenueOwner,
      })
      .from(tripsTable)
      .where(and(inArray(tripsTable.truckId, truckIds), inArray(tripsTable.status, revenueStatuses)));

    for (const trip of deliveredTrips) {
      try {
        if (trip.incidentFlag) {
          const revenueOwner = trip.incidentRevenueOwner ?? "original";
          if (revenueOwner === "replacement") {
            // Original sub gets no revenue — only expense deductions
            const [expRow] = await db
              .select({ total: sql<string>`coalesce(sum(amount), 0)` })
              .from(tripExpensesTable)
              .where(eq(tripExpensesTable.tripId, trip.id));
            inProgressExpenses += parseFloat(expRow?.total ?? "0");
          } else if (revenueOwner === "split") {
            // 50/50 split — original sub gets half
            const fin = await calculateTripFinancials(trip.id);
            totalNetPayable += (fin.netPayable ?? 0) * 0.5;
          } else {
            // 'original' (default) — full net to original sub
            const fin = await calculateTripFinancials(trip.id);
            totalNetPayable += fin.netPayable ?? 0;
          }
        } else {
          const fin = await calculateTripFinancials(trip.id);
          totalNetPayable += fin.netPayable ?? 0;
        }
      } catch {}
    }

    // In-progress trips: expenses already incurred reduce payable before delivery.
    // Use a negative filter so any future active status (e.g. "nominated", "pending_clearance")
    // is automatically included rather than having to maintain an allowlist.
    const activeTrips = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.truckId, truckIds),
        notInArray(tripsTable.status, ["delivered", "completed", "invoiced", "amended_out", "cancelled"])
      ));
    if (activeTrips.length > 0) {
      const activeTripIds = activeTrips.map((t) => t.id);
      const [expRow] = await db
        .select({ total: sql<string>`coalesce(sum(amount), 0)` })
        .from(tripExpensesTable)
        .where(inArray(tripExpensesTable.tripId, activeTripIds));
      inProgressExpenses += parseFloat(expRow?.total ?? "0");
    }

    // Legacy: amended-out (non-incident) trips still count for original sub
    const amendedOutTrips = await db
      .select({ id: tripsTable.id, incidentFlag: tripsTable.incidentFlag, incidentRevenueOwner: tripsTable.incidentRevenueOwner })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.truckId, truckIds),
        eq(tripsTable.status, "amended_out")
      ));

    for (const trip of amendedOutTrips) {
      // Only credit revenue if not flagged as incident with replacement attribution
      if (trip.incidentFlag && trip.incidentRevenueOwner === "replacement") continue;
      try {
        const fin = await calculateTripFinancials(trip.id);
        const pct = trip.incidentFlag && trip.incidentRevenueOwner === "split" ? 0.5 : 1;
        totalNetPayable += (fin.netPayable ?? 0) * pct;
      } catch {}
    }

    // Replacement truck trips: where this sub's truck is the incident replacement
    const replacementDeliveredTrips = await db
      .select({
        id: tripsTable.id,
        incidentRevenueOwner: tripsTable.incidentRevenueOwner,
      })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.incidentReplacementTruckId, truckIds),
        eq(tripsTable.incidentFlag, true),
        inArray(tripsTable.status, revenueStatuses)
      ));

    for (const trip of replacementDeliveredTrips) {
      try {
        const revenueOwner = trip.incidentRevenueOwner ?? "original";
        if (revenueOwner === "replacement") {
          // Replacement sub gets full net (calculateTripFinancials uses replacement's commission)
          const fin = await calculateTripFinancials(trip.id);
          totalNetPayable += fin.netPayable ?? 0;
        } else if (revenueOwner === "split") {
          // Replacement sub gets 50%
          const fin = await calculateTripFinancials(trip.id);
          totalNetPayable += (fin.netPayable ?? 0) * 0.5;
        }
        // 'original': replacement sub gets nothing
      } catch {}
    }
  }

  const [txBal] = await db
    .select({
      advances: sql<string>`coalesce(sum(case when type='advance_given' then amount else 0 end),0)`,
      payments: sql<string>`coalesce(sum(case when type='payment_made' then amount else 0 end),0)`,
      adjustments: sql<string>`coalesce(sum(case when type='adjustment' then amount else 0 end),0)`,
    })
    .from(subcontractorTransactionsTable)
    .where(eq(subcontractorTransactionsTable.subcontractorId, subId));

  return (
    totalNetPayable
    - inProgressExpenses
    - parseFloat(txBal.advances ?? "0")
    - parseFloat(txBal.payments ?? "0")
    + parseFloat(txBal.adjustments ?? "0")
  );
}

router.get("/", async (_req, res, next) => {
  try {
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);
    const withData = await Promise.all(
      subs.map(async (s) => {
        const [tc] = await db.select({ count: count() }).from(trucksTable).where(eq(trucksTable.subcontractorId, s.id));
        const balance = await getSubBalance(s.id);
        return { ...s, balance, truckCount: tc.count };
      })
    );
    res.json(withData);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [sub] = await db.insert(subcontractorsTable).values(req.body).returning();
    await logAudit(req, { action: "create", entity: "subcontractor", entityId: sub.id, description: `Created subcontractor ${sub.name}` });
    res.status(201).json({ ...sub, balance: 0, truckCount: 0 });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    if (!sub) return res.status(404).json({ error: "Not found" });

    const trucks = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        subcontractorId: trucksTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
        status: trucksTable.status,
        notes: trucksTable.notes,
        assignedDriverName: driversTable.name,
        createdAt: trucksTable.createdAt,
      })
      .from(trucksTable)
      .leftJoin(truckDriverAssignmentsTable, and(
        eq(truckDriverAssignmentsTable.truckId, trucksTable.id),
        isNull(truckDriverAssignmentsTable.unassignedAt),
      ))
      .leftJoin(driversTable, eq(truckDriverAssignmentsTable.driverId, driversTable.id))
      .leftJoin(subcontractorsTable, eq(trucksTable.subcontractorId, subcontractorsTable.id))
      .where(eq(trucksTable.subcontractorId, id));

    const transactions = await db
      .select({
        id: subcontractorTransactionsTable.id,
        subcontractorId: subcontractorTransactionsTable.subcontractorId,
        type: subcontractorTransactionsTable.type,
        amount: subcontractorTransactionsTable.amount,
        tripId: subcontractorTransactionsTable.tripId,
        driverId: subcontractorTransactionsTable.driverId,
        driverName: driversTable.name,
        description: subcontractorTransactionsTable.description,
        transactionDate: subcontractorTransactionsTable.transactionDate,
        createdAt: subcontractorTransactionsTable.createdAt,
      })
      .from(subcontractorTransactionsTable)
      .leftJoin(driversTable, eq(subcontractorTransactionsTable.driverId, driversTable.id))
      .where(eq(subcontractorTransactionsTable.subcontractorId, id))
      .orderBy(desc(subcontractorTransactionsTable.transactionDate));

    const [tc] = await db.select({ count: count() }).from(trucksTable).where(eq(trucksTable.subcontractorId, id));
    const balance = await getSubBalance(id);

    res.json({
      ...sub,
      balance,
      truckCount: tc.count,
      transactions: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
      trucks,
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));

    // Guard opening balance edits when locked
    if (before?.obLocked && req.body.openingBalance !== undefined) {
      const incoming = parseFloat(req.body.openingBalance);
      const current = parseFloat(before.openingBalance ?? "0");
      if (incoming !== current) {
        return res.status(403).json({ error: "Opening balance is locked. Use the adjust endpoint to override." });
      }
    }

    const [sub] = await db.update(subcontractorsTable).set(req.body).where(eq(subcontractorsTable.id, id)).returning();
    if (!sub) return res.status(404).json({ error: "Not found" });
    await logAudit(req, { action: "update", entity: "subcontractor", entityId: id, description: `Updated subcontractor ${sub.name}` });
    const [tc] = await db.select({ count: count() }).from(trucksTable).where(eq(trucksTable.subcontractorId, id));
    const balance = await getSubBalance(id);
    res.json({ ...sub, balance, truckCount: tc.count });
  } catch (e) { next(e); }
});

// Admin/Manager override: adjust opening balance after it is locked
router.post("/:id/adjust-opening-balance", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { newBalance, reason } = req.body as { newBalance: number; reason?: string };

    if (newBalance === undefined || newBalance === null) {
      return res.status(400).json({ error: "newBalance is required" });
    }

    const role = await getSessionUserRole(req);
    if (role !== "owner" && role !== "admin" && role !== "manager") {
      return res.status(403).json({ error: "Only admin or manager can adjust a locked opening balance" });
    }

    const [before] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    if (!before) return res.status(404).json({ error: "Not found" });

    const [sub] = await db
      .update(subcontractorsTable)
      .set({ openingBalance: newBalance.toString() })
      .where(eq(subcontractorsTable.id, id))
      .returning();

    await logAudit(req, {
      action: "update",
      entity: "subcontractor",
      entityId: id,
      description: `Opening balance adjusted for ${sub.name}: $${parseFloat(before.openingBalance ?? "0").toFixed(2)} → $${newBalance.toFixed(2)}${reason ? ` (${reason})` : ""}`,
      metadata: { previousBalance: parseFloat(before.openingBalance ?? "0"), newBalance, reason },
    });

    const [tc] = await db.select({ count: count() }).from(trucksTable).where(eq(trucksTable.subcontractorId, id));
    const balance = await getSubBalance(id);
    res.json({ ...sub, balance, truckCount: tc.count });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    await db.update(subcontractorsTable).set({ isActive: false }).where(eq(subcontractorsTable.id, id));
    await logAudit(req, { action: "update", entity: "subcontractor", entityId: id, description: `Deactivated subcontractor ${sub?.name ?? id}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:id/reactivate", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db.update(subcontractorsTable).set({ isActive: true }).where(eq(subcontractorsTable.id, id)).returning();
    await logAudit(req, { action: "update", entity: "subcontractor", entityId: id, description: `Reactivated subcontractor ${sub?.name ?? id}` });
    res.json(sub);
  } catch (e) { next(e); }
});

router.get("/:id/transactions", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, id));
    if (!sub) return res.status(404).json({ error: "Not found" });

    const transactions = await db
      .select({
        id: subcontractorTransactionsTable.id,
        subcontractorId: subcontractorTransactionsTable.subcontractorId,
        type: subcontractorTransactionsTable.type,
        amount: subcontractorTransactionsTable.amount,
        tripId: subcontractorTransactionsTable.tripId,
        driverId: subcontractorTransactionsTable.driverId,
        driverName: driversTable.name,
        description: subcontractorTransactionsTable.description,
        transactionDate: subcontractorTransactionsTable.transactionDate,
        createdAt: subcontractorTransactionsTable.createdAt,
      })
      .from(subcontractorTransactionsTable)
      .leftJoin(driversTable, eq(subcontractorTransactionsTable.driverId, driversTable.id))
      .where(eq(subcontractorTransactionsTable.subcontractorId, id))
      .orderBy(desc(subcontractorTransactionsTable.transactionDate));

    const [txBal] = await db
      .select({
        totalAdvancesGiven: sql<string>`coalesce(sum(case when type='advance_given' then amount else 0 end),0)`,
        totalDriverSalaries: sql<string>`coalesce(sum(case when type='driver_salary' then amount else 0 end),0)`,
        totalPaymentsMade: sql<string>`coalesce(sum(case when type='payment_made' then amount else 0 end),0)`,
      })
      .from(subcontractorTransactionsTable)
      .where(eq(subcontractorTransactionsTable.subcontractorId, id));

    let totalNetPayable = 0;
    const revenueTrips = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.subcontractorId, id), inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES)));
    for (const trip of revenueTrips) {
      try {
        const fin = await calculateTripFinancials(trip.id);
        totalNetPayable += fin.netPayable ?? 0;
      } catch {}
    }

    const balance = totalNetPayable - parseFloat(txBal.totalAdvancesGiven ?? "0") - parseFloat(txBal.totalPaymentsMade ?? "0");
    const [tc] = await db.select({ count: count() }).from(trucksTable).where(eq(trucksTable.subcontractorId, id));

    res.json({
      subcontractor: { ...sub, balance, truckCount: tc.count },
      transactions: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
      totalNetPayable,
      totalAdvancesGiven: parseFloat(txBal.totalAdvancesGiven ?? "0"),
      totalDriverSalaries: parseFloat(txBal.totalDriverSalaries ?? "0"),
      totalPaymentsMade: parseFloat(txBal.totalPaymentsMade ?? "0"),
      balance,
    });
  } catch (e) { next(e); }
});

router.post("/:id/transactions", async (req, res, next) => {
  try {
    const subcontractorId = parseInt(req.params.id);
    const [tx] = await db
      .insert(subcontractorTransactionsTable)
      .values({ ...req.body, subcontractorId })
      .returning();
    const [sub] = await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subcontractorId));
    await logAudit(req, {
      action: "payment",
      entity: "subcontractor_transaction",
      entityId: tx.id,
      description: `Subcontractor payment recorded: ${tx.type} of $${parseFloat(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} for ${sub?.name ?? `sub #${subcontractorId}`}${tx.reference ? ` — Ref: ${tx.reference}` : ""}`,
      metadata: { subcontractorId, type: tx.type, amount: parseFloat(tx.amount), reference: tx.reference ?? null },
    });
    res.status(201).json({ ...tx, amount: parseFloat(tx.amount) });
  } catch (e) { next(e); }
});

router.get("/:id/expenses", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const trips = await db
      .select({ id: tripsTable.id, truckId: tripsTable.truckId })
      .from(tripsTable)
      .where(eq(tripsTable.subcontractorId, id));
    const trucks = await db
      .select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber })
      .from(trucksTable)
      .where(eq(trucksTable.subcontractorId, id));
    if (trips.length === 0) return res.json([]);

    const tripIds = trips.map((t) => t.id);
    const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
    const truckMap = Object.fromEntries(trucks.map((t) => [t.id, t]));

    const expenses = await db
      .select()
      .from(tripExpensesTable)
      .where(inArray(tripExpensesTable.tripId, tripIds))
      .orderBy(desc(tripExpensesTable.createdAt));

    res.json(expenses.map((e) => ({
      ...e,
      amount: parseFloat(e.amount as any),
      tripNumber: e.tripId ? `#${e.tripId}` : null,
      truckPlate: truckMap[tripMap[e.tripId!]?.truckId ?? 0]?.plateNumber ?? null,
    })));
  } catch (e) { next(e); }
});

// GET /:id/period-statement?periodId=X — full deduction waterfall for a subcontractor within a period
router.get("/:id/period-statement", async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id);
    const periodId = req.query.periodId ? parseInt(req.query.periodId as string) : null;

    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, subId));
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });

    let start: Date | null = null;
    let end: Date | null = null;
    let periodName = "All Time";

    if (periodId) {
      const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, periodId));
      if (!period) return res.status(404).json({ error: "Period not found" });
      start = new Date(period.startDate);
      end = new Date(period.endDate);
      end.setHours(23, 59, 59, 999);
      periodName = period.name;
    }

    const tripQuery = db
      .select({
        id: tripsTable.id,
        truckId: tripsTable.truckId,
        truckPlate: trucksTable.plateNumber,
        batchId: tripsTable.batchId,
        batchName: batchesTable.name,
        route: batchesTable.route,
        status: tripsTable.status,
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .where(
        start && end
          ? and(eq(tripsTable.subcontractorId, subId), gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end))
          : eq(tripsTable.subcontractorId, subId)
      )
      .orderBy(desc(tripsTable.createdAt));

    const rawTrips = await tripQuery;
    const deliveredTrips = rawTrips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

    const tripDetails = [];
    let totalGross = 0;
    let totalCommission = 0;
    let totalShortCharges = 0;
    let totalTripExpenses = 0;
    let totalDriverSalaries = 0;
    let totalNetPayable = 0;

    for (const trip of deliveredTrips) {
      try {
        const fin = await calculateTripFinancials(trip.id);
        const fullGross = fin.grossRevenue ?? 0;
        const agentFee = fin.agentFeeTotal ?? 0;
        const gross = fullGross - agentFee; // sub sees net freight rate — agent fee is not disclosed
        const commission = fin.commission ?? 0;
        const shortCharge = fin.shortCharge ?? 0;
        const tripExpenses = fin.tripExpensesTotal ?? 0;
        const driverSalary = fin.driverSalaryAllocation ?? 0;
        const net = fin.netPayable ?? 0;

        totalGross += gross;
        totalCommission += commission;
        totalShortCharges += shortCharge;
        totalTripExpenses += tripExpenses;
        totalDriverSalaries += driverSalary;
        totalNetPayable += net;

        tripDetails.push({
          tripId: trip.id,
          tripNumber: `#${trip.id}`,
          truckPlate: trip.truckPlate ?? "",
          batchName: trip.batchName ?? "",
          route: trip.route ?? "",
          status: trip.status,
          createdAt: trip.createdAt,
          gross,
          commission,
          shortCharge,
          chargeableShort: fin.chargeableShort ?? 0,
          shortQty: fin.shortQty ?? 0,
          tripExpenses,
          driverSalary,
          netPayable: net,
        });
      } catch { /* skip on error */ }
    }

    // Get payments made within this period from subcontractor transactions
    const txQuery = start && end
      ? and(eq(subcontractorTransactionsTable.subcontractorId, subId), gte(subcontractorTransactionsTable.transactionDate, start), lte(subcontractorTransactionsTable.transactionDate, end))
      : eq(subcontractorTransactionsTable.subcontractorId, subId);

    const periodTransactions = await db
      .select()
      .from(subcontractorTransactionsTable)
      .where(txQuery)
      .orderBy(desc(subcontractorTransactionsTable.transactionDate));

    const totalPaid = periodTransactions
      .filter((t) => t.type === "payment_made")
      .reduce((s, t) => s + parseFloat(t.amount as any), 0);

    // Non-trip truck expenses for all trucks under this subcontractor
    const otherExpenseQuery = start && end
      ? and(inArray(tripExpensesTable.truckId, truckIds), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck"), gte(tripExpensesTable.expenseDate, start), lte(tripExpensesTable.expenseDate, end))
      : and(inArray(tripExpensesTable.truckId, truckIds), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck"));

    const otherExpenses = await db
      .select()
      .from(tripExpensesTable)
      .where(otherExpenseQuery)
      .orderBy(desc(tripExpensesTable.expenseDate));

    const totalOtherExpenses = otherExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

    const openingBalance = parseFloat(sub.openingBalance ?? "0");
    const netPayable = totalNetPayable - totalOtherExpenses;
    const closingBalance = openingBalance + netPayable - totalPaid;

    return res.json({
      subcontractor: { ...sub, commissionRate: parseFloat(sub.commissionRate ?? "0") },
      periodName,
      periodId,
      trips: tripDetails,
      transactions: periodTransactions.map((t) => ({ ...t, amount: parseFloat(t.amount as any) })),
      otherExpenses: otherExpenses.map((e) => ({ ...e, truckPlate: truckMap[e.truckId!] ?? "", amount: parseFloat(e.amount) })),
      summary: {
        gross: totalGross,
        commission: totalCommission,
        shortCharges: totalShortCharges,
        tripExpenses: totalTripExpenses,
        driverSalaries: totalDriverSalaries,
        otherExpenses: totalOtherExpenses,
        netPayable,
        openingBalance,
        totalPaid,
        closingBalance,
      },
    });
  } catch (e) { next(e); }
});

export default router;
