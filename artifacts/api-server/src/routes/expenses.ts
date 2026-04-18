import { Router } from "express";
import { db } from "@workspace/db";
import {
  tripExpensesTable, tripsTable, batchesTable, trucksTable,
  subcontractorsTable, clientsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { blockIfClosed, bumpDateIfClosed, appendNote } from "../lib/financialPeriod";
import { postJournalEntry, TRIP_EXPENSE_ACCOUNT_MAP, creditAccountForPaymentMethod, deductPettyCash } from "../lib/glPosting";

const router = Router();

function requireRole(req: any, ...roles: string[]): boolean {
  const userRole = (req.session as any)?.userRole;
  return !!userRole && roles.includes(userRole);
}

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
        paymentMethod: tripExpensesTable.paymentMethod,
        supplierId: tripExpensesTable.supplierId,
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
    let { tripId, batchId, truckId, subcontractorId, tier, costType, description, amount, currency, expenseDate, settled, paymentMethod, supplierId } = body;

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

    const bump = await bumpDateIfClosed(expenseDate ?? new Date());

    const [expense] = await db
      .insert(tripExpensesTable)
      .values({
        tripId: tripId ? parseInt(tripId) : null,
        batchId: batchId ? parseInt(batchId) : null,
        truckId: truckId ? parseInt(truckId) : null,
        subcontractorId: subcontractorId ? parseInt(subcontractorId) : null,
        tier: tier ?? "trip",
        costType,
        description: appendNote(description, bump.noteSuffix),
        amount: amount.toString(),
        currency: currency ?? "USD",
        expenseDate: new Date(bump.effectiveDate),
        settled: settled ?? false,
        paymentMethod: paymentMethod ?? "cash",
        supplierId: supplierId ? parseInt(supplierId) : null,
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
      description: `Expense logged on ${contextLabel}: ${expense.costType} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}${bump.bumped ? ` [back-dated from ${bump.originalDate}]` : ""}`,
      metadata: { costType: expense.costType, amount: parseFloat(expense.amount), tier: tierLabel, tripId: expense.tripId, batchId: expense.batchId, truckId: expense.truckId, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriod: bump.closedPeriodName },
    });

    // Auto-post to GL: Dr trip expense account / Cr correct account based on payment method
    const expAmt = parseFloat(expense.amount);
    if (expAmt > 0) {
      const glAccount = TRIP_EXPENSE_ACCOUNT_MAP[expense.costType ?? "other"] ?? "6001";
      const creditCode = creditAccountForPaymentMethod(expense.paymentMethod);
      await postJournalEntry({
        description: `${expense.costType ?? "Expense"} — ${contextLabel}${expense.description ? `: ${expense.description}` : ""}`,
        entryDate: new Date(bump.effectiveDate),
        referenceType: "trip_expense",
        referenceId: expense.id,
        lines: [
          { accountCode: glAccount, debit: expAmt, description: expense.description ?? expense.costType ?? undefined },
          { accountCode: creditCode, credit: expAmt, description: "Payment" },
        ],
      });
      // If paid from petty cash, deduct from petty cash balance
      if (expense.paymentMethod === "petty_cash") {
        await deductPettyCash(expAmt, `${expense.costType} — ${contextLabel}`, "trip_expense", expense.id);
      }
    }

    res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount),
      posting: { date: bump.effectiveDate, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriodName: bump.closedPeriodName },
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { settled, description, amount, costType, expenseDate } = req.body;
    const id = parseInt(req.params.id);

    // History is sacred: reject if either the existing row's date OR the proposed
    // new date falls in a closed period.
    const [existing] = await db.select({ expenseDate: tripExpensesTable.expenseDate }).from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (await blockIfClosed(res, existing.expenseDate, expenseDate)) return;

    const updateData: Record<string, unknown> = {};
    if (settled !== undefined) updateData.settled = settled;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = amount.toString();
    if (costType !== undefined) updateData.costType = costType;
    if (expenseDate !== undefined) updateData.expenseDate = new Date(expenseDate);

    const [expense] = await db
      .update(tripExpensesTable)
      .set(updateData)
      .where(eq(tripExpensesTable.id, id))
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

