import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  tripsTable,
  clearancesTable,
  clientTransactionsTable,
  subcontractorTransactionsTable,
  driversTable,
  clientsTable,
  subcontractorsTable,
  trucksTable,
  invoicesTable,
  tripExpensesTable,
} from "@workspace/db/schema";
import { eq, sql, inArray, notInArray, and, isNull, isNotNull } from "drizzle-orm";
import { calculateTripFinancials, REVENUE_RECOGNISED_STATUSES } from "../lib/financials";

const router = Router();

router.get("/metrics", async (_req, res, next) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [activeBatchesRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(batchesTable)
      .where(notInArray(batchesTable.status, ["delivered", "invoiced", "cancelled"]));

    const [trucksInTransitRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tripsTable)
      .where(inArray(tripsTable.status, ["in_transit", "at_zambia_entry", "at_drc_entry"]));

    const [pendingClearancesRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clearancesTable)
      .leftJoin(tripsTable, eq(clearancesTable.tripId, tripsTable.id))
      .where(and(
        inArray(clearancesTable.status, ["requested", "pending"]),
        inArray(tripsTable.status, ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"])
      ));

    const [uninvoicedRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(batchesTable)
      .where(eq(batchesTable.status, "delivered"));

    const [activeDriversRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(driversTable)
      .where(eq(driversTable.status, "active"));

    // Commission this month: sum of all trip net payables posted this month
    const deliveredTripIds = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
          sql`EXTRACT(MONTH FROM ${tripsTable.createdAt}) = ${month}`,
          sql`EXTRACT(YEAR FROM ${tripsTable.createdAt}) = ${year}`
        )
      );

    let commissionThisMonth = 0;
    for (const { id } of deliveredTripIds.slice(0, 100)) {
      try {
        const fin = await calculateTripFinancials(id);
        commissionThisMonth += fin.commission ?? 0;
      } catch {}
    }

    // Receivables: sum of outstanding invoice amounts (not paid or cancelled)
    const [receivablesRes] = await db
      .select({
        total: sql<string>`coalesce(sum(coalesce(net_revenue, gross_revenue)),0)`,
      })
      .from(invoicesTable)
      .where(sql`status NOT IN ('paid', 'cancelled')`);

    // Payables: compute from trip financials for all non-cancelled trips + subtract payments already made
    const allActiveTrips = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(notInArray(tripsTable.status, ["cancelled", "amended_out"]));

    let totalPayables = 0;
    for (const { id: tid } of allActiveTrips.slice(0, 200)) {
      try {
        const fin = await calculateTripFinancials(tid);
        totalPayables += fin.netPayable ?? 0;
      } catch {}
    }

    // Deduct non-trip truck expenses attributed to subcontractors (maintenance, tyres, repairs etc.)
    const [nonTripTruckExpRes] = await db
      .select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(tripExpensesTable)
      .where(and(isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck"), isNotNull(tripExpensesTable.subcontractorId)));
    totalPayables -= parseFloat(nonTripTruckExpRes?.total ?? "0");

    // Subtract payments already made to subcontractors
    const [paymentsMadeRes] = await db
      .select({
        total: sql<string>`coalesce(sum(case when type='payment_made' then amount when type='advance_given' then amount else 0 end),0)`,
      })
      .from(subcontractorTransactionsTable);
    totalPayables -= parseFloat(paymentsMadeRes.total ?? "0");

    const recentBatches = await db
      .select({
        id: batchesTable.id,
        name: batchesTable.name,
        clientId: batchesTable.clientId,
        clientName: clientsTable.name,
        route: batchesTable.route,
        status: batchesTable.status,
        ratePerMt: batchesTable.ratePerMt,
        nominatedDate: batchesTable.nominatedDate,
        loadedDate: batchesTable.loadedDate,
        deliveredDate: batchesTable.deliveredDate,
        cancellationReason: batchesTable.cancellationReason,
        notes: batchesTable.notes,
        createdAt: batchesTable.createdAt,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .orderBy(sql`${batchesTable.createdAt} desc`)
      .limit(5);

    const enrichedBatches = await Promise.all(
      recentBatches.map(async (b) => {
        const [tc] = await db.select({ count: sql<number>`count(*)` }).from(tripsTable).where(eq(tripsTable.batchId, b.id));
        const [ac] = await db.select({ count: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.batchId, b.id), notInArray(tripsTable.status, ["cancelled", "amended_out"])));
        return { ...b, ratePerMt: parseFloat(b.ratePerMt), truckCount: Number(tc.count), activeTrips: Number(ac.count) };
      })
    );

    res.json({
      activeBatches: Number(activeBatchesRes.count),
      trucksInTransit: Number(trucksInTransitRes.count),
      pendingClearances: Number(pendingClearancesRes.count),
      commissionThisMonth,
      totalReceivables: parseFloat(receivablesRes.total ?? "0"),
      totalPayables: Math.max(0, totalPayables),
      uninvoicedBatches: Number(uninvoicedRes.count),
      activeDrivers: Number(activeDriversRes.count),
      recentBatches: enrichedBatches,
    });
  } catch (e) { next(e); }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const { period = "month", year, month } = req.query;
    const currentYear = parseInt(year as string) || new Date().getFullYear();
    const currentMonth = parseInt(month as string) || new Date().getMonth() + 1;

    // Commission by period
    const deliveredTrips = await db
      .select({ id: tripsTable.id, createdAt: tripsTable.createdAt, batchId: tripsTable.batchId })
      .from(tripsTable)
      .where(eq(tripsTable.status, "delivered"));

    const monthlyData: Record<string, { label: string; commission: number; revenue: number; expenses: number }> = {};
    for (const t of deliveredTrips) {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyData[key]) monthlyData[key] = { label: key, commission: 0, revenue: 0, expenses: 0 };
      try {
        const fin = await calculateTripFinancials(t.id);
        monthlyData[key].commission += fin.commission ?? 0;
        monthlyData[key].revenue += fin.grossRevenue ?? 0;
        monthlyData[key].expenses += fin.tripExpensesTotal;
      } catch {}
    }

    const commissionByPeriod = Object.values(monthlyData).sort((a, b) => a.label.localeCompare(b.label)).slice(-12);

    // Revenue by route
    const batches = await db
      .select({ id: batchesTable.id, route: batchesTable.route, clientId: batchesTable.clientId, clientName: clientsTable.name })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id));

    const routeData: Record<string, { route: string; revenue: number; commission: number; trips: number }> = {};
    for (const b of batches) {
      const trips = await db.select({ id: tripsTable.id, status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.batchId, b.id));
      for (const t of trips.filter((t) => t.status === "delivered")) {
        const key = b.route;
        if (!routeData[key]) routeData[key] = { route: key, revenue: 0, commission: 0, trips: 0 };
        try {
          const fin = await calculateTripFinancials(t.id);
          routeData[key].revenue += fin.grossRevenue ?? 0;
          routeData[key].commission += fin.commission ?? 0;
          routeData[key].trips++;
        } catch {}
      }
    }

    // Revenue by client
    const clientData: Record<string, { clientName: string; revenue: number; commission: number }> = {};
    for (const b of batches) {
      const trips = await db.select({ id: tripsTable.id, status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.batchId, b.id));
      for (const t of trips.filter((t) => t.status === "delivered")) {
        const key = b.clientName ?? "Unknown";
        if (!clientData[key]) clientData[key] = { clientName: key, revenue: 0, commission: 0 };
        try {
          const fin = await calculateTripFinancials(t.id);
          clientData[key].revenue += fin.grossRevenue ?? 0;
          clientData[key].commission += fin.commission ?? 0;
        } catch {}
      }
    }

    res.json({
      commissionByPeriod,
      revenueByRoute: Object.values(routeData),
      revenueByClient: Object.values(clientData).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      shortsByProduct: [],
      topSubcontractors: [],
    });
  } catch (e) { next(e); }
});

