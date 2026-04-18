import { Router } from "express";
import { db } from "@workspace/db";
import { companyExpensesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { blockIfClosed } from "../lib/financialPeriod";

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
    if (await blockIfClosed(res, req.body.expenseDate ?? new Date())) return;
    const [expense] = await db.insert(companyExpensesTable).values(req.body).returning();
    await logAudit(req, {
      action: "create",
      entity: "company_expense",
      entityId: expense.id,
      description: `Company expense recorded: ${expense.category ?? expense.description ?? "expense"} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      metadata: { category: expense.category, amount: parseFloat(expense.amount), description: expense.description },
    });
    res.status(201).json({ ...expense, amount: parseFloat(expense.amount) });
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
