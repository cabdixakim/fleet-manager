import { Router } from "express";
import { db } from "@workspace/db";
import { pettyCashAccountsTable, pettyCashTransactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { topUpPettyCash } from "../lib/glPosting";

const router = Router();

// GET /api/petty-cash — get balance + recent transactions
router.get("/", async (req, res, next) => {
  try {
    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    if (!account) return res.json({ balance: 0, transactions: [] });

    const transactions = await db
      .select()
      .from(pettyCashTransactionsTable)
      .where(eq(pettyCashTransactionsTable.accountId, account.id))
      .orderBy(desc(pettyCashTransactionsTable.transactionDate))
      .limit(100);

    res.json({
      id: account.id,
      name: account.name,
      balance: parseFloat(account.balance),
      currency: account.currency,
      transactions: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (e) { next(e); }
});

// POST /api/petty-cash/top-up — add money from bank to petty cash
router.post("/top-up", async (req, res, next) => {
  try {
    const { amount, description, date } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be > 0" });

    const desc = description ?? `Petty cash top-up — $${amt.toFixed(2)}`;
    const entryDate = date ? new Date(date) : new Date();

    await topUpPettyCash(amt, desc, entryDate);

    await logAudit(req, {
      action: "create",
      entity: "petty_cash_topup",
      entityId: 0,
      description: `Petty cash topped up by $${amt.toFixed(2)}: ${desc}`,
      metadata: { amount: amt },
    });

    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    res.status(201).json({
      balance: parseFloat(account?.balance ?? "0"),
      topUp: { amount: amt, description: desc, date: entryDate },
    });
  } catch (e) { next(e); }
});

export default router;
