import { Router } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  clientTransactionsTable,
  batchesTable,
  tripsTable,
  usersTable,
  periodsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, count, and, gte, lte, inArray, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

async function getClientBalance(clientId: number) {
  const [bal] = await db
    .select({
      balance: sql<string>`
        coalesce(sum(case
          when type = 'invoice' then amount
          when type = 'adjustment' then amount
          when type = 'advance' then -amount
          when type = 'payment' then -amount
          else 0
        end), 0)
      `,
    })
    .from(clientTransactionsTable)
    .where(eq(clientTransactionsTable.clientId, clientId));
  return parseFloat(bal.balance ?? "0");
}

async function getSessionUserRole(req: any): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.role ?? null;
}

router.get("/", async (_req, res, next) => {
  try {
    const showAll = _req.query.includeInactive === "true";
    const clients = await db.select().from(clientsTable)
      .where(showAll ? undefined : eq(clientsTable.isActive, true))
      .orderBy(clientsTable.name);

    // Bulk-fetch unbilled receivable (delivered/completed, not invoiced) per client
    const unbilledRows = await db
      .select({ clientId: batchesTable.clientId, qty: tripsTable.loadedQty, rate: batchesTable.ratePerMt })
      .from(tripsTable)
      .innerJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(and(inArray(tripsTable.status, ["delivered", "completed"]), isNull(tripsTable.invoiceId)));

    // Bulk-fetch projected receivable (loaded/in-transit, not invoiced) per client
    const projectedRows = await db
      .select({ clientId: batchesTable.clientId, qty: tripsTable.loadedQty, rate: batchesTable.ratePerMt })
      .from(tripsTable)
      .innerJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(and(inArray(tripsTable.status, ["loaded", "in_transit", "at_zambia_entry", "at_drc_entry"]), isNull(tripsTable.invoiceId)));

    const unbilledByClient: Record<number, number> = {};
    for (const r of unbilledRows) {
      if (r.clientId == null) continue;
      unbilledByClient[r.clientId] = (unbilledByClient[r.clientId] ?? 0) + parseFloat(r.qty ?? "0") * parseFloat(r.rate ?? "0");
    }
    const projectedByClient: Record<number, number> = {};
    for (const r of projectedRows) {
      if (r.clientId == null) continue;
      projectedByClient[r.clientId] = (projectedByClient[r.clientId] ?? 0) + parseFloat(r.qty ?? "0") * parseFloat(r.rate ?? "0");
    }

    const withBalances = await Promise.all(
      clients.map(async (c) => {
        const balance = await getClientBalance(c.id);
        return {
          ...c,
          balance,
          unbilledReceivable: unbilledByClient[c.id] ?? 0,
          projectedReceivable: projectedByClient[c.id] ?? 0,
        };
      })
    );
    res.json(withBalances);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [client] = await db.insert(clientsTable).values(req.body).returning();
    await logAudit(req, { action: "create", entity: "client", entityId: client.id, description: `Created client ${client.name}` });
    res.status(201).json({ ...client, balance: 0 });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) return res.status(404).json({ error: "Not found" });

    const transactions = await db
      .select({
        id: clientTransactionsTable.id,
        clientId: clientTransactionsTable.clientId,
        type: clientTransactionsTable.type,
        amount: clientTransactionsTable.amount,
        reference: clientTransactionsTable.reference,
        batchId: clientTransactionsTable.batchId,
        batchName: batchesTable.name,
        description: clientTransactionsTable.description,
        transactionDate: clientTransactionsTable.transactionDate,
        createdAt: clientTransactionsTable.createdAt,
        invoiceId: clientTransactionsTable.invoiceId,
      })
      .from(clientTransactionsTable)
      .leftJoin(batchesTable, eq(clientTransactionsTable.batchId, batchesTable.id))
      .where(eq(clientTransactionsTable.clientId, id))
      .orderBy(desc(clientTransactionsTable.transactionDate));

    const balance = await getClientBalance(id);

    // Uninvoiced delivered: trips delivered/completed but not yet on an invoice
    const uninvoicedTrips = await db
      .select({ loadedQty: tripsTable.loadedQty, ratePerMt: batchesTable.ratePerMt })
      .from(tripsTable)
      .innerJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(and(
        eq(batchesTable.clientId, id),
        inArray(tripsTable.status, ["delivered", "completed"]),
        isNull(tripsTable.invoiceId)
      ));

    const unbilledReceivable = uninvoicedTrips.reduce((sum, t) => {
      return sum + parseFloat(t.loadedQty ?? "0") * parseFloat(t.ratePerMt ?? "0");
    }, 0);

    // Projected receivable: trips that are loaded or in transit (not yet delivered)
    const projectedTrips = await db
      .select({ loadedQty: tripsTable.loadedQty, ratePerMt: batchesTable.ratePerMt })
      .from(tripsTable)
      .innerJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(and(
        eq(batchesTable.clientId, id),
        inArray(tripsTable.status, ["loaded", "in_transit", "at_zambia_entry", "at_drc_entry"]),
        isNull(tripsTable.invoiceId)
      ));

    const projectedReceivable = projectedTrips.reduce((sum, t) => {
      return sum + parseFloat(t.loadedQty ?? "0") * parseFloat(t.ratePerMt ?? "0");
    }, 0);

    res.json({
      ...client,
      balance,
      unbilledReceivable,
      projectedReceivable,
      transactions: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));

    // Guard opening balance edits when locked
    if (before?.obLocked && req.body.openingBalance !== undefined) {
      const incoming = parseFloat(req.body.openingBalance);
      const current = parseFloat(before.openingBalance ?? "0");
      if (incoming !== current) {
        return res.status(403).json({ error: "Opening balance is locked. Use the adjust endpoint to override." });
      }
    }

    const [client] = await db.update(clientsTable).set(req.body).where(eq(clientsTable.id, id)).returning();
    if (!client) return res.status(404).json({ error: "Not found" });
    await logAudit(req, { action: "update", entity: "client", entityId: id, description: `Updated client ${client.name}`, metadata: { before: { name: before?.name }, after: { name: client.name } } });
    const balance = await getClientBalance(id);
    res.json({ ...client, balance });
  } catch (e) { next(e); }
});

