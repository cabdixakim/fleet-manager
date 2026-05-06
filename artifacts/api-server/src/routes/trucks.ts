import { Router } from "express";
import { db } from "@workspace/db";
import {
  trucksTable, subcontractorsTable, driversTable,
  truckDriverAssignmentsTable, tripsTable, batchesTable,
  tripExpensesTable,
} from "@workspace/db/schema";
import { eq, desc, and, isNull, inArray, sql, ne } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { calculateTripFinancials } from "../lib/financials";
import { blockIfClosed, bumpDateIfClosed, appendNote } from "../lib/financialPeriod";

const router = Router();

// GET /trucks — returns horses only (unit_type='horse') with their linked trailer info.
// GET /trucks?unitType=trailer — returns trailers with their assigned horse info.
router.get("/", async (req, res, next) => {
  try {
    const unitType = (req.query.unitType as string) ?? "horse";

    if (unitType === "trailer") {
      // Return trailers with their assigned horse plate
      const trailers = await db
        .select({
          id: trucksTable.id,
          plateNumber: trucksTable.plateNumber,
          status: trucksTable.status,
          notes: trucksTable.notes,
          currentHorseId: trucksTable.currentHorseId,
          unitType: trucksTable.unitType,
          createdAt: trucksTable.createdAt,
        })
        .from(trucksTable)
        .where(eq(trucksTable.unitType, "trailer"))
        .orderBy(trucksTable.plateNumber);

      if (trailers.length === 0) return res.json([]);

      // Fetch all horse plates we need
      const horseIds = trailers.map((t) => t.currentHorseId).filter(Boolean) as number[];
      const horsePlates: Record<number, string> = {};
      if (horseIds.length > 0) {
        const horses = await db
          .select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber })
          .from(trucksTable)
          .where(inArray(trucksTable.id, horseIds));
        horses.forEach((h) => { horsePlates[h.id] = h.plateNumber; });
      }

      return res.json(
        trailers.map((t) => ({
          ...t,
          horsePlate: t.currentHorseId ? (horsePlates[t.currentHorseId] ?? null) : null,
        }))
      );
    }

    // Default: horses
    const horses = await db
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
        unitType: trucksTable.unitType,
        createdAt: trucksTable.createdAt,
      })
      .from(trucksTable)
      .leftJoin(subcontractorsTable, eq(trucksTable.subcontractorId, subcontractorsTable.id))
      .where(eq(trucksTable.unitType, "horse"))
      .orderBy(trucksTable.plateNumber);

    if (horses.length === 0) return res.json([]);

    const horseIds = horses.map((h) => h.id);

    // Linked trailers (trailer.currentHorseId in horseIds)
    const linkedTrailers = await db
      .select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber, status: trucksTable.status, currentHorseId: trucksTable.currentHorseId })
      .from(trucksTable)
      .where(and(eq(trucksTable.unitType, "trailer"), inArray(trucksTable.currentHorseId as any, horseIds)));

    const trailerByHorse = new Map<number, { id: number; plateNumber: string; status: string }>();
    for (const t of linkedTrailers) {
      if (t.currentHorseId) trailerByHorse.set(t.currentHorseId, { id: t.id, plateNumber: t.plateNumber, status: t.status });
    }

    // Active trips per horse
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
      .where(and(
        inArray(tripsTable.truckId, horseIds),
        sql`${tripsTable.status} NOT IN ('delivered','completed','cancelled','amended_out')`
      ))
      .orderBy(desc(tripsTable.id));

    const activeByTruck = new Map<number, typeof activeTripsRaw[0]>();
    for (const t of activeTripsRaw) {
      if (t.truckId !== null && !activeByTruck.has(t.truckId)) activeByTruck.set(t.truckId, t);
    }

    const lastDeliveries = await db
      .select({ truckId: tripsTable.truckId, lastDeliveredAt: sql<string>`MAX(${tripsTable.deliveredAt})` })
      .from(tripsTable)
      .where(and(inArray(tripsTable.truckId, horseIds), sql`${tripsTable.status} IN ('delivered','completed')`))
      .groupBy(tripsTable.truckId);

    const lastDeliveryByTruck = new Map<number, string>(
      lastDeliveries.filter((d) => d.truckId !== null).map((d) => [d.truckId as number, d.lastDeliveredAt])
    );

    return res.json(
      horses.map((horse) => ({
        ...horse,
        linkedTrailer: trailerByHorse.get(horse.id) ?? null,
        activeTrip: activeByTruck.get(horse.id) ?? null,
        lastDeliveredAt: lastDeliveryByTruck.get(horse.id) ?? null,
      }))
    );
  } catch (e) { next(e); }
});

