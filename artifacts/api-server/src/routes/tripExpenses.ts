import { Router } from "express";
import { db } from "@workspace/db";
import { tripExpensesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db
      .update(tripExpensesTable)
      .set(req.body)
      .where(eq(tripExpensesTable.id, id))
      .returning();
    if (!expense) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update",
      entity: "trip_expense",
      entityId: id,
      description: `Updated trip expense on trip #${expense.tripId}: ${expense.costType} — $${parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      metadata: { tripId: expense.tripId, costType: expense.costType, amount: parseFloat(expense.amount) },
    });
    res.json({ ...expense, amount: parseFloat(expense.amount) });
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
      description: `Deleted trip expense from trip #${expense?.tripId ?? "?"}: ${expense?.costType ?? "expense"} — $${expense ? parseFloat(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "?"}`,
      metadata: { tripId: expense?.tripId, costType: expense?.costType, amount: expense ? parseFloat(expense.amount) : null },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
