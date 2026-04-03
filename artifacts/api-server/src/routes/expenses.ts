import { Router } from "express";
import { db } from "@workspace/db";
import {
  tripExpensesTable, tripsTable, batchesTable, trucksTable,
  subcontractorsTable, clientsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { batchId, truckId, subcontractorId, tier, settled, tripId } = req.query;

    const rows = await db
      .select({
        id: tripExpensesTable.id,
        tripId: tripExpensesTable.tripId,
        batchId: tripExpensesTable.batchId,
        truckId: tripExpensesTable.truckId,
        subcontractorId: tripExpensesTable.subcontractorId,
        tier: tripExpensesTable.tier,
        costType: tripExpensesTable.costType,
        description: tripExpensesTable.description,
        amount: tripExpensesTable.amount,
        currency: tripExpensesTable.currency,
        expenseDate: tripExpensesTable.expenseDate,
        settled: tripExpensesTable.settled,
        createdAt: tripExpensesTable.createdAt,
        batchName: batchesTable.name,
        truckPlate: trucksTable.plateNumber,
        subcontractorName: subcontractorsTable.name,
        clientName: clientsTable.name,
      })
      .from(tripExpensesTable)
      .leftJoin(tripsTable, eq(tripExpensesTable.tripId, tripsTable.id))
      .leftJoin(batchesTable, eq(
        sql`coalesce(${tripExpensesTable.batchId}, ${tripsTable.batchId})`,
        batchesTable.id
      ))
      .leftJoin(trucksTable, eq(
        sql`coalesce(${tripExpensesTable.truckId}, ${tripsTable.truckId})`,
        trucksTable.id
      ))
      .leftJoin(subcontractorsTable, eq(
        sql`coalesce(${tripExpensesTable.subcontractorId}, ${trucksTable.subcontractorId})`,
        subcontractorsTable.id
      ))
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .orderBy(desc(tripExpensesTable.expenseDate));

    let filtered = rows;
    if (tripId) filtered = filtered.filter((r) => r.tripId === parseInt(tripId as string));
    if (batchId) filtered = filtered.filter((r) => r.batchId === parseInt(batchId as string) || (r.tripId != null));
    if (truckId) filtered = filtered.filter((r) => r.truckId === parseInt(truckId as string));
    if (subcontractorId) filtered = filtered.filter((r) => r.subcontractorId === parseInt(subcontractorId as string));
    if (tier) filtered = filtered.filter((r) => r.tier === tier);
    if (settled === "true") filtered = filtered.filter((r) => r.settled === true);
    if (settled === "false") filtered = filtered.filter((r) => r.settled === false);

    res.json(filtered.map((r) => ({ ...r, amount: parseFloat(r.amount) })));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const body = req.body;
    let { tripId, batchId, truckId, subcontractorId, tier, costType, description, amount, currency, expenseDate, settled } = body;

    if (tier === "trip" && batchId && truckId && !tripId) {
      const [trip] = await db
        .select({ id: tripsTable.id })
        .from(tripsTable)
        .where(and(eq(tripsTable.batchId, parseInt(batchId)), eq(tripsTable.truckId, parseInt(truckId))))
        .limit(1);
      if (trip) tripId = trip.id;
    }

    if (!subcontractorId && truckId) {
      const [truck] = await db
        .select({ subcontractorId: trucksTable.subcontractorId })
        .from(trucksTable)
        .where(eq(trucksTable.id, parseInt(truckId)));
      if (truck) subcontractorId = truck.subcontractorId;
    }

    const [expense] = await db
      .insert(tripExpensesTable)
      .values({
        tripId: tripId ? parseInt(tripId) : null,
        batchId: batchId ? parseInt(batchId) : null,
        truckId: truckId ? parseInt(truckId) : null,
        subcontractorId: subcontractorId ? parseInt(subcontractorId) : null,
        tier: tier ?? "trip",
        costType,
        description: description ?? null,
        amount: amount.toString(),
        currency: currency ?? "USD",
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        settled: settled ?? false,
      })
      .returning();

    const tierLabel = expense.tier ?? "trip";
    const contextLabel = expense.tripId
      ? `trip #${expense.tripId}`
      : expense.batchId
      ? `batch #${expense.batchId}`
      : expense.truckId
      ? `truck #${expense.truckId}`
      : "general";
    await logAudit(req, {
      action: "create",
      entity: "trip_expense",
      entityId: expense.id,
      description: `Expense logged on ${contextLabel}: ${expense.costType} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      metadata: { costType: expense.costType, amount: parseFloat(expense.amount), tier: tierLabel, tripId: expense.tripId, batchId: expense.batchId, truckId: expense.truckId },
    });
    res.status(201).json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { settled, description, amount, costType, expenseDate } = req.body;
    const updateData: Record<string, unknown> = {};
    if (settled !== undefined) updateData.settled = settled;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = amount.toString();
    if (costType !== undefined) updateData.costType = costType;
    if (expenseDate !== undefined) updateData.expenseDate = new Date(expenseDate);

    const [expense] = await db
      .update(tripExpensesTable)
      .set(updateData)
      .where(eq(tripExpensesTable.id, parseInt(req.params.id)))
      .returning();
    if (!expense) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update",
      entity: "trip_expense",
      entityId: expense.id,
      description: `Expense updated: ${expense.costType} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      metadata: { costType: expense.costType, amount: parseFloat(expense.amount) },
    });
    res.json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (e) { next(e); }
});