// POST /trucks — register a horse, trailer, or full unit (horse + trailer)
router.post("/", async (req, res, next) => {
  try {
    const { registering = "horse", plateNumber, trailerPlate, ...rest } = req.body;

    if (registering === "trailer") {
      // Create standalone trailer
      const plate = trailerPlate || plateNumber;
      if (!plate) return res.status(400).json({ error: "Trailer plate is required" });
      const [trailer] = await db.insert(trucksTable).values({
        unitType: "trailer",
        plateNumber: plate,
        status: rest.status ?? "available",
        notes: rest.notes ?? null,
        companyOwned: false,
        currentHorseId: rest.currentHorseId ?? null,
      }).returning();
      await logAudit(req, { action: "create", entity: "truck", entityId: trailer.id, description: `Registered trailer ${trailer.plateNumber}` });
      return res.status(201).json({ ...trailer, linkedTrailer: null, activeTrip: null, lastDeliveredAt: null });
    }

    // Create horse (with or without trailer)
    if (!plateNumber) return res.status(400).json({ error: "Plate number is required" });
    const [horse] = await db.insert(trucksTable).values({
      unitType: "horse",
      plateNumber,
      trailerPlate: trailerPlate || null,
      companyOwned: rest.companyOwned ?? false,
      subcontractorId: rest.subcontractorId ?? null,
      status: rest.status ?? "available",
      notes: rest.notes ?? null,
      currentLocation: rest.currentLocation ?? null,
    }).returning();

    let linkedTrailer: { id: number; plateNumber: string; status: string } | null = null;

    // If registering a full unit, also create the trailer
    if (registering === "unit" && trailerPlate) {
      const [trailer] = await db.insert(trucksTable).values({
        unitType: "trailer",
        plateNumber: trailerPlate,
        status: "available",
        companyOwned: false,
        currentHorseId: horse.id,
      }).returning();
      linkedTrailer = { id: trailer.id, plateNumber: trailer.plateNumber, status: trailer.status };
      await logAudit(req, { action: "create", entity: "truck", entityId: trailer.id, description: `Registered trailer ${trailer.plateNumber} (linked to horse ${horse.plateNumber})` });
    }

    const subId = horse.subcontractorId;
    const ownerLabel = horse.companyOwned ? "Company Fleet" : (subId ? (await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)).then((r) => r[0]?.name ?? "subcontractor")) : "unassigned");
    await logAudit(req, { action: "create", entity: "truck", entityId: horse.id, description: `Registered horse ${horse.plateNumber} (${ownerLabel})` });

    const [sub] = subId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)) : [null];
    return res.status(201).json({ ...horse, subcontractorName: sub?.name ?? null, linkedTrailer, activeTrip: null, lastDeliveredAt: null });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [truck] = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        unitType: trucksTable.unitType,
        currentHorseId: trucksTable.currentHorseId,
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

    // If it's a horse, include linked trailer
    let linkedTrailer = null;
    if (truck.unitType === "horse") {
      const [trailer] = await db.select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber, status: trucksTable.status })
        .from(trucksTable)
        .where(and(eq(trucksTable.unitType, "trailer"), eq(trucksTable.currentHorseId as any, truck.id)));
      linkedTrailer = trailer ?? null;
    }

    res.json({ ...truck, linkedTrailer });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select({ subcontractorId: trucksTable.subcontractorId, companyOwned: trucksTable.companyOwned, unitType: trucksTable.unitType }).from(trucksTable).where(eq(trucksTable.id, id));
    const [truck] = await db.update(trucksTable).set(req.body).where(eq(trucksTable.id, id)).returning();
    if (!truck) return res.status(404).json({ error: "Not found" });

    const isRetire = req.body.status === "retired";
    const ownershipChanged = req.body.companyOwned !== undefined && before?.companyOwned !== req.body.companyOwned;
    const isSubSwap = !ownershipChanged && req.body.subcontractorId != null && before?.subcontractorId !== req.body.subcontractorId;

    let description = isRetire ? `${truck.unitType === "trailer" ? "Trailer" : "Truck"} ${truck.plateNumber} retired` : `Updated ${truck.unitType === "trailer" ? "trailer" : "truck"} ${truck.plateNumber}`;
    let action = isRetire ? "status_change" : "update";
    let metadata: Record<string, any> = req.body.status ? { status: req.body.status } : {};

    if (ownershipChanged) {
      action = "ownership_transfer";
      description = truck.companyOwned
        ? `Truck ${truck.plateNumber} transferred from subcontractor to Company Fleet`
        : `Truck ${truck.plateNumber} transferred from Company Fleet to subcontractor`;
      metadata = { from: before?.companyOwned ? "company" : "subcontractor", to: truck.companyOwned ? "company" : "subcontractor" };
    } else if (isSubSwap) {
      action = "reassign";
      const [newSub] = truck.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId)) : [null];
      description = `Truck ${truck.plateNumber} reassigned to ${newSub?.name ?? "subcontractor"}`;
    }

    await logAudit(req, { action, entity: "truck", entityId: id, description, metadata });
    const [sub] = truck.subcontractorId ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId)) : [null];
    res.json({ ...truck, subcontractorName: sub?.name ?? null });
  } catch (e) { next(e); }
});

