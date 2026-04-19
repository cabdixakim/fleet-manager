import { Router } from "express";
import { db } from "@workspace/db";
import { truckMaintenanceTable, trucksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /api/maintenance/trucks/:truckId — list all maintenance for a truck
router.get("/trucks/:truckId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.truckId);
    const rows = await db
      .select()
      .from(truckMaintenanceTable)
      .where(eq(truckMaintenanceTable.truckId, truckId))
      .orderBy(desc(truckMaintenanceTable.date), desc(truckMaintenanceTable.id));
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/maintenance/trucks/:truckId — create a maintenance entry
router.post("/trucks/:truckId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.truckId);
    const { date, type, description, cost, currency, odometer, mechanic, nextServiceDate } = req.body;
    if (!date || !type || !description) {
      return res.status(400).json({ error: "date, type and description are required" });
    }
    const [row] = await db
      .insert(truckMaintenanceTable)
      .values({
        truckId,
        date,
        type,
        description,
        cost: cost ? String(cost) : null,
        currency: currency ?? "USD",
        odometer: odometer ? parseInt(odometer) : null,
        mechanic: mechanic ?? null,
        nextServiceDate: nextServiceDate ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// DELETE /api/maintenance/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(truckMaintenanceTable).where(eq(truckMaintenanceTable.id, id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
