import { Router } from "express";
import { db } from "@workspace/db";
import { companyExpensesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { blockIfClosed, bumpDateIfClosed, appendNote } from "../lib/financialPeriod";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { month, year } = req.query;
    let expenses = await db.select().from(companyExpensesTable).orderBy(sql`${companyExpensesTable.expenseDate} desc`);
    if (month) expenses = expenses.filter((e) => new Date(e.expenseDate).getMonth() + 1 === parseInt(month as string));
    if (year) expenses = expenses.filter((e) => new Date(e.expenseDate).getFullYear() === parseInt(year as string));
    res.json(expenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const bump = await bumpDateIfClosed(req.body.expenseDate ?? new Date());
    const [expense] = await db.insert(companyExpensesTable).values({
      ...req.body,
      expenseDate: bump.effectiveDate,
      description: appendNote(req.body.description, bump.noteSuffix),
    }).returning();
    await logAudit(req, {
      action: "create",
      entity: "company_expense",
      entityId: expense.id,
      description: `Company expense recorded: ${expense.category ?? expense.description ?? "expense"} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}${bump.bumped ? ` [back-dated from ${bump.originalDate}]` : ""}`,
      metadata: { category: expense.category, amount: parseFloat(expense.amount), description: expense.description, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriod: bump.closedPeriodName },
    });
    res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount),
      posting: { date: bump.effectiveDate, bumped: bump.bumped, originalDate: bump.originalDate, closedPeriodName: bump.closedPeriodName },
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(companyExpensesTable).where(eq(companyExpensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (await blockIfClosed(res, existing.expenseDate, req.body.expenseDate)) return;
    const [expense] = await db.update(companyExpensesTable).set(req.body).where(eq(companyExpensesTable.id, id)).returning();
    if (!expense) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update",
      entity: "company_expense",
      entityId: id,
      description: `Company expense updated: ${expense.category ?? expense.description ?? "expense"} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      metadata: { category: expense.category, amount: parseFloat(expense.amount) },
    });
    res.json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (e) { next(e); }
});

// POST /api/company-expenses/:id/correct
// Creates a reversal (negated amount, dated today) + optional correcting entry.
router.post("/:id/correct", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { newAmount, newCategory, newDescription, correctionNote } = req.body;

    const [original] = await db.select().from(companyExpensesTable).where(eq(companyExpensesTable.id, id));
    if (!original) return res.status(404).json({ error: "Not found" });

    const bump = await bumpDateIfClosed(new Date());
    const today = new Date(bump.effectiveDate);

    // 1. Reversal
    const reversalDesc = appendNote(
      `Reversal of expense #${id}: ${original.description ?? original.category}`,
      bump.noteSuffix,
    );
    const [reversal] = await db.insert(companyExpensesTable).values({
      category: original.category,
      description: reversalDesc,
      amount: (-parseFloat(original.amount)).toFixed(2),
      currency: original.currency,
      expenseDate: today,
    }).returning();

    await logAudit(req, {
      action: "amendment",
      entity: "company_expense",
      entityId: reversal.id,
      description: `Reversal posted for closed-period company expense #${id} ($${parseFloat(original.amount).toFixed(2)}) → entry #${reversal.id} dated ${bump.effectiveDate}`,
      metadata: { originalId: id, type: "reversal", originalAmount: parseFloat(original.amount) },
    });

    // 2. Correcting entry
    let correction = null;
    if (newAmount !== undefined && newAmount !== null) {
      const correctionDesc = appendNote(
        [
          newDescription ?? original.description,
          `(corrects #${id})`,
          correctionNote ? `— ${correctionNote}` : "",
        ].filter(Boolean).join(" "),
        bump.noteSuffix,
      );
      const [correctionRow] = await db.insert(companyExpensesTable).values({
        category: newCategory ?? original.category,
        description: correctionDesc,
        amount: parseFloat(newAmount).toFixed(2),
        currency: original.currency,
        expenseDate: today,
      }).returning();

      await logAudit(req, {
        action: "amendment",
        entity: "company_expense",
        entityId: correctionRow.id,
        description: `Correcting entry for company expense #${id}: $${parseFloat(correctionRow.amount).toFixed(2)} dated ${bump.effectiveDate}`,
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
    const [expense] = await db.select().from(companyExpensesTable).where(eq(companyExpensesTable.id, id));
    if (expense && (await blockIfClosed(res, expense.expenseDate))) return;
    await db.delete(companyExpensesTable).where(eq(companyExpensesTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "company_expense",
      entityId: id,
      description: `Deleted company expense: ${expense?.category ?? expense?.description ?? "expense"} — $${expense ? parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "?"}`,
      metadata: { category: expense?.category, amount: expense ? parseFloat(expense.amount) : null },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