// PUT /trucks/:trailerId/assign-horse — reassign (or unassign) a trailer to a horse
router.put("/:id/assign-horse", async (req, res, next) => {
  try {
    const trailerId = parseInt(req.params.id);
    const { horseId } = req.body; // null to unassign
    const [trailer] = await db.select().from(trucksTable).where(and(eq(trucksTable.id, trailerId), eq(trucksTable.unitType, "trailer")));
    if (!trailer) return res.status(404).json({ error: "Trailer not found" });

    const prevHorseId = trailer.currentHorseId;

    // Update trailer's currentHorseId
    await db.update(trucksTable).set({ currentHorseId: horseId ?? null }).where(eq(trucksTable.id, trailerId));

    // Sync trailerPlate on the new horse
    if (horseId) {
      await db.update(trucksTable).set({ trailerPlate: trailer.plateNumber }).where(eq(trucksTable.id, horseId));
    }
    // Clear trailerPlate from the old horse if it matched
    if (prevHorseId && prevHorseId !== horseId) {
      await db.update(trucksTable).set({ trailerPlate: null }).where(and(eq(trucksTable.id, prevHorseId), eq(trucksTable.trailerPlate, trailer.plateNumber)));
    }

    await logAudit(req, { action: "reassign", entity: "truck", entityId: trailerId, description: horseId ? `Trailer ${trailer.plateNumber} reassigned to horse #${horseId}` : `Trailer ${trailer.plateNumber} unassigned` });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, id));
    if (!truck) return res.status(404).json({ error: "Truck not found" });

    const [tripCheck] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tripsTable)
      .where(eq(tripsTable.truckId, id));
    if (Number(tripCheck?.count ?? 0) > 0) {
      return res.status(409).json({ error: "This truck has trip history and cannot be deleted. Retire it instead." });
    }

    await db.delete(trucksTable).where(eq(trucksTable.id, id));
    await logAudit(req, { action: "delete", entity: "truck", entityId: id, description: `Deleted ${truck.unitType === "trailer" ? "trailer" : "truck"} ${truck.plateNumber}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /trucks/:id/detail — full horse profile
router.get("/:id/detail", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [truck] = await db
      .select({
        id: trucksTable.id,
        plateNumber: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        unitType: trucksTable.unitType,
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

    // Linked trailer
    const [linkedTrailer] = await db
      .select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber, status: trucksTable.status })
      .from(trucksTable)
      .where(and(eq(trucksTable.unitType, "trailer"), eq(trucksTable.currentHorseId as any, id)));

    const driverAssignments = await db
      .select({ id: truckDriverAssignmentsTable.id, driverId: truckDriverAssignmentsTable.driverId, driverName: driversTable.name, assignedAt: truckDriverAssignmentsTable.assignedAt, unassignedAt: truckDriverAssignmentsTable.unassignedAt })
      .from(truckDriverAssignmentsTable)
      .leftJoin(driversTable, eq(truckDriverAssignmentsTable.driverId, driversTable.id))
      .where(eq(truckDriverAssignmentsTable.truckId, id))
      .orderBy(desc(truckDriverAssignmentsTable.assignedAt));

    const rawTrips = await db
      .select({ id: tripsTable.id, status: tripsTable.status, loadedQty: tripsTable.loadedQty, deliveredQty: tripsTable.deliveredQty, product: tripsTable.product, createdAt: tripsTable.createdAt, batchName: batchesTable.name, route: batchesTable.route, ratePerMt: batchesTable.ratePerMt })
      .from(tripsTable)
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(eq(tripsTable.truckId, id))
      .orderBy(desc(tripsTable.createdAt));

    const trips = await Promise.all(rawTrips.map(async (t) => {
      try {
        const fin = await calculateTripFinancials(t.id);
        return { ...t, grossRevenue: (fin.grossRevenue ?? 0) - (fin.agentFeeTotal ?? 0), commission: fin.commission ?? 0, tripExpenses: fin.tripExpensesTotal ?? 0, netContribution: fin.netPayable ?? 0, shortQty: fin.shortQty, allowancePct: fin.allowancePct, allowanceQty: fin.allowanceQty, chargeableShort: fin.chargeableShort, shortCharge: fin.shortCharge, clientShortCharge: fin.clientShortCharge };
      } catch {
        return { ...t, grossRevenue: 0, commission: 0, tripExpenses: 0, netContribution: 0, shortQty: null, allowancePct: null, allowanceQty: null, chargeableShort: null, shortCharge: null, clientShortCharge: null };
      }
    }));

    const otherExpenses = await db.select().from(tripExpensesTable).where(and(eq(tripExpensesTable.truckId, id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck"))).orderBy(desc(tripExpensesTable.expenseDate));

    const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));
    const totalRevenue = activeTrips.reduce((s, t) => s + t.grossRevenue, 0);
    const totalCommission = activeTrips.reduce((s, t) => s + t.commission, 0);
    const totalTripExpenses = activeTrips.reduce((s, t) => s + t.tripExpenses, 0);
    const totalOtherExpenses = otherExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

    res.json({
      truck: { ...truck, linkedTrailer: linkedTrailer ?? null },
      driverAssignments,
      trips: trips.map((t) => ({ ...t, loadedQty: t.loadedQty ? parseFloat(t.loadedQty) : null, deliveredQty: t.deliveredQty ? parseFloat(t.deliveredQty) : null, ratePerMt: t.ratePerMt ? parseFloat(t.ratePerMt) : null })),
      otherExpenses: otherExpenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })),
      summary: { totalTrips: activeTrips.length, totalRevenue, totalCommission, totalTripExpenses, totalOtherExpenses, netProfit: totalRevenue - totalCommission - totalTripExpenses - totalOtherExpenses },
    });
  } catch (e) { next(e); }
});

// GET /trucks/:id/expenses
router.get("/:id/expenses", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const expenses = await db.select().from(tripExpensesTable).where(and(eq(tripExpensesTable.truckId, id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck"))).orderBy(desc(tripExpensesTable.expenseDate));
    res.json(expenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (e) { next(e); }
});

const ALLOWED_COST_TYPES = ["maintenance", "tyres", "repairs", "fuel", "other"] as const;
const ALLOWED_CURRENCIES = ["USD", "ZAR", "ZMW", "MWK", "BWP"] as const;

// POST /trucks/:id/expenses
router.post("/:id/expenses", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.id);
    if (isNaN(truckId)) return res.status(400).json({ error: "Invalid truck ID" });
    const { costType, description, amount, currency, expenseDate } = req.body;
    if (!costType || !ALLOWED_COST_TYPES.includes(costType)) return res.status(400).json({ error: `costType must be one of: ${ALLOWED_COST_TYPES.join(", ")}` });
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "amount must be a positive number" });
    if (currency && !ALLOWED_CURRENCIES.includes(currency)) return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}` });
    if (!expenseDate || isNaN(Date.parse(expenseDate))) return res.status(400).json({ error: "expenseDate must be a valid date string" });
    const bump = await bumpDateIfClosed(expenseDate);
    const [truck] = await db.select({ subcontractorId: trucksTable.subcontractorId }).from(trucksTable).where(eq(trucksTable.id, truckId));
    if (!truck) return res.status(404).json({ error: "Truck not found" });
    const [expense] = await db.insert(tripExpensesTable).values({ truckId, subcontractorId: truck.subcontractorId, tripId: null, batchId: null, tier: "truck", costType, description: appendNote(description, bump.noteSuffix), amount: parsedAmount.toFixed(2), currency: currency ?? "USD", expenseDate: new Date(bump.effectiveDate), settled: false }).returning();
    await logAudit(req, { action: "create", entity: "truck_expense", entityId: expense.id, description: `Added non-trip expense $${parsedAmount} (${costType}) to truck ${truckId}${bump.bumped ? ` [back-dated from ${bump.originalDate}]` : ""}`, metadata: { bumped: bump.bumped, originalDate: bump.originalDate } });
    res.status(201).json({ ...expense, amount: parseFloat(expense.amount), posting: { date: bump.effectiveDate, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriodName: bump.closedPeriodName } });
  } catch (e) { next(e); }
});

