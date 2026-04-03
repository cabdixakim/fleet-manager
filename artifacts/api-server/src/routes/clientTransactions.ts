import { Router } from "express";
import { db } from "@workspace/db";
import { clientTransactionsTable, clientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [tx] = await db
      .update(clientTransactionsTable)
      .set(req.body)
      .where(eq(clientTransactionsTable.id, id))
      .returning();
    if (!tx) return res.status(404).json({ error: "Not found" });
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, tx.clientId));
    await logAudit(req, {
      action: "update",
      entity: "client_transaction",
      entityId: id,
      description: `Updated client payment: ${tx.type} of $${parseFloat(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} for ${client?.name ?? `client #${tx.clientId}`}`,
      metadata: { clientId: tx.clientId, type: tx.type, amount: parseFloat(tx.amount), reference: tx.reference },
    });
    res.json({ ...tx, amount: parseFloat(tx.amount) });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [tx] = await db.select().from(clientTransactionsTable).where(eq(clientTransactionsTable.id, id));
    const [client] = tx ? await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, tx.clientId)) : [null];
    await db.delete(clientTransactionsTable).where(eq(clientTransactionsTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "client_transaction",
      entityId: id,
      description: `Deleted client payment: ${tx?.type ?? "transaction"} of $${tx ? parseFloat(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "?"} for ${client?.name ?? `client #${tx?.clientId ?? "?"}`}`,
      metadata: { clientId: tx?.clientId, type: tx?.type, amount: tx ? parseFloat(tx.amount) : null },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
