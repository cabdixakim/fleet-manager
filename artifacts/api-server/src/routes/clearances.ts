import { Router } from "express";
import { db } from "@workspace/db";
import { clearancesTable, tripsTable, trucksTable, batchesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/board", async (_req, res, next) => {
  try {
    const activeTrips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
        truckPlate: trucksTable.plateNumber,
        batchName: batchesTable.name,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(inArray(tripsTable.status, ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"]));

    const board = await Promise.all(
      activeTrips.map(async (t) => {
        const clearances = await db.select().from(clearancesTable).where(eq(clearancesTable.tripId, t.id));
        return {
          tripId: t.id,
          truckPlate: t.truckPlate,
          batchName: t.batchName,
          tripStatus: t.status,
          zambiaEntry: clearances.filter((c) => c.checkpoint === "zambia_entry"),
          drcEntry: clearances.filter((c) => c.checkpoint === "drc_entry"),
        };
      })
    );

    res.json(board);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(clearancesTable).where(eq(clearancesTable.id, id));

    const { status, documentNumber, notes, documentUrl } = req.body;
    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (documentNumber !== undefined) updates.documentNumber = documentNumber;
    if (notes !== undefined) updates.notes = notes;
    if (documentUrl !== undefined) updates.documentUrl = documentUrl;
    if (status === "approved") updates.approvedAt = new Date();
    if (status === "requested" || status === "pending") updates.approvedAt = null;

    const [clearance] = await db
      .update(clearancesTable)
      .set(updates)
      .where(eq(clearancesTable.id, id))
      .returning();
    if (!clearance) return res.status(404).json({ error: "Not found" });

    const isStatusChange = status !== undefined && before?.status !== status;
    const checkpoint = clearance.checkpoint?.replace(/_/g, " ") ?? "?";
    await logAudit(req, {
      action: isStatusChange ? "status_change" : "update",
      entity: "clearance",
      entityId: id,
      description: isStatusChange
        ? `${clearance.documentType} clearance at ${checkpoint} ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : `set to ${status}`} — trip #${clearance.tripId}`
        : `Clearance #${id} updated (${clearance.documentType} — ${checkpoint}, trip #${clearance.tripId})${documentNumber ? ` — doc# ${documentNumber}` : ""}`,
      metadata: {
        tripId: clearance.tripId,
        checkpoint: clearance.checkpoint,
        documentType: clearance.documentType,
        ...(isStatusChange ? { from: before?.status, to: status } : {}),
        ...(documentNumber ? { documentNumber } : {}),
      },
    });

    res.json(clearance);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [clearance] = await db.select().from(clearancesTable).where(eq(clearancesTable.id, id));
    await db.delete(clearancesTable).where(eq(clearancesTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "clearance",
      entityId: id,
      description: `Deleted ${clearance?.documentType ?? "clearance"} (${clearance?.checkpoint?.replace(/_/g, " ") ?? "?"}) for trip #${clearance?.tripId ?? "?"}`,
      metadata: { tripId: clearance?.tripId, documentType: clearance?.documentType, checkpoint: clearance?.checkpoint },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
