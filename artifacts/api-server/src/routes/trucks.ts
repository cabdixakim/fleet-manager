import { Router } from "express";
import { db } from "@workspace/db";
import {
  trucksTable, subcontractorsTable, driversTable,
  truckDriverAssignmentsTable, tripsTable, batchesTable,
  tripExpensesTable,
} from "@workspace/db/schema";
import { eq, desc, and, isNull, inArray, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { calculateTripFinancials } from "../lib/financials";
import { blockIfClosed, bumpDateIfClosed, appendNote } from "../lib/financialPeriod";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const trucks = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        companyOwned: trucksTable.companyOwned,
        subcontractorId: trucksTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
        status: trucksTable.status,
        notes: trucksTable.notes,
        currentLocation: trucksTable.currentLocation,
        createdAt: trucksTable.createdAt,
      })
      .from(trucksTable)
      .leftJoin(subcontractorsTable, eq(trucksTable.subcontractorId, subcontractorsTable.id))
      .orderBy(trucksTable.plateNumber);

    if (trucks.length === 0) return res.json([]);

    const truckIds = trucks.map((t) => t.id);

    // Active trips (non-terminal) — one per truck (latest by id)
    const activeTripsRaw = await db
      .select({
        truckId: tripsTable.truckId,
        tripId: tripsTable.id,
        tripStatus: tripsTable.status,
        batchName: batchesTable.name,
        batchId: tripsTable.batchId,
        route: batchesTable.route,
      })
      .from(tripsTable)
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(
        and(
          inArray(tripsTable.truckId, truckIds),
          sql`${tripsTable.status} NOT IN ('delivered','completed','cancelled','amended_out')`
        )
      )
      .orderBy(desc(tripsTable.id));

    // Keep only the most recent active trip per truck
    const activeByTruck = new Map<number, typeof activeTripsRaw[0]>();
    for (const t of activeTripsRaw) {
      if (t.truckId !== null && !activeByTruck.has(t.truckId)) {
        activeByTruck.set(t.truckId, t);
      }
    }

    // Last delivered timestamp per truck
    const lastDeliveries = await db
      .select({
        truckId: tripsTable.truckId,
        lastDeliveredAt: sql<string>`MAX(${tripsTable.deliveredAt})`,
      })
      .from(tripsTable)
      .where(
        and(
          inArray(tripsTable.truckId, truckIds),
          sql`${tripsTable.status} IN ('delivered','completed')`
        )
      )
      .groupBy(tripsTable.truckId);

    const lastDeliveryByTruck = new Map<number, string>(
      lastDeliveries
        .filter((d) => d.truckId !== null)
        .map((d) => [d.truckId as number, d.lastDeliveredAt])
    );

    const result = trucks.map((truck) => ({
      ...truck,
      activeTrip: activeByTruck.get(truck.id) ?? null,
      lastDeliveredAt: lastDeliveryByTruck.get(truck.id) ?? null,
    }));

    res.json(result);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [truck] = await db.insert(trucksTable).values(req.body).returning();
    const subId = truck.subcontractorId;
    const ownerLabel = truck.companyOwned ? "Company Fleet" : (subId ? (await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)).then((r) => r[0]?.name ?? "subcontractor")) : "unassigned");
    await logAudit(req, { action: "create", entity: "truck", entityId: truck.id, description: `Added truck ${truck.plateNumber} (${ownerLabel})` });
    const [sub] = subId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)) : [null];
    res.status(201).json({ ...truck, subcontractorName: sub?.name ?? null, assignedDriverName: null });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [truck] = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        companyOwned: trucksTable.companyOwned,
        subcontractorId: trucksTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
        status: trucksTable.status,
        notes: trucksTable.notes,
        createdAt: trucksTable.createdAt,
      })
      .from(trucksTable)
      .leftJoin(subcontractorsTable, eq(trucksTable.subcontractorId, subcontractorsTable.id))
      .where(eq(trucksTable.id, parseInt(req.params.id)));
    if (!truck) return res.status(404).json({ error: "Not found" });
    res.json(truck);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select({ subcontractorId: trucksTable.subcontractorId, companyOwned: trucksTable.companyOwned }).from(trucksTable).where(eq(trucksTable.id, id));
    const [truck] = await db.update(trucksTable).set(req.body).where(eq(trucksTable.id, id)).returning();
    if (!truck) return res.status(404).json({ error: "Not found" });

    const isRetire = req.body.status === "retired";
    const ownershipChanged = req.body.companyOwned !== undefined && before?.companyOwned !== req.body.companyOwned;
    const isSubSwap = !ownershipChanged && req.body.subcontractorId != null && before?.subcontractorId !== req.body.subcontractorId;

    let description = isRetire
      ? `Truck ${truck.plateNumber} retired — removed from active fleet`
      : `Updated truck ${truck.plateNumber}`;
    let action: string = isRetire ? "status_change" : "update";
    let metadata: Record<string, any> = req.body.status ? { status: req.body.status } : {};

    if (ownershipChanged) {
      action = "ownership_transfer";
      if (truck.companyOwned) {
        description = `Truck ${truck.plateNumber} transferred from subcontractor to Company Fleet`;
      } else {
        const [newSub] = truck.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId)) : [null];
        description = `Truck ${truck.plateNumber} transferred from Company Fleet to ${newSub?.name ?? "subcontractor"}`;
      }
      metadata = { from: before?.companyOwned ? "company" : "subcontractor", to: truck.companyOwned ? "company" : "subcontractor", newSubcontractorId: truck.subcontractorId };
    } else if (isSubSwap) {
      action = "reassign";
      const [oldSub] = before?.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, before.subcontractorId)) : [null];
      const [newSub] = truck.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId)) : [null];
      description = `Truck ${truck.plateNumber} reassigned from ${oldSub?.name ?? "unknown"} to ${newSub?.name ?? "unknown"}`;
      metadata = { fromSubcontractorId: before?.subcontractorId, toSubcontractorId: truck.subcontractorId };
    }

    await logAudit(req, { action, entity: "truck", entityId: id, description, metadata });
    const [sub] = truck.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId)) : [null];
    res.json({ ...truck, subcontractorName: sub?.name ?? null });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, id));
    if (!truck) return res.status(404).json({ error: "Truck not found" });

    // Block hard-delete if the truck has any trip history
    const [tripCheck] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tripsTable)
      .where(eq(tripsTable.truckId, id));
    if (Number(tripCheck?.count ?? 0) > 0) {
      return res.status(409).json({
        error: "This truck has trip history and cannot be deleted. Retire it instead by setting its status to 'retired'.",
      });
    }

    await db.delete(trucksTable).where(eq(trucksTable.id, id));
    await logAudit(req, { action: "delete", entity: "truck", entityId: id, description: `Deleted truck ${truck.plateNumber} (no trip history)` });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /trucks/:id/detail — full truck profile: info, driver history, trip history, non-trip expenses, summary
