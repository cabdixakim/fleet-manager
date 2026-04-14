import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  clientsTable,
  tripsTable,
  trucksTable,
  driversTable,
  subcontractorsTable,
  companySettingsTable,
} from "@workspace/db/schema";
import { eq, notInArray, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const batches = await db
      .select({
        id: batchesTable.id,
        name: batchesTable.name,
        clientName: clientsTable.name,
        route: batchesTable.route,
        status: batchesTable.status,
        ratePerMt: batchesTable.ratePerMt,
        nominatedDate: batchesTable.nominatedDate,
        createdAt: batchesTable.createdAt,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .where(notInArray(batchesTable.status, ["invoiced", "cancelled"]))
      .orderBy(sql`${batchesTable.createdAt} desc`);

    const enriched = await Promise.all(
      batches.map(async (b) => {
        const [tc] = await db
          .select({ count: sql<number>`count(*)` })
          .from(tripsTable)
          .where(eq(tripsTable.batchId, b.id));
        return { ...b, ratePerMt: parseFloat(b.ratePerMt), truckCount: Number(tc.count) };
      })
    );

    res.json(enriched);
  } catch (e) { next(e); }
});

router.get("/:batchId", async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.batchId);

    const [batch] = await db
      .select({
        id: batchesTable.id,
        name: batchesTable.name,
        clientId: batchesTable.clientId,
        clientName: clientsTable.name,
        route: batchesTable.route,
        status: batchesTable.status,
        ratePerMt: batchesTable.ratePerMt,
        nominatedDate: batchesTable.nominatedDate,
        notes: batchesTable.notes,
        createdAt: batchesTable.createdAt,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .where(eq(batchesTable.id, batchId));

    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const trips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
        product: tripsTable.product,
        capacity: tripsTable.capacity,
        truckId: tripsTable.truckId,
        truckPlate: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        driverId: tripsTable.driverId,
        driverName: driversTable.name,
        driverPassport: driversTable.passportNumber,
        driverLicense: driversTable.licenseNumber,
        driverPhone: driversTable.phone,
        subcontractorName: subcontractorsTable.name,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
      .leftJoin(subcontractorsTable, eq(tripsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(tripsTable.batchId, batchId));

    const allTrips = trips.map((t) => ({
      ...t,
      capacity: parseFloat(t.capacity),
    }));

    const activeTrips = allTrips.filter((t) => !["cancelled", "amended_out"].includes(t.status));
    const totalCapacity = activeTrips.reduce((s, t) => s + t.capacity, 0);

    const [company] = await db.select().from(companySettingsTable).limit(1);

    res.json({
      batch: { ...batch, ratePerMt: parseFloat(batch.ratePerMt) },
      trips: allTrips,
      totalTrips: activeTrips.length,
      totalCapacity,
      company: company ?? null,
    });
  } catch (e) { next(e); }
});

export default router;
