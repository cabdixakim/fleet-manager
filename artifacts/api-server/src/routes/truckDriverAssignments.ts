import { Router } from "express";
import { db } from "../lib/db";
import { truckDriverAssignmentsTable, driversTable, trucksTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

// GET engagements for a truck
router.get("/", async (req, res) => {
  const truckId = Number(req.query.truckId);
  if (!truckId) return res.status(400).json({ error: "Missing truckId" });
  const engagements = await db
    .select({
      id: truckDriverAssignmentsTable.id,
      driverId: truckDriverAssignmentsTable.driverId,
      assignedAt: truckDriverAssignmentsTable.assignedAt,
      unassignedAt: truckDriverAssignmentsTable.unassignedAt,
      driverName: driversTable.name,
    })
    .from(truckDriverAssignmentsTable)
    .leftJoin(driversTable, eq(truckDriverAssignmentsTable.driverId, driversTable.id))
    .where(eq(truckDriverAssignmentsTable.truckId, truckId))
    .orderBy(truckDriverAssignmentsTable.assignedAt);
  return res.json(engagements);
});

// GET all current assignments for all trucks
router.get("/all-current", async (_req, res) => {
  const rows = await db
    .select({
      truckId: truckDriverAssignmentsTable.truckId,
      driverId: truckDriverAssignmentsTable.driverId,
      driverName: driversTable.name,
      assignedAt: truckDriverAssignmentsTable.assignedAt,
    })
    .from(truckDriverAssignmentsTable)
    .leftJoin(driversTable, eq(truckDriverAssignmentsTable.driverId, driversTable.id))
    .where(sql`${truckDriverAssignmentsTable.unassignedAt} IS NULL`);
  res.json(rows);
});

// POST engage driver to truck
router.post("/", async (req, res) => {
  const { truckId, driverId } = req.body;
  if (!truckId || !driverId) return res.status(400).json({ error: "Missing truckId or driverId" });

  // End previous engagement if exists
  await db.update(truckDriverAssignmentsTable)
    .set({ unassignedAt: new Date() })
    .where(and(
      eq(truckDriverAssignmentsTable.truckId, truckId),
      sql`${truckDriverAssignmentsTable.unassignedAt} IS NULL`,
    ));

  // Create new engagement
  const [engagement] = await db.insert(truckDriverAssignmentsTable).values({ truckId, driverId, assignedAt: new Date() }).returning();

  // Fetch names for a meaningful log
  const [driver] = await db.select({ name: driversTable.name }).from(driversTable).where(eq(driversTable.id, driverId));
  const [truck] = await db.select({ plateNumber: trucksTable.plateNumber }).from(trucksTable).where(eq(trucksTable.id, truckId));

  await logAudit(req as any, {
    action: "update",
    entity: "truck",
    entityId: truckId,
    description: `Driver assigned to truck ${truck?.plateNumber ?? `#${truckId}`}: ${driver?.name ?? `driver #${driverId}`}`,
    metadata: { truckId, driverId, driverName: driver?.name, truckPlate: truck?.plateNumber },
  });

  return res.json(engagement);
});

export default router;
