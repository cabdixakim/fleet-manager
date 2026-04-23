import { Router } from "express";
import { db } from "@workspace/db";
import { clearancesTable, tripsTable, trucksTable, batchesTable, tripCheckpointsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/board", async (_req, res, next) => {
  try {
    // Fetch all trips that are in any active state (include dynamic at_checkpoint_N via status prefix)
    const allActiveTrips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
        truckPlate: trucksTable.plateNumber,
        batchName: batchesTable.name,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id));

    const activeTrips = allActiveTrips.filter((t) => {
      const legacyActive = ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"].includes(t.status);
      const dynamicActive = /^at_checkpoint_\d+$/.test(t.status) ||
        ["loading", "loaded", "in_transit"].includes(t.status);
      return legacyActive || dynamicActive;
    });

    const board = await Promise.all(
      activeTrips.map(async (t) => {
        const [clearances, checkpoints] = await Promise.all([
          db.select().from(clearancesTable).where(eq(clearancesTable.tripId, t.id)),
          db.select().from(tripCheckpointsTable).where(eq(tripCheckpointsTable.tripId, t.id)).orderBy(tripCheckpointsTable.seq),
        ]);

        let checkpointGroups: Array<{ key: string; label: string; country: string | null; docs: typeof clearances }>;

        if (checkpoints.length > 0) {
          // Dynamic: group by checkpoint_N keys
          checkpointGroups = checkpoints.map((cp) => ({
            key: `checkpoint_${cp.seq}`,
            label: `${cp.name}${cp.documentType ? ` (${cp.documentType})` : ""}`,
            country: cp.country,
            docs: clearances.filter((c) => c.checkpoint === `checkpoint_${cp.seq}`),
          }));
        } else {
          // Legacy fallback: hardcoded Zambia/DRC grouping
          checkpointGroups = [
            { key: "zambia_entry", label: "Zambia Entry (T1)", country: "ZM", docs: clearances.filter((c) => c.checkpoint === "zambia_entry") },
            { key: "drc_entry", label: "DRC Entry (TR8)", country: "CD", docs: clearances.filter((c) => c.checkpoint === "drc_entry") },
          ];
        }

        return {
          tripId: t.id,
          truckPlate: t.truckPlate,
          batchName: t.batchName,
          tripStatus: t.status,
          checkpointGroups,
          // Backward-compat keys so existing consumers don't break
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