// Admin/Manager override: adjust opening balance after it is locked
router.post("/:id/adjust-opening-balance", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { newBalance, reason } = req.body as { newBalance: number; reason?: string };

    if (newBalance === undefined || newBalance === null) {
      return res.status(400).json({ error: "newBalance is required" });
    }

    const role = await getSessionUserRole(req);
    if (role !== "owner" && role !== "admin" && role !== "manager") {
      return res.status(403).json({ error: "Only admin or manager can adjust a locked opening balance" });
    }

    const [before] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!before) return res.status(404).json({ error: "Not found" });

    const [client] = await db
      .update(clientsTable)
      .set({ openingBalance: newBalance.toString() })
      .where(eq(clientsTable.id, id))
      .returning();

    await logAudit(req, {
      action: "update",
      entity: "client",
      entityId: id,
      description: `Opening balance adjusted for ${client.name}: $${parseFloat(before.openingBalance ?? "0").toFixed(2)} → $${newBalance.toFixed(2)}${reason ? ` (${reason})` : ""}`,
      metadata: { previousBalance: parseFloat(before.openingBalance ?? "0"), newBalance, reason },
    });

    const balance = await getClientBalance(id);
    res.json({ ...client, balance });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    await db.update(clientsTable).set({ isActive: false }).where(eq(clientsTable.id, id));
    await logAudit(req, { action: "update", entity: "client", entityId: id, description: `Deactivated client ${client?.name ?? id}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:id/reactivate", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [client] = await db.update(clientsTable).set({ isActive: true }).where(eq(clientsTable.id, id)).returning();
    await logAudit(req, { action: "update", entity: "client", entityId: id, description: `Reactivated client ${client?.name ?? id}` });
    res.json({ ...client, balance: 0 });
  } catch (e) { next(e); }
});

router.get("/:id/transactions", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) return res.status(404).json({ error: "Not found" });

    const transactions = await db
      .select({
        id: clientTransactionsTable.id,
        clientId: clientTransactionsTable.clientId,
        type: clientTransactionsTable.type,
        amount: clientTransactionsTable.amount,
        reference: clientTransactionsTable.reference,
        batchId: clientTransactionsTable.batchId,
        batchName: batchesTable.name,
        description: clientTransactionsTable.description,
        transactionDate: clientTransactionsTable.transactionDate,
        createdAt: clientTransactionsTable.createdAt,
        invoiceId: clientTransactionsTable.invoiceId,
      })
      .from(clientTransactionsTable)
      .leftJoin(batchesTable, eq(clientTransactionsTable.batchId, batchesTable.id))
      .where(eq(clientTransactionsTable.clientId, id))
      .orderBy(desc(clientTransactionsTable.transactionDate));

    const [bal] = await db
      .select({
        balance: sql<string>`coalesce(sum(case when type='invoice' then amount when type='adjustment' then amount when type='advance' then -amount when type='payment' then -amount else 0 end),0)`,
        totalInvoiced: sql<string>`coalesce(sum(case when type='invoice' then amount else 0 end),0)`,
        totalAdvances: sql<string>`coalesce(sum(case when type='advance' then amount else 0 end),0)`,
        totalPayments: sql<string>`coalesce(sum(case when type='payment' then amount else 0 end),0)`,
      })
      .from(clientTransactionsTable)
      .where(eq(clientTransactionsTable.clientId, id));

    res.json({
      client: { ...client, balance: parseFloat(bal.balance ?? "0") },
      transactions: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
      totalInvoiced: parseFloat(bal.totalInvoiced ?? "0"),
      totalAdvances: parseFloat(bal.totalAdvances ?? "0"),
      totalPayments: parseFloat(bal.totalPayments ?? "0"),
      balance: parseFloat(bal.balance ?? "0"),
    });
  } catch (e) { next(e); }
});

router.post("/:id/transactions", async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    const [tx] = await db.insert(clientTransactionsTable).values({ ...req.body, clientId }).returning();
    await logAudit(req, { action: "payment", entity: "client_transaction", entityId: tx.id, description: `${tx.type} of $${parseFloat(tx.amount).toLocaleString()} for client ${client?.name ?? clientId}`, metadata: { type: tx.type, amount: parseFloat(tx.amount), reference: tx.reference } });
    res.status(201).json({ ...tx, amount: parseFloat(tx.amount) });
  } catch (e) { next(e); }
});

// GET /:id/period-statement?periodId=X — client account statement for a period
router.get("/:id/period-statement", async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id);
    const periodId = req.query.periodId ? parseInt(req.query.periodId as string) : null;

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Client not found" });

    let start: Date | null = null;
    let end: Date | null = null;
    let periodName = "All Time";

    if (periodId) {
      const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, periodId));
      if (!period) return res.status(404).json({ error: "Period not found" });
      start = new Date(period.startDate);
      end = new Date(period.endDate);
      end.setHours(23, 59, 59, 999);
      periodName = period.name;
    }

    const txWhere = start && end
      ? and(eq(clientTransactionsTable.clientId, clientId), gte(clientTransactionsTable.transactionDate, start), lte(clientTransactionsTable.transactionDate, end))
      : eq(clientTransactionsTable.clientId, clientId);

    const transactions = await db
      .select({
        id: clientTransactionsTable.id,
        type: clientTransactionsTable.type,
        amount: clientTransactionsTable.amount,
        reference: clientTransactionsTable.reference,
        batchId: clientTransactionsTable.batchId,
        batchName: batchesTable.name,
        description: clientTransactionsTable.description,
        transactionDate: clientTransactionsTable.transactionDate,
        invoiceId: clientTransactionsTable.invoiceId,
      })
      .from(clientTransactionsTable)
      .leftJoin(batchesTable, eq(clientTransactionsTable.batchId, batchesTable.id))
      .where(txWhere)
      .orderBy(clientTransactionsTable.transactionDate);

    const parsedTx = transactions.map((t) => ({ ...t, amount: parseFloat(t.amount as any) }));

    const totalInvoiced = parsedTx.filter((t) => t.type === "invoice").reduce((s, t) => s + t.amount, 0);
    const totalAdvances = parsedTx.filter((t) => t.type === "advance").reduce((s, t) => s + t.amount, 0);
    const totalPayments = parsedTx.filter((t) => t.type === "payment").reduce((s, t) => s + t.amount, 0);
    const totalAdjustments = parsedTx.filter((t) => t.type === "adjustment").reduce((s, t) => s + t.amount, 0);

    // Net balance: invoices + adjustments - advances - payments (positive = client owes us)
    const netBalance = totalInvoiced + totalAdjustments - totalAdvances - totalPayments;

    const openingBalance = parseFloat((client as any).openingBalance ?? "0");
    const closingBalance = openingBalance + netBalance;

    return res.json({
      client: { ...client, balance: closingBalance },
      periodName,
      periodId,
      transactions: parsedTx,
      summary: {
        totalInvoiced,
        totalAdvances,
        totalPayments,
        totalAdjustments,
        netBalance,
        openingBalance,
        closingBalance,
      },
    });
  } catch (e) { next(e); }
});

export default router;