router.get("/alerts", async (_req, res, next) => {
  try {
    const uninvoicedBatches = await db
      .select({
        id: batchesTable.id,
        name: batchesTable.name,
        clientName: clientsTable.name,
        deliveredDate: batchesTable.deliveredDate,
        route: batchesTable.route,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .where(eq(batchesTable.status, "delivered"))
      .orderBy(sql`${batchesTable.deliveredDate} asc`)
      .limit(10);

    const pendingClearances = await db
      .select({
        id: clearancesTable.id,
        type: clearancesTable.checkpoint,
        status: clearancesTable.status,
        createdAt: clearancesTable.createdAt,
        truckPlate: trucksTable.plateNumber,
        batchId: tripsTable.batchId,
      })
      .from(clearancesTable)
      .leftJoin(tripsTable, eq(clearancesTable.tripId, tripsTable.id))
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .where(and(
        inArray(clearancesTable.status, ["requested", "pending"]),
        inArray(tripsTable.status, ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"])
      ))
      .orderBy(sql`${clearancesTable.createdAt} asc`)
      .limit(10);

    const clearancesWithDays = pendingClearances.map((c) => ({
      ...c,
      daysWaiting: Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86400000),
    }));

    res.json({
      uninvoicedBatches,
      pendingClearances: clearancesWithDays,
    });
  } catch (e) { next(e); }
});

router.get("/active-ops", async (_req, res, next) => {
  try {
    const activeBatches = await db
      .select({
        id: batchesTable.id,
        name: batchesTable.name,
        clientName: clientsTable.name,
        route: batchesTable.route,
        status: batchesTable.status,
        createdAt: batchesTable.createdAt,
        nominatedDate: batchesTable.nominatedDate,
        loadedDate: batchesTable.loadedDate,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .where(notInArray(batchesTable.status, ["invoiced", "cancelled"]))
      .orderBy(sql`${batchesTable.createdAt} desc`)
      .limit(20);

    const enriched = await Promise.all(
      activeBatches.map(async (b) => {
        const trips = await db
          .select({ id: tripsTable.id, status: tripsTable.status })
          .from(tripsTable)
          .where(eq(tripsTable.batchId, b.id));

        const active = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));
        const counts: Record<string, number> = {};
        for (const t of active) {
          counts[t.status] = (counts[t.status] ?? 0) + 1;
        }

        const [clearanceCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(clearancesTable)
          .leftJoin(tripsTable, eq(clearancesTable.tripId, tripsTable.id))
          .where(and(eq(tripsTable.batchId, b.id), inArray(clearancesTable.status, ["requested", "pending"])));

        return {
          ...b,
          totalTrips: active.length,
          tripsByStatus: counts,
          pendingClearances: Number(clearanceCount?.count ?? 0),
        };
      })
    );

    res.json(enriched);
  } catch (e) { next(e); }
});

export default router;
