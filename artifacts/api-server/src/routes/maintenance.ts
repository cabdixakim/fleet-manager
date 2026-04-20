import { Router } from "express";
import { db } from "@workspace/db";
import { truckMaintenanceTable, trucksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { postJournalEntry, deleteJournalEntriesForReference } from "../lib/glPosting";

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

    // GL: DR 5005 Vehicle Maintenance / CR 2000 Accounts Payable
    // Only post if cost is provided and in USD (or a meaningful amount)
    if (cost && parseFloat(cost) > 0) {
      const costUsd = parseFloat(cost);
      postJournalEntry({
        description: `${type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")} — ${description}`,
        entryDate: new Date(date),
        referenceType: "maintenance",
        referenceId: row.id,
        lines: [
          { accountCode: "5005", debit: costUsd, description: `${description} (${currency ?? "USD"})` },
          { accountCode: "2000", credit: costUsd, description: mechanic ?? "Maintenance payable" },
        ],
      }).catch(() => {});
    }

    res.status(201).json(row);
  } catch (err) { next(err); }
});

// DELETE /api/maintenance/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    // Reverse GL entry if it exists
    await deleteJournalEntriesForReference("maintenance", id);
    await db.delete(truckMaintenanceTable).where(eq(truckMaintenanceTable.id, id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
