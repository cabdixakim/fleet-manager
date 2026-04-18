import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, agentTransactionsTable, batchesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { blockIfClosed } from "../lib/financialPeriod";

const router = Router();

async function getAgentBalance(agentId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(case when type = 'payment' then -amount else amount end), 0)` })
    .from(agentTransactionsTable)
    .where(eq(agentTransactionsTable.agentId, agentId));
  return parseFloat(row?.total ?? "0");
}

router.get("/", async (req, res, next) => {
  try {
    const agents = await db.select().from(agentsTable).orderBy(desc(agentsTable.createdAt));
    const result = await Promise.all(
      agents.map(async (a) => ({ ...a, balance: await getAgentBalance(a.id) }))
    );
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [agent] = await db.insert(agentsTable).values(req.body).returning();
    await logAudit(req, { action: "create", entity: "agent", entityId: agent.id, description: `Created agent ${agent.name}`, metadata: {} });
    res.status(201).json({ ...agent, balance: 0 });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const balance = await getAgentBalance(id);
    const batches = await db.select({ id: batchesTable.id, name: batchesTable.name, agentFeePerMt: batchesTable.agentFeePerMt })
      .from(batchesTable).where(eq(batchesTable.agentId, id));
    res.json({ ...agent, balance, batchCount: batches.length });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [agent] = await db.update(agentsTable).set(req.body).where(eq(agentsTable.id, id)).returning();
    await logAudit(req, { action: "update", entity: "agent", entityId: id, description: `Updated agent ${agent.name}`, metadata: {} });
    const balance = await getAgentBalance(id);
    res.json({ ...agent, balance });
  } catch (e) { next(e); }
});

router.get("/:id/transactions", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const txns = await db
      .select({ txn: agentTransactionsTable, batchName: batchesTable.name })
      .from(agentTransactionsTable)
      .leftJoin(batchesTable, eq(agentTransactionsTable.batchId, batchesTable.id))
      .where(eq(agentTransactionsTable.agentId, id))
      .orderBy(desc(agentTransactionsTable.transactionDate));

    let running = 0;
    const withBalance = txns.map(({ txn, batchName }) => {
      const signed = txn.type === "payment" ? -parseFloat(txn.amount) : parseFloat(txn.amount);
      running += signed;
      return { ...txn, batchName, runningBalance: running };
    });
    res.json(withBalance.reverse());
  } catch (e) { next(e); }
});

router.post("/:id/transactions", async (req, res, next) => {
  try {
    const agentId = parseInt(req.params.id);
    if (await blockIfClosed(res, req.body.transactionDate ?? new Date())) return;
    const [txn] = await db.insert(agentTransactionsTable).values({ ...req.body, agentId }).returning();
    await logAudit(req, { action: "create", entity: "agent_transaction", entityId: txn.id, description: `Recorded ${txn.type} of $${txn.amount} for agent #${agentId}`, metadata: { agentId, type: txn.type } });
    res.status(201).json(txn);
  } catch (e) { next(e); }
});

router.delete("/transactions/:txnId", async (req, res, next) => {
  try {
    const txnId = parseInt(req.params.txnId);
    const [existing] = await db.select().from(agentTransactionsTable).where(eq(agentTransactionsTable.id, txnId));
    if (existing && (await blockIfClosed(res, existing.transactionDate))) return;
    await db.delete(agentTransactionsTable).where(eq(agentTransactionsTable.id, txnId));
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