router.get("/:id/detail", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const [truck] = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        companyOwned: trucksTable.companyOwned,
        subcontractorId: trucksTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
        commissionRate: subcontractorsTable.commissionRate,
        status: trucksTable.status,
        notes: trucksTable.notes,
        insurerName: trucksTable.insurerName,
        policyNumber: trucksTable.policyNumber,
        coverageAmount: trucksTable.coverageAmount,
        premiumAmount: trucksTable.premiumAmount,
        insuranceExpiry: trucksTable.insuranceExpiry,
        createdAt: trucksTable.createdAt,
      })
      .from(trucksTable)
      .leftJoin(subcontractorsTable, eq(trucksTable.subcontractorId, subcontractorsTable.id))
      .where(eq(trucksTable.id, id));

    if (!truck) return res.status(404).json({ error: "Truck not found" });

    // Driver assignment history
    const driverAssignments = await db
      .select({
        id: truckDriverAssignmentsTable.id,
        driverId: truckDriverAssignmentsTable.driverId,
        driverName: driversTable.name,
        assignedAt: truckDriverAssignmentsTable.assignedAt,
        unassignedAt: truckDriverAssignmentsTable.unassignedAt,
      })
      .from(truckDriverAssignmentsTable)
      .leftJoin(driversTable, eq(truckDriverAssignmentsTable.driverId, driversTable.id))
      .where(eq(truckDriverAssignmentsTable.truckId, id))
      .orderBy(desc(truckDriverAssignmentsTable.assignedAt));

    // All trips for this truck
    const rawTrips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        product: tripsTable.product,
        createdAt: tripsTable.createdAt,
        batchName: batchesTable.name,
        route: batchesTable.route,
        ratePerMt: batchesTable.ratePerMt,
      })
      .from(tripsTable)
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(eq(tripsTable.truckId, id))
      .orderBy(desc(tripsTable.createdAt));

    // Calculate per-trip financials
    const trips = await Promise.all(
      rawTrips.map(async (t) => {
        try {
          const fin = await calculateTripFinancials(t.id);
          return {
            ...t,
            grossRevenue: (fin.grossRevenue ?? 0) - (fin.agentFeeTotal ?? 0),
            commission: fin.commission ?? 0,
            tripExpenses: fin.tripExpensesTotal ?? 0,
            netContribution: fin.netPayable ?? 0,
          };
        } catch {
          return { ...t, grossRevenue: 0, commission: 0, tripExpenses: 0, netContribution: 0 };
        }
      })
    );

    // Non-trip expenses (tripId IS NULL, truckId = id, tier = "truck")
    const otherExpenses = await db
      .select()
      .from(tripExpensesTable)
      .where(and(eq(tripExpensesTable.truckId, id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck")))
      .orderBy(desc(tripExpensesTable.expenseDate));

    // Summary KPIs
    const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));
    const totalRevenue = activeTrips.reduce((s, t) => s + t.grossRevenue, 0);
    const totalCommission = activeTrips.reduce((s, t) => s + t.commission, 0);
    const totalTripExpenses = activeTrips.reduce((s, t) => s + t.tripExpenses, 0);
    const totalOtherExpenses = otherExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const netProfit = totalRevenue - totalCommission - totalTripExpenses - totalOtherExpenses;

    res.json({
      truck,
      driverAssignments,
      trips: trips.map((t) => ({ ...t, loadedQty: t.loadedQty ? parseFloat(t.loadedQty) : null, deliveredQty: t.deliveredQty ? parseFloat(t.deliveredQty) : null, ratePerMt: t.ratePerMt ? parseFloat(t.ratePerMt) : null })),
      otherExpenses: otherExpenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })),
      summary: {
        totalTrips: activeTrips.length,
        totalRevenue,
        totalCommission,
        totalTripExpenses,
        totalOtherExpenses,
        netProfit,
      },
    });
  } catch (e) { next(e); }
});