// PATCH /api/expenses/:id/link-trip — promote a truck-tier expense to a specific trip
router.patch("/:id/link-trip", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { tripId } = req.body;
    if (!tripId) return res.status(400).json({ error: "tripId is required" });

    const [expense] = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (expense.tier !== "truck") return res.status(400).json({ error: "Only truck-tier expenses can be linked to a trip" });

    const [trip] = await db
      .select({ id: tripsTable.id, batchId: tripsTable.batchId })
      .from(tripsTable)
      .where(eq(tripsTable.id, parseInt(tripId)));
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const baseDesc = (expense.description ?? "")
      .replace(/\s*\[from truck\]/g, "")
      .replace(/\s*\[from trip (?:"[^"]+"|#\d+)\]/g, "")
      .trim();
    const stampedDesc = baseDesc ? `${baseDesc} [from truck]` : "[from truck]";

    const [updated] = await db
      .update(tripExpensesTable)
      .set({ tier: "trip", tripId: trip.id, batchId: trip.batchId, description: stampedDesc })
      .where(eq(tripExpensesTable.id, id))
      .returning();

    await logAudit(req, {
      action: "update", entity: "trip_expense", entityId: id,
      description: `Expense #${id} (${expense.costType}) linked to trip #${trip.id} — promoted from truck to trip tier`,
      metadata: { tripId: trip.id, batchId: trip.batchId },
    });
    res.json({ ...updated, amount: parseFloat(updated.amount) });
  } catch (e) { next(e); }
});

// PATCH /api/expenses/:id/unlink-trip — demote a trip-linked expense back to truck tier
router.patch("/:id/unlink-trip", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (expense.tier !== "trip" || !expense.truckId) {
      return res.status(400).json({ error: "This expense was not promoted from a truck and cannot be unlinked" });
    }

    const prevTripId = expense.tripId;

    // Fetch batch name so the truck expense tag is human-readable
    let batchLabel = `trip #${prevTripId}`;
    if (expense.batchId) {
      const [batch] = await db
        .select({ name: batchesTable.name })
        .from(batchesTable)
        .where(eq(batchesTable.id, expense.batchId));
      if (batch?.name) batchLabel = `"${batch.name}"`;
    }

    const baseDesc2 = (expense.description ?? "")
      .replace(/\s*\[from truck\]/g, "")
      .replace(/\s*\[from trip (?:"[^"]+"|#\d+)\]/g, "")
      .trim();
    const updatedDesc = baseDesc2 ? `${baseDesc2} [from trip ${batchLabel}]` : `[from trip ${batchLabel}]`;

    const [updated] = await db
      .update(tripExpensesTable)
      .set({ tier: "truck", tripId: null, batchId: null, description: updatedDesc })
      .where(eq(tripExpensesTable.id, id))
      .returning();

    await logAudit(req, {
      action: "update", entity: "trip_expense", entityId: id,
      description: `Expense #${id} (${expense.costType}) unlinked from trip #${prevTripId} — demoted back to truck tier`,
      metadata: { previousTripId: prevTripId, truckId: expense.truckId },
    });
    res.json({ ...updated, amount: parseFloat(updated.amount) });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    await db.delete(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "trip_expense",
      entityId: id,
      description: `Deleted expense: ${expense?.costType ?? "expense"} — $${expense ? parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "?"}`,
      metadata: { costType: expense?.costType, amount: expense ? parseFloat(expense.amount) : null },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

router.get("/summary", async (req, res, next) => {
  try {
    const { batchId, truckId } = req.query;
    let query = db
      .select({
        total: sql<string>`coalesce(sum(${tripExpensesTable.amount}), 0)`,
        unsettled: sql<string>`coalesce(sum(case when ${tripExpensesTable.settled} = false then ${tripExpensesTable.amount} else 0 end), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(tripExpensesTable)
      .$dynamic();

    const conditions = [];
    if (batchId) {
      const batchTrips = await db
        .select({ id: tripsTable.id })
        .from(tripsTable)
        .where(eq(tripsTable.batchId, parseInt(batchId as string)));
      const tripIds = batchTrips.map((t) => t.id);
    }

    const [result] = await db
      .select({
        total: sql<string>`coalesce(sum(${tripExpensesTable.amount}), 0)`,
        unsettled: sql<string>`coalesce(sum(case when ${tripExpensesTable.settled} = false then ${tripExpensesTable.amount} else 0 end), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(tripExpensesTable);

    res.json({
      total: parseFloat(result.total),
      unsettled: parseFloat(result.unsettled),
      count: parseInt(result.count),
    });
  } catch (e) { next(e); }
});

export default router;
