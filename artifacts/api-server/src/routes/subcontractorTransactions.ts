import { Router } from "express";
import { db } from "@workspace/db";
import { subcontractorTransactionsTable, subcontractorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [tx] = await db
      .update(subcontractorTransactionsTable)
      .set(req.body)
      .where(eq(subcontractorTransactionsTable.id, id))
      .returning();
    if (!tx) return res.status(404).json({ error: "Not found" });
    const [sub] = await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, tx.subcontractorId));
    await logAudit(req, {
      action: "update",
      entity: "subcontractor_transaction",
      entityId: id,
      description: `Updated subcontractor payment: ${tx.type} of $${parseFloat(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} for ${sub?.name ?? `sub #${tx.subcontractorId}`}`,
      metadata: { subcontractorId: tx.subcontractorId, type: tx.type, amount: parseFloat(tx.amount), reference: tx.reference },
    });
    res.json({ ...tx, amount: parseFloat(tx.amount) });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [tx] = await db.select().from(subcontractorTransactionsTable).where(eq(subcontractorTransactionsTable.id, id));
    const [sub] = tx ? await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, tx.subcontractorId)) : [null];
    await db.delete(subcontractorTransactionsTable).where(eq(subcontractorTransactionsTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "subcontractor_transaction",
      entityId: id,
      description: `Deleted subcontractor payment: ${tx?.type ?? "transaction"} of $${tx ? parseFloat(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "?"} for ${sub?.name ?? `sub #${tx?.subcontractorId ?? "?"}`}`,
      metadata: { subcontractorId: tx?.subcontractorId, type: tx?.type, amount: tx ? parseFloat(tx.amount) : null },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