// DELETE /trucks/:id/expenses/:expenseId
router.delete("/:id/expenses/:expenseId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.id);
    const expenseId = parseInt(req.params.expenseId);
    if (isNaN(truckId) || isNaN(expenseId)) return res.status(400).json({ error: "Invalid ID" });
    const [existing] = await db.select({ id: tripExpensesTable.id, expenseDate: tripExpensesTable.expenseDate }).from(tripExpensesTable).where(and(eq(tripExpensesTable.id, expenseId), eq(tripExpensesTable.truckId, truckId), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck")));
    if (!existing) return res.status(404).json({ error: "Non-trip expense not found for this truck" });
    if (await blockIfClosed(res, existing.expenseDate)) return;
    await db.delete(tripExpensesTable).where(eq(tripExpensesTable.id, expenseId));
    await logAudit(req, { action: "delete", entity: "truck_expense", entityId: expenseId, description: `Deleted non-trip expense #${expenseId} from truck ${truckId}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /trucks/company-fleet/summary
router.get("/company-fleet/summary", async (_req, res, next) => {
  try {
    const companyTrucks = await db.select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber, status: trucksTable.status }).from(trucksTable).where(and(eq(trucksTable.companyOwned, true), eq(trucksTable.unitType, "horse")));
    let totalGross = 0, totalTripExpenses = 0, totalTruckExpenses = 0, totalNet = 0;
    const perTruck: any[] = [];
    for (const truck of companyTrucks) {
      const trips = await db.select({ id: tripsTable.id, status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.truckId, truck.id));
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
      const [expRow] = await db.select({ total: sql<string>`coalesce(sum(amount), 0)` }).from(tripExpensesTable).where(and(eq(tripExpensesTable.truckId, truck.id), isNull(tripExpensesTable.tripId), eq(tripExpensesTable.tier, "truck")));
      const truckExpenses = parseFloat(expRow?.total ?? "0");
      totalGross += truckGross; totalTripExpenses += truckTripExp; totalTruckExpenses += truckExpenses; totalNet += truckNet - truckExpenses;
      perTruck.push({ id: truck.id, plateNumber: truck.plateNumber, status: truck.status, gross: truckGross, tripExpenses: truckTripExp, truckExpenses, net: truckNet - truckExpenses });
    }
    res.json({ totalGross, totalTripExpenses, totalTruckExpenses, totalNet, trucks: perTruck });
  } catch (e) { next(e); }
});

export default router;
