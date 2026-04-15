import { Router } from "express";
import { db } from "@workspace/db";
import {
  tripsTable,
  batchesTable,
  clientsTable,
  subcontractorsTable,
  trucksTable,
  driversTable,
  companyExpensesTable,
  tripExpensesTable,
  clientTransactionsTable,
  invoicesTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import { calculateTripFinancials, REVENUE_RECOGNISED_STATUSES } from "../lib/financials";

const router = Router();

function getPeriodRange(period: string, year: number, month?: number): { start: Date; end: Date } {
  const now = new Date();
  if (period === "month") {
    const m = (month ?? now.getMonth() + 1) - 1;
    return { start: new Date(year, m, 1), end: new Date(year, m + 1, 0, 23, 59, 59, 999) };
  }
  if (period === "quarter") {
    // `month` here encodes the quarter: 1=Q1, 2=Q2, 3=Q3, 4=Q4
    // If not supplied, default to current quarter
    const q = month != null ? (month - 1) : Math.floor(now.getMonth() / 3);
    return { start: new Date(year, q * 3, 1), end: new Date(year, q * 3 + 3, 0, 23, 59, 59, 999) };
  }
  if (period === "year") {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
  }
  return { start: new Date(2020, 0, 1), end: new Date(2099, 11, 31, 23, 59, 59, 999) };
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

router.get("/pnl", async (req, res, next) => {
  try {
    const { period = "month", year, month } = req.query;
    const currentYear = parseInt(year as string) || new Date().getFullYear();
    const currentMonth = parseInt(month as string) || undefined;
    const { start, end } = getPeriodRange(period as string, currentYear, currentMonth);

    const deliveredTrips = await db
      .select({ id: tripsTable.id, deliveredAt: tripsTable.deliveredAt, createdAt: tripsTable.createdAt, batchId: tripsTable.batchId, truckId: tripsTable.truckId })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
        // Filter by deliveredAt (accurate); fall back to createdAt for legacy trips with no stamp
        gte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, start),
        lte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, end),
      ));

    let totalGrossRevenue = 0;
    let totalCommission = 0;
    let totalTripExpenses = 0;
    let totalDriverSalaries = 0;
    let totalSubShortPenalties = 0;   // what we deduct from subs
    let totalClientShortCredits = 0;  // what clients deduct from us

    const monthlyMap: Record<string, { commission: number; tripExpenses: number; driverSalaries: number; overheads: number }> = {};
    const clientData: Record<string, { name: string; gross: number; commission: number; trips: number }> = {};
    const routeData: Record<string, { gross: number; commission: number; trips: number }> = {};
    const tripExpenseByCategory: Record<string, number> = {};

    for (const t of deliveredTrips) {
      try {
        const fin = await calculateTripFinancials(t.id);
        const g = fin.grossRevenue ?? 0;
        const c = fin.commission ?? 0;
        const te = fin.tripExpensesTotal ?? 0;
        const ds = fin.driverSalaryAllocation ?? 0;
        const subSc = fin.shortCharge ?? 0;
        const clientSc = fin.clientShortCharge ?? 0;

        totalGrossRevenue += g;
        totalCommission += c;
        totalTripExpenses += te;
        totalDriverSalaries += ds;
        totalSubShortPenalties += subSc;
        totalClientShortCredits += clientSc;

        const key = monthKey(new Date(t.deliveredAt ?? t.createdAt));
        if (!monthlyMap[key]) monthlyMap[key] = { commission: 0, tripExpenses: 0, driverSalaries: 0, overheads: 0 };
        monthlyMap[key].commission += c;
        monthlyMap[key].tripExpenses += te;
        monthlyMap[key].driverSalaries += ds;

        const [batch] = await db.select({ clientId: batchesTable.clientId, route: batchesTable.route }).from(batchesTable).where(eq(batchesTable.id, t.batchId));
        if (batch) {
          const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, batch.clientId));
          if (client) {
            if (!clientData[client.name]) clientData[client.name] = { name: client.name, gross: 0, commission: 0, trips: 0 };
            clientData[client.name].gross += g;
            clientData[client.name].commission += c;
            clientData[client.name].trips++;
          }
          const rk = batch.route ?? "Unknown";
          if (!routeData[rk]) routeData[rk] = { gross: 0, commission: 0, trips: 0 };
          routeData[rk].gross += g;
          routeData[rk].commission += c;
          routeData[rk].trips++;
        }

        const tripExpRows = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.tripId, t.id));
        for (const ex of tripExpRows) {
          const cat = ex.costType ?? "other";
          tripExpenseByCategory[cat] = (tripExpenseByCategory[cat] ?? 0) + parseFloat(ex.amount);
        }
      } catch {}
    }

    const overheadExpenses = await db.select().from(tripExpensesTable).where(
      and(eq(tripExpensesTable.tier, "overhead"), gte(tripExpensesTable.expenseDate, start), lte(tripExpensesTable.expenseDate, end))
    );
    const totalCompanyOverheads = overheadExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const companyExpByCategory: Record<string, number> = {};
    for (const e of overheadExpenses) {
      const key = monthKey(new Date(e.expenseDate));
      if (!monthlyMap[key]) monthlyMap[key] = { commission: 0, tripExpenses: 0, driverSalaries: 0, overheads: 0 };
      monthlyMap[key].overheads += parseFloat(e.amount);
      companyExpByCategory[e.costType] = (companyExpByCategory[e.costType] ?? 0) + parseFloat(e.amount);
    }

    // Non-trip truck expenses (tier = "truck") — e.g. maintenance, repairs — folded into overheads
    const truckExpenses = await db.select().from(tripExpensesTable).where(
      and(eq(tripExpensesTable.tier, "truck"), gte(tripExpensesTable.expenseDate, start), lte(tripExpensesTable.expenseDate, end))
    );
    const totalTruckOverheads = truckExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    for (const e of truckExpenses) {
      const key = monthKey(new Date(e.expenseDate));
      if (!monthlyMap[key]) monthlyMap[key] = { commission: 0, tripExpenses: 0, driverSalaries: 0, overheads: 0 };
      monthlyMap[key].overheads += parseFloat(e.amount);
      companyExpByCategory[`truck_${e.costType}`] = (companyExpByCategory[`truck_${e.costType}`] ?? 0) + parseFloat(e.amount);
    }

    // Combined overhead: company overheads + non-trip truck expenses
    const totalAllOverheads = totalCompanyOverheads + totalTruckOverheads;

    const totalExpenses = totalTripExpenses + totalDriverSalaries + totalAllOverheads;
    // Net short income = penalties collected from subs minus credits owed to clients
    const netShortIncome = totalSubShortPenalties - totalClientShortCredits;
    // Company income = commission + net short spread
    const totalCompanyIncome = totalCommission + netShortIncome;
    const netProfit = totalCompanyIncome - totalAllOverheads;

    const commissionByMonth = Object.entries(monthlyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, m]) => ({
        label,
        commission: m.commission,
        tripExpenses: m.tripExpenses,
        driverSalaries: m.driverSalaries,
        overheads: m.overheads,
        netProfit: m.commission - m.overheads,
      }));

    res.json({
      period: period as string,
      totalGrossRevenue,
      totalCommission,
      totalTripExpenses,
      totalDriverSalaries,
      totalCompanyOverheads: totalAllOverheads,
      totalTruckOverheads,
      totalExpenses,
      totalSubShortPenalties,
      totalClientShortCredits,
      netShortIncome,
      totalCompanyIncome,
      netProfit,
      commissionByMonth,
      expensesByCategory: [
        ...Object.entries(companyExpByCategory).map(([category, total]) => ({ category, total, type: "overhead" })),
        ...Object.entries(tripExpenseByCategory).map(([category, total]) => ({ category, total, type: "trip" })),
      ],
      byClient: Object.values(clientData).sort((a, b) => b.gross - a.gross),
      byRoute: Object.entries(routeData).map(([route, r]) => ({ route, ...r })),
    });
  } catch (e) { next(e); }
});