// POST /api/expenses/:id/correct
// Creates a reversal entry (negated amount, dated today) + an optional correcting entry.
// Designed for the "can't delete — period is closed" workflow.
router.post("/:id/correct", async (req, res, next) => {
  try {
    if (!requireRole(req, "accounts", "manager", "admin", "owner", "system")) {
      return res.status(403).json({ error: "Only accounts, manager, admin, or owner can post correcting entries." });
    }
    const id = parseInt(req.params.id);
    const { newAmount, newCostType, newDescription, correctionNote } = req.body;

    const [original] = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    if (!original) return res.status(404).json({ error: "Not found" });

    // Both entries land in the current open period (bump if today is also closed)
    const bump = await bumpDateIfClosed(new Date());
    const today = new Date(bump.effectiveDate);

    // 1. Reversal — negates the original
    const reversalDesc = appendNote(
      `Reversal of expense #${id}: ${original.description ?? original.costType}`,
      bump.noteSuffix,
    );
    const [reversal] = await db.insert(tripExpensesTable).values({
      tripId: original.tripId,
      batchId: original.batchId,
      truckId: original.truckId,
      subcontractorId: original.subcontractorId,
      tier: original.tier,
      costType: original.costType,
      description: reversalDesc,
      amount: (-parseFloat(original.amount)).toFixed(2),
      currency: original.currency,
      expenseDate: today,
      settled: false,
    }).returning();

    await logAudit(req, {
      action: "amendment",
      entity: "trip_expense",
      entityId: reversal.id,
      description: `Reversal posted for closed-period expense #${id} (${original.costType} $${parseFloat(original.amount).toFixed(2)}) → entry #${reversal.id} dated ${bump.effectiveDate}`,
      metadata: { originalId: id, type: "reversal", originalAmount: parseFloat(original.amount), originalDate: original.expenseDate },
    });

    // 2. Correcting entry — only when caller provides a new amount
    let correction = null;
    if (newAmount !== undefined && newAmount !== null) {
      const correctionDesc = appendNote(
        [
          newDescription ?? original.description ?? original.costType,
          `(corrects #${id})`,
          correctionNote ? `— ${correctionNote}` : "",
        ].filter(Boolean).join(" "),
        bump.noteSuffix,
      );
      const [correctionRow] = await db.insert(tripExpensesTable).values({
        tripId: original.tripId,
        batchId: original.batchId,
        truckId: original.truckId,
        subcontractorId: original.subcontractorId,
        tier: original.tier,
        costType: newCostType ?? original.costType,
        description: correctionDesc,
        amount: parseFloat(newAmount).toFixed(2),
        currency: original.currency,
        expenseDate: today,
        settled: false,
      }).returning();

      await logAudit(req, {
        action: "amendment",
        entity: "trip_expense",
        entityId: correctionRow.id,
        description: `Correcting entry for closed-period expense #${id}: ${correctionRow.costType} $${parseFloat(correctionRow.amount).toFixed(2)} dated ${bump.effectiveDate}`,
        metadata: { originalId: id, type: "correction", newAmount: parseFloat(correctionRow.amount) },
      });

      correction = { ...correctionRow, amount: parseFloat(correctionRow.amount) };
    }

    res.status(201).json({
      reversal: { ...reversal, amount: parseFloat(reversal.amount) },
      correction,
      posting: { date: bump.effectiveDate, bumped: bump.bumped, closedPeriodName: bump.closedPeriodName },
    });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.select().from(tripExpensesTable).where(eq(tripExpensesTable.id, id));
    if (expense && (await blockIfClosed(res, expense.expenseDate))) return;
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
