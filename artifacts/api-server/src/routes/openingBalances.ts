import { Router } from "express";
import { db } from "@workspace/db";
import { bankAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { postJournalEntry } from "../lib/glPosting";

const router = Router();

// POST /api/opening-balances/bank/:bankAccountId
// Sets the opening balance for a bank account: DR [bank glCode] / CR 3000 Opening Balance Equity
router.post("/bank/:bankAccountId", async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const bankId = parseInt(req.params.bankAccountId);
    const { amount, asOfDate } = req.body;

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: "amount is required" });
    }
    if (!asOfDate) return res.status(400).json({ error: "asOfDate is required" });

    const bank = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankId)).then((r) => r[0]);
    if (!bank) return res.status(404).json({ error: "Bank account not found" });

    const amt = parseFloat(amount);
    if (amt <= 0) return res.status(400).json({ error: "Amount must be positive" });

    await postJournalEntry({
      description: `Opening balance — ${bank.name}`,
      entryDate: new Date(asOfDate),
      referenceType: "opening_balance",
      referenceId: bankId,
      lines: [
        { accountCode: bank.glCode, debit: amt, description: `Opening balance ${bank.name}` },
        { accountCode: "3000", credit: amt, description: "Opening Balance Equity" },
      ],
    });

    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST /api/opening-balances/retained-earnings
// Records prior year retained earnings: DR 3000 Opening Balance Equity / CR 3002 Retained Earnings
router.post("/retained-earnings", async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { amount, asOfDate } = req.body;
    if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: "amount is required" });
    if (!asOfDate) return res.status(400).json({ error: "asOfDate is required" });

    const amt = parseFloat(amount);
    if (amt === 0) return res.status(400).json({ error: "Amount cannot be zero" });

    // Positive = prior profit (DR OBE / CR Retained Earnings)
    // Negative = prior loss (DR Retained Earnings / CR OBE)
    const absAmt = Math.abs(amt);
    const lines = amt > 0
      ? [
          { accountCode: "3000", debit: absAmt, description: "Transfer to Retained Earnings" },
          { accountCode: "3002", credit: absAmt, description: "Retained Earnings b/f" },
        ]
      : [
          { accountCode: "3002", debit: absAmt, description: "Accumulated Losses b/f" },
          { accountCode: "3000", credit: absAmt, description: "Opening Balance Equity" },
        ];

    await postJournalEntry({
      description: `Prior year retained earnings as of ${asOfDate}`,
      entryDate: new Date(asOfDate),
      referenceType: "opening_balance",
      referenceId: 0,
      lines,
    });

    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