router.get("/commission", async (req, res, next) => {
  try {
    const { period = "month", year, month } = req.query;
    const currentYear = parseInt(year as string) || new Date().getFullYear();
    const currentMonth = parseInt(month as string) || undefined;
    const { start, end } = getPeriodRange(period as string, currentYear, currentMonth);

    const deliveredTrips = await db
      .select({ id: tripsTable.id, deliveredAt: tripsTable.deliveredAt, createdAt: tripsTable.createdAt, batchId: tripsTable.batchId, truckId: tripsTable.truckId, subcontractorId: tripsTable.subcontractorId })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
        gte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, start),
        lte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, end),
      ));

    let totalCommission = 0;
    let totalGrossRevenue = 0;
    const subData: Record<string, { name: string; rate: number; gross: number; commission: number; trips: number; netPayable: number; truckExpenses: number; subId: number }> = {};
    const batchData: Record<string, { name: string; client: string; route: string; gross: number; commission: number }> = {};
    const clientData: Record<string, { name: string; gross: number; commission: number; trips: number }> = {};
    const monthlyData: Record<string, number> = {};

    for (const t of deliveredTrips) {
      try {
        const fin = await calculateTripFinancials(t.id);
        const c = fin.commission ?? 0;
        const g = fin.grossRevenue ?? 0;
        const np = fin.netPayable ?? 0;
        totalCommission += c;
        totalGrossRevenue += g;

        const key = monthKey(new Date(t.deliveredAt ?? t.createdAt));
        monthlyData[key] = (monthlyData[key] ?? 0) + c;

        if (t.subcontractorId) {
          const [sub] = await db.select({ name: subcontractorsTable.name, commissionRate: subcontractorsTable.commissionRate }).from(subcontractorsTable).where(eq(subcontractorsTable.id, t.subcontractorId));
          if (sub) {
            if (!subData[sub.name]) subData[sub.name] = { name: sub.name, rate: parseFloat(sub.commissionRate), gross: 0, commission: 0, trips: 0, netPayable: 0, truckExpenses: 0, subId: t.subcontractorId };
            subData[sub.name].gross += g;
            subData[sub.name].commission += c;
            subData[sub.name].trips++;
            subData[sub.name].netPayable += np;
          }
        }

        const [batch] = await db.select({ name: batchesTable.name, clientId: batchesTable.clientId, route: batchesTable.route }).from(batchesTable).where(eq(batchesTable.id, t.batchId));
        if (batch) {
          const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, batch.clientId));
          const bk = `${t.batchId}`;
          if (!batchData[bk]) batchData[bk] = { name: batch.name, client: client?.name ?? "", route: batch.route ?? "", gross: 0, commission: 0 };
          batchData[bk].gross += g;
          batchData[bk].commission += c;

          if (client) {
            if (!clientData[client.name]) clientData[client.name] = { name: client.name, gross: 0, commission: 0, trips: 0 };
            clientData[client.name].gross += g;
            clientData[client.name].commission += c;
            clientData[client.name].trips++;
          }
        }
      } catch {}
    }

    // Deduct non-trip truck expenses per sub (in the same period) from their net payable
    for (const entry of Object.values(subData)) {
      const [expRow] = await db
        .select({ total: sql<string>`coalesce(sum(amount), 0)` })
        .from(tripExpensesTable)
        .where(and(
          eq(tripExpensesTable.subcontractorId, entry.subId),
          isNull(tripExpensesTable.tripId),
          eq(tripExpensesTable.tier, "truck"),
          gte(tripExpensesTable.expenseDate, start),
          lte(tripExpensesTable.expenseDate, end),
        ));
      entry.truckExpenses = parseFloat(expRow?.total ?? "0");
      entry.netPayable -= entry.truckExpenses;
    }

    res.json({
      period: period as string,
      totalCommission,
      totalGrossRevenue,
      commissionBySubcontractor: Object.values(subData).map((s) => ({
        subcontractorName: s.name,
        commissionRate: s.rate,
        grossRevenue: s.gross,
        commission: s.commission,
        trips: s.trips,
        truckExpenses: s.truckExpenses,
        netPayable: s.netPayable,
      })),
      commissionByBatch: Object.values(batchData).map((b) => ({
        batchName: b.name,
        clientName: b.client,
        route: b.route,
        grossRevenue: b.gross,
        commission: b.commission,
      })),
      commissionByClient: Object.values(clientData).sort((a, b) => b.gross - a.gross).map((c) => ({
        clientName: c.name,
        grossRevenue: c.gross,
        commission: c.commission,
        trips: c.trips,
        commissionRate: c.gross > 0 ? ((c.commission / c.gross) * 100).toFixed(2) : "0",
      })),
      monthlyTrend: Object.entries(monthlyData)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, commission]) => ({ label, commission })),
    });
  } catch (e) { next(e); }
});