// GET /trucks/:id/expenses — list non-trip expenses for a truck
router.get("/:id/expenses", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const expenses = await db
      .select()
      .from(tripExpensesTable)
      .where(and(eq(tripExpensesTable.truckId, id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck")))
      .orderBy(desc(tripExpensesTable.expenseDate));
    res.json(expenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (e) { next(e); }
});

const ALLOWED_COST_TYPES = ["maintenance", "tyres", "repairs", "fuel", "other"] as const;
const ALLOWED_CURRENCIES = ["USD", "ZAR", "ZMW", "MWK", "BWP"] as const;

// POST /trucks/:id/expenses — create a non-trip expense for a truck
router.post("/:id/expenses", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.id);
    if (isNaN(truckId)) return res.status(400).json({ error: "Invalid truck ID" });

    const { costType, description, amount, currency, expenseDate } = req.body;

    // Validate required fields
    if (!costType || !ALLOWED_COST_TYPES.includes(costType)) {
      return res.status(400).json({ error: `costType must be one of: ${ALLOWED_COST_TYPES.join(", ")}` });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }
    if (currency && !ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}` });
    }
    if (!expenseDate || isNaN(Date.parse(expenseDate))) {
      return res.status(400).json({ error: "expenseDate must be a valid date string" });
    }
    const bump = await bumpDateIfClosed(expenseDate);

    const [truck] = await db.select({ subcontractorId: trucksTable.subcontractorId }).from(trucksTable).where(eq(trucksTable.id, truckId));
    if (!truck) return res.status(404).json({ error: "Truck not found" });

    const [expense] = await db.insert(tripExpensesTable).values({
      truckId,
      subcontractorId: truck.subcontractorId,
      tripId: null,
      batchId: null,
      tier: "truck",
      costType,
      description: appendNote(description, bump.noteSuffix),
      amount: parsedAmount.toFixed(2),
      currency: currency ?? "USD",
      expenseDate: new Date(bump.effectiveDate),
      settled: false,
    }).returning();

    await logAudit(req, { action: "create", entity: "truck_expense", entityId: expense.id, description: `Added non-trip expense $${parsedAmount} (${costType}) to truck ${truckId}${bump.bumped ? ` [back-dated from ${bump.originalDate}]` : ""}`, metadata: { bumped: bump.bumped, originalDate: bump.originalDate, closedPeriod: bump.closedPeriodName } });
    res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount),
      posting: { date: bump.effectiveDate, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriodName: bump.closedPeriodName },
    });
  } catch (e) { next(e); }
});

// DELETE /trucks/:id/expenses/:expenseId — strictly scoped to non-trip truck expenses only
router.delete("/:id/expenses/:expenseId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.id);
    const expenseId = parseInt(req.params.expenseId);
    if (isNaN(truckId) || isNaN(expenseId)) return res.status(400).json({ error: "Invalid ID" });

    const [existing] = await db.select({ id: tripExpensesTable.id, expenseDate: tripExpensesTable.expenseDate }).from(tripExpensesTable).where(
      and(
        eq(tripExpensesTable.id, expenseId),
        eq(tripExpensesTable.truckId, truckId),
        isNull(tripExpensesTable.tripId),
        eq(tripExpensesTable.tier, "truck"),
      )
    );
    if (!existing) return res.status(404).json({ error: "Non-trip expense not found for this truck" });
    if (await blockIfClosed(res, existing.expenseDate)) return;

    await db.delete(tripExpensesTable).where(eq(tripExpensesTable.id, expenseId));
    await logAudit(req, { action: "delete", entity: "truck_expense", entityId: expenseId, description: `Deleted non-trip expense #${expenseId} from truck ${truckId}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /trucks/company-fleet/summary — aggregate P&L for all company-owned trucks
router.get("/company-fleet/summary", async (_req, res, next) => {
  try {
    const companyTrucks = await db
      .select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber, status: trucksTable.status })
      .from(trucksTable)
      .where(eq(trucksTable.companyOwned, true));

    let totalGross = 0, totalTripExpenses = 0, totalTruckExpenses = 0, totalNet = 0;
    const perTruck: any[] = [];

    for (const truck of companyTrucks) {
      const trips = await db.select({ id: tripsTable.id, status: tripsTable.status })
        .from(tripsTable).where(eq(tripsTable.truckId, truck.id));

      let truckGross = 0, truckTripExp = 0, truckNet = 0;
      for (const trip of trips) {
        if (["cancelled", "amended_out"].includes(trip.status)) continue;
        try {
          const fin = await calculateTripFinancials(trip.id);
          truckGross += (fin.grossRevenue ?? 0) - (fin.agentFeeTotal ?? 0);
          truckTripExp += fin.tripExpensesTotal ?? 0;
          truckNet += fin.netPayable ?? 0;
        } catch {}
      }

      const [expRow] = await db
        .select({ total: sql<string>`coalesce(sum(amount), 0)` })
        .from(tripExpensesTable)
        .where(and(eq(tripExpensesTable.truckId, truck.id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck")));
      const truckExpenses = parseFloat(expRow?.total ?? "0");

      totalGross += truckGross;
      totalTripExpenses += truckTripExp;
      totalTruckExpenses += truckExpenses;
      totalNet += truckNet - truckExpenses;
      perTruck.push({ id: truck.id, plateNumber: truck.plateNumber, status: truck.status, gross: truckGross, tripExpenses: truckTripExp, truckExpenses, net: truckNet - truckExpenses });
    }

    res.json({ totalGross, totalTripExpenses, totalTruckExpenses, totalNet, trucks: perTruck });
  } catch (e) { next(e); }
});

export default router;
