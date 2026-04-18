import { Router } from "express";
import { db } from "@workspace/db";
import { pettyCashAccountsTable, pettyCashTransactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { topUpPettyCash } from "../lib/glPosting";

const router = Router();

const SOURCE_LABELS: Record<string, string> = {
  bank_transfer: "Bank Withdrawal",
  loan:          "Loan / Borrowed Cash",
  owner_cash:    "Owner's Cash Injection",
  client_cash:   "Client Cash Payment",
};

// GET /api/petty-cash
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

// POST /api/petty-cash/top-up
router.post("/top-up", async (req, res, next) => {
  try {
    const { amount, description, date, source } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be > 0" });

    const sourceLabel = SOURCE_LABELS[source] ?? "Bank Withdrawal";
    const desc = description?.trim()
      ? description.trim()
      : `Petty cash top-up (${sourceLabel}) — $${amt.toFixed(2)}`;
    const entryDate = date ? new Date(date) : new Date();

    await topUpPettyCash(amt, desc, entryDate, source ?? "bank_transfer");

    await logAudit(req, {
      action: "create",
      entity: "petty_cash_topup",
      entityId: 0,
      description: `Petty cash topped up by $${amt.toFixed(2)} from ${sourceLabel}: ${desc}`,
      metadata: { amount: amt, source: source ?? "bank_transfer" },
    });

    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    res.status(201).json({
      balance: parseFloat(account?.balance ?? "0"),
      topUp: { amount: amt, description: desc, date: entryDate, source },
    });
  } catch (e) { next(e); }
});

export default router;