router.get("/commission-breakdown", async (req, res, next) => {
  try {
    const { period = "month", year, month } = req.query;
    const currentYear = parseInt(year as string) || new Date().getFullYear();
    const currentMonth = parseInt(month as string) || undefined;
    const { start, end } = getPeriodRange(period as string, currentYear, currentMonth);

    const deliveredTrips = await db
      .select({
        id: tripsTable.id,
        batchId: tripsTable.batchId,
        truckId: tripsTable.truckId,
        subcontractorId: tripsTable.subcontractorId,
        product: tripsTable.product,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        deliveredAt: tripsTable.deliveredAt,
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
        gte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, start),
        lte(sql`coalesce(${tripsTable.deliveredAt}, ${tripsTable.createdAt})`, end),
      ));

    const rows = [];
    for (const t of deliveredTrips) {
      try {
        const fin = await calculateTripFinancials(t.id);

        // Skip trips with no revenue data
        if (fin.grossRevenue == null) continue;

        const [batch] = await db
          .select({ name: batchesTable.name, route: batchesTable.route, ratePerMt: batchesTable.ratePerMt })
          .from(batchesTable)
          .where(eq(batchesTable.id, t.batchId));

        const [truck] = await db
          .select({ plateNumber: trucksTable.plateNumber })
          .from(trucksTable)
          .where(eq(trucksTable.id, t.truckId));

        let subName = "";
        if (t.subcontractorId) {
          const [sub] = await db
            .select({ name: subcontractorsTable.name })
            .from(subcontractorsTable)
            .where(eq(subcontractorsTable.id, t.subcontractorId));
          subName = sub?.name ?? "";
        }

        const netShortIncome = (fin.shortCharge ?? 0) - (fin.clientShortCharge ?? 0);

        rows.push({
          tripId: t.id,
          batchName: batch?.name ?? `Batch #${t.batchId}`,
          route: batch?.route ?? "",
          product: t.product,
          truckPlate: truck?.plateNumber ?? "",
          subcontractorName: subName,
          deliveredDate: t.deliveredAt ?? t.createdAt,
          loadedQty: t.loadedQty ? parseFloat(t.loadedQty) : null,
          deliveredQty: t.deliveredQty ? parseFloat(t.deliveredQty) : null,
          ratePerMt: batch?.ratePerMt ? parseFloat(batch.ratePerMt) : null,
          grossRevenue: fin.grossRevenue,
          commissionRatePct: fin.commissionRatePct,
          commission: fin.commission,
          // Short charge detail
          shortQty: fin.shortQty,
          allowancePct: fin.allowancePct,
          allowanceQty: fin.allowanceQty,
          chargeableShort: fin.chargeableShort,
          subShortChargeRate: fin.subShortChargeRate,
          subPenalty: fin.shortCharge,
          clientShortChargeRate: fin.clientShortChargeRate,
          clientCredit: fin.clientShortCharge,
          netShortIncome: (fin.shortCharge != null || fin.clientShortCharge != null) ? netShortIncome : null,
        });
      } catch {}
    }

    res.json({ period: period as string, trips: rows });
  } catch (e) { next(e); }
});

function monthLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

router.get("/entity-list", async (req, res, next) => {
  try {
    const [trucks, subs, clients, drivers] = await Promise.all([
      db.select({ id: trucksTable.id, label: trucksTable.plateNumber, sub: subcontractorsTable.name })
        .from(trucksTable)
        .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, trucksTable.subcontractorId)),
      db.select({ id: subcontractorsTable.id, label: subcontractorsTable.name }).from(subcontractorsTable),
      db.select({ id: clientsTable.id, label: clientsTable.name }).from(clientsTable),
      db.select({ id: driversTable.id, label: driversTable.name }).from(driversTable),
    ]);
    res.json({ trucks, subcontractors: subs, clients, drivers });
  } catch (e) { next(e); }
});

router.get("/entity-analytics", async (req, res, next) => {
  try {
    const { entity, ids, period = "all", year, month } = req.query as Record<string, string>;
    const entityIds = (ids ?? "").split(",").map(Number).filter(Boolean);
    if (!entity || entityIds.length === 0) return res.json({ entity, entities: [] });

    const currentYear = parseInt(year) || new Date().getFullYear();
    const currentMonth = parseInt(month) || undefined;
    const { start, end } = getPeriodRange(period, currentYear, currentMonth);

    const allTrips = await db
      .select({
        id: tripsTable.id,
        batchId: tripsTable.batchId,
        truckId: tripsTable.truckId,
        driverId: tripsTable.driverId,
        product: tripsTable.product,
        status: tripsTable.status,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        createdAt: tripsTable.createdAt,
        ratePerMt: batchesTable.ratePerMt,
        subId: tripsTable.subcontractorId,
      })
      .from(tripsTable)
      .innerJoin(batchesTable, eq(batchesTable.id, tripsTable.batchId))
      .innerJoin(trucksTable, eq(trucksTable.id, tripsTable.truckId))
      .where(and(gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end)));

    const allExpenses = await db
      .select({
        tripId: tripExpensesTable.tripId,
        truckId: tripExpensesTable.truckId,
        subId: tripExpensesTable.subcontractorId,
        amount: tripExpensesTable.amount,
      })
      .from(tripExpensesTable)
      .where(and(gte(tripExpensesTable.expenseDate, start), lte(tripExpensesTable.expenseDate, end)));

    if (entity === "truck") {
      const trucks = await db
        .select({ id: trucksTable.id, name: trucksTable.plateNumber, sub: subcontractorsTable.name })
        .from(trucksTable)
        .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, trucksTable.subcontractorId))
        .where(inArray(trucksTable.id, entityIds));

      const result = trucks.map((truck) => {
        const trips = allTrips.filter((t) => t.truckId === truck.id);
        const expenses = allExpenses.filter((e) => e.truckId === truck.id);
        const delivered = trips.filter((t) => t.status === "delivered");
        const totalLoaded = delivered.reduce((s, t) => s + parseFloat(t.loadedQty ?? "0"), 0);
        const totalDelivered = delivered.reduce((s, t) => s + parseFloat(t.deliveredQty ?? "0"), 0);
        // Revenue is based on loaded qty (what the client is charged for), not delivered qty
        const revenue = delivered.reduce((s, t) => s + parseFloat(t.loadedQty ?? "0") * parseFloat(t.ratePerMt ?? "0"), 0);
        const expTotal = expenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
        const trend = buildMonthlyTrend(delivered, (t) => parseFloat(t.loadedQty ?? "0") * parseFloat(t.ratePerMt ?? "0"));
        return {
          id: truck.id, name: truck.name, subName: truck.sub ?? "",
          metrics: {
            tripsCompleted: delivered.length,
            tripsCancelled: trips.filter((t) => t.status === "cancelled").length,
            agoTrips: delivered.filter((t) => t.product === "AGO").length,
            pmsTrips: delivered.filter((t) => t.product === "PMS").length,
            totalLoaded: round2(totalLoaded),
            totalDelivered: round2(totalDelivered),
            shortMT: round2(totalLoaded - totalDelivered),
            deliveryRate: totalLoaded > 0 ? round2((totalDelivered / totalLoaded) * 100) : 100,
            revenue: round2(revenue),
            expenses: round2(expTotal),
          },
          trend,
        };
      });
      return res.json({ entity, entities: result });
    }

    if (entity === "subcontractor") {
      const subs = await db.select().from(subcontractorsTable).where(inArray(subcontractorsTable.id, entityIds));

      // Use calculateTripFinancials per trip so commission uses snapshotted rates (not live rates),
      // handles rate_differential model, agent fees and short penalties correctly.
      const result = await Promise.all(subs.map(async (sub) => {
        const trips = allTrips.filter((t) => t.subId === sub.id);
        const expenses = allExpenses.filter((e) => e.subId === sub.id);
        const delivered = trips.filter((t) => REVENUE_RECOGNISED_STATUSES.includes(t.status) && t.status !== "amended_out");

        let totalLoaded = 0;
        let totalDelivered = 0;
        let grossRevenue = 0;
        let commission = 0;
        let netPayable = 0;

        for (const t of delivered) {
          try {
            const fin = await calculateTripFinancials(t.id);
            totalLoaded += parseFloat(t.loadedQty ?? "0");
            totalDelivered += parseFloat(t.deliveredQty ?? "0");
            grossRevenue += fin.grossRevenue ?? 0;
            commission += fin.commission ?? 0;
            netPayable += fin.netPayable ?? 0;
          } catch {}
        }

        const expTotal = expenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
        const trend = buildMonthlyTrend(
          delivered.filter((t) => t.status === "delivered"),
          (t) => parseFloat(t.loadedQty ?? "0") * parseFloat(t.ratePerMt ?? "0"),
        );
        return {
          id: sub.id, name: sub.name, subName: `${sub.commissionRate}% commission`,
          metrics: {
            tripsCompleted: delivered.filter((t) => t.status === "delivered").length,
            tripsCancelled: trips.filter((t) => t.status === "cancelled").length,
            totalLoaded: round2(totalLoaded),
            totalDelivered: round2(totalDelivered),
            shortMT: round2(totalLoaded - totalDelivered),
            deliveryRate: totalLoaded > 0 ? round2((totalDelivered / totalLoaded) * 100) : 100,
            grossRevenue: round2(grossRevenue),
            commission: round2(commission),
            expenses: round2(expTotal),
            netPayable: round2(netPayable),
          },
          trend,
        };
      }));
      return res.json({ entity, entities: result });
    }

    if (entity === "client") {
      const cls = await db.select().from(clientsTable).where(inArray(clientsTable.id, entityIds));
      const invs = await db.select().from(invoicesTable).where(
        and(inArray(invoicesTable.clientId, entityIds), gte(invoicesTable.issuedDate, start), lte(invoicesTable.issuedDate, end))
      );
      const txns = await db.select().from(clientTransactionsTable).where(
        and(inArray(clientTransactionsTable.clientId, entityIds), gte(clientTransactionsTable.transactionDate, start), lte(clientTransactionsTable.transactionDate, end))
      );

      const result = cls.map((client) => {
        const clientInvs = invs.filter((i) => i.clientId === client.id);
        const clientTxns = txns.filter((t) => t.clientId === client.id);
        const totalInvoiced = clientInvs.reduce((s, i) => s + parseFloat(i.netRevenue ?? "0"), 0);
        const totalPaid = clientTxns.filter((t) => t.type === "payment").reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0);
        const advances = clientTxns.filter((t) => t.type === "advance").reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0);
        const outstanding = totalInvoiced - totalPaid;
        const totalLoaded = clientInvs.reduce((s, i) => s + parseFloat(i.totalLoadedQty ?? "0"), 0);
        const totalDelivered = clientInvs.reduce((s, i) => s + parseFloat(i.totalDeliveredQty ?? "0"), 0);
        const trend = clientInvs.map((inv) => ({
          month: monthLabel(new Date(inv.issuedDate!)),
          revenue: parseFloat(inv.netRevenue ?? "0"),
        }));
        return {
          id: client.id, name: client.name, subName: client.country ?? "",
          metrics: {
            batches: clientInvs.length,
            totalLoaded: round2(totalLoaded),
            totalDelivered: round2(totalDelivered),
            deliveryRate: totalLoaded > 0 ? round2((totalDelivered / totalLoaded) * 100) : 100,
            invoiced: round2(totalInvoiced),
            paid: round2(totalPaid),
            advances: round2(advances),
            outstanding: round2(outstanding),
          },
          trend,
        };
      });
      return res.json({ entity, entities: result });
    }

    if (entity === "driver") {
      const drvs = await db.select().from(driversTable).where(inArray(driversTable.id, entityIds));

      const result = drvs.map((drv) => {
        const trips = allTrips.filter((t) => t.driverId === drv.id);
        const delivered = trips.filter((t) => t.status === "delivered");
        const totalLoaded = delivered.reduce((s, t) => s + parseFloat(t.loadedQty ?? "0"), 0);
        const totalDelivered = delivered.reduce((s, t) => s + parseFloat(t.deliveredQty ?? "0"), 0);
        const trend = buildMonthlyTrend(delivered, (t) => parseFloat(t.deliveredQty ?? "0"));
        return {
          id: drv.id, name: drv.name, subName: drv.licenseNumber ?? "",
          metrics: {
            tripsCompleted: delivered.length,
            tripsCancelled: trips.filter((t) => t.status === "cancelled").length,
            agoTrips: delivered.filter((t) => t.product === "AGO").length,
            pmsTrips: delivered.filter((t) => t.product === "PMS").length,
            totalLoaded: round2(totalLoaded),
            totalDelivered: round2(totalDelivered),
            shortMT: round2(totalLoaded - totalDelivered),
            deliveryRate: totalLoaded > 0 ? round2((totalDelivered / totalLoaded) * 100) : 100,
          },
          trend,
        };
      });
      return res.json({ entity, entities: result });
    }

    res.json({ entity, entities: [] });
  } catch (e) { next(e); }
});

function round2(n: number) { return Math.round(n * 100) / 100; }

function buildMonthlyTrend(
  trips: { createdAt: Date; }[],
  valueFn: (t: any) => number
): { month: string; value: number; trips: number }[] {
  const map: Record<string, { value: number; trips: number }> = {};
  for (const t of trips) {
    const key = monthKey(new Date(t.createdAt));
    const label = monthLabel(new Date(t.createdAt));
    if (!map[key]) map[key] = { value: 0, trips: 0 };
    map[key].value += valueFn(t as any);
    map[key].trips += 1;
  }
  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v], i) => ({ month: Object.keys(map).sort()[i], ...v, value: round2(v.value) }));
}

export default router;
