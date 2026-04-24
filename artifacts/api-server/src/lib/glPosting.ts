import { db } from "@workspace/db";
import {
  glJournalEntriesTable,
  glJournalEntryLinesTable,
  glAccountsTable,
  pettyCashAccountsTable,
  pettyCashTransactionsTable,
  bankAccountsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

async function getAccountByCode(code: string) {
  const [account] = await db.select().from(glAccountsTable).where(eq(glAccountsTable.code, code));
  return account ?? null;
}

async function getNextEntryNumber(): Promise<string> {
  const [row] = await db.select({ max: sql<string>`MAX(entry_number)` }).from(glJournalEntriesTable);
  const maxNum = row?.max ? parseInt(row.max.replace("JE-", ""), 10) : 0;
  return `JE-${String(maxNum + 1).padStart(5, "0")}`;
}

interface PostLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

interface PostParams {
  description: string;
  entryDate: Date;
  referenceType?: string;
  referenceId?: number;
  lines: PostLine[];
}

// Maps company expense categories → GL account codes
export const EXPENSE_ACCOUNT_MAP: Record<string, string> = {
  fuel: "5001",
  staff: "5002",
  driver_salary: "5002",
  border_fees: "5004",
  clearance: "5004",
  maintenance: "5005",
  rent: "6005",
  utilities: "6005",
  legal: "6003",
  marketing: "6004",
  travel: "6001",
  insurance: "6002",
  other: "6001",
};

// Maps trip expense costType values → GL account codes
export const TRIP_EXPENSE_ACCOUNT_MAP: Record<string, string> = {
  fuel: "5001",
  fuel_advance: "5001",
  driver_salary: "5002",
  salary: "5002",
  subcontractor: "5003",
  clearance_fee: "5004",
  border_fee: "5004",
  weighbridge: "5004",
  customs: "5004",
  transit_fee: "5004",
  t1_fee: "5004",
  tr8_fee: "5004",
  maintenance: "5005",
  repair: "5005",
  tyre: "5005",
  toll: "6001",
  accommodation: "6001",
  communication: "6001",
  other: "6001",
};

// Resolve the credit account code based on payment method
// petty_cash → 1003 (Petty Cash)
// fuel_credit → 2050 (Supplier Payables)
// bank_transfer → 1002 (Bank — or specific bank GL code via resolveBankGlCode)
// cash → 1001 (Cash on Hand — physical cash not in the petty cash tin)
// default → 2000 (AP — legacy / unset)
export function creditAccountForPaymentMethod(paymentMethod?: string | null): string {
  switch (paymentMethod) {
    case "petty_cash":    return "1003";
    case "fuel_credit":   return "2050";
    case "bank_transfer": return "1002";
    case "cash":          return "1001";
    default:              return "2000"; // legacy / unset → AP
  }
}

/**
 * Post a balanced journal entry. Skips if already posted for the same referenceType+referenceId.
 * Silently fails if GL accounts are not seeded yet (system not yet configured).
 */
export async function postJournalEntry(params: PostParams): Promise<boolean> {
  try {
    const { description, entryDate, referenceType, referenceId, lines } = params;

    // Skip if already posted for this reference
    if (referenceType && referenceId != null) {
      const existing = await db
        .select({ id: glJournalEntriesTable.id })
        .from(glJournalEntriesTable)
        .where(and(
          eq(glJournalEntriesTable.referenceType, referenceType),
          eq(glJournalEntriesTable.referenceId, referenceId),
        ))
        .limit(1);
      if (existing.length > 0) return false;
    }

    // Resolve account IDs — if any account is missing, skip silently (COA not seeded)
    const resolved: { accountId: number; debit: number; credit: number; description?: string }[] = [];
    for (const l of lines) {
      const account = await getAccountByCode(l.accountCode);
      if (!account) return false; // COA not ready
      resolved.push({ accountId: account.id, debit: l.debit ?? 0, credit: l.credit ?? 0, description: l.description });
    }

    // Validate balanced
    const totalDebit = resolved.reduce((s, l) => s + l.debit, 0);
    const totalCredit = resolved.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return false; // unbalanced — skip silently

    const entryNumber = await getNextEntryNumber();
    const [entry] = await db
      .insert(glJournalEntriesTable)
      .values({ entryNumber, description, entryDate, status: "posted", referenceType: referenceType ?? null, referenceId: referenceId ?? null })
      .returning();

    await db.insert(glJournalEntryLinesTable).values(
      resolved.map((l) => ({
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: l.debit.toFixed(2),
        credit: l.credit.toFixed(2),
        description: l.description ?? null,
      }))
    );
    return true;
  } catch (err) {
    console.error("[GL] postJournalEntry failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Deduct from petty cash balance and record a transaction.
 * Call this after posting the GL entry for a petty_cash expense.
 */
export async function deductPettyCash(amount: number, description: string, referenceType: string, referenceId: number): Promise<void> {
  try {
    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    if (!account) return;
    await db.update(pettyCashAccountsTable)
      .set({ balance: sql`${pettyCashAccountsTable.balance} - ${amount.toFixed(2)}` })
      .where(eq(pettyCashAccountsTable.id, account.id));
    await db.insert(pettyCashTransactionsTable).values({
      accountId: account.id,
      type: "expense",
      amount: (-amount).toFixed(2),
      description,
      referenceType,
      referenceId,
      transactionDate: new Date(),
    });
  } catch {
    // Never crash
  }
}

/**
 * Delete all GL journal entries (and their lines) for a given reference.
 * Use this in open periods before re-posting a corrected entry.
 */
export async function deleteJournalEntriesForReference(referenceType: string, referenceId: number): Promise<void> {
  try {
    const entries = await db
      .select({ id: glJournalEntriesTable.id })
      .from(glJournalEntriesTable)
      .where(and(
        eq(glJournalEntriesTable.referenceType, referenceType),
        eq(glJournalEntriesTable.referenceId, referenceId),
      ));
    if (entries.length === 0) return;
    const ids = entries.map((e) => e.id);
    await db.delete(glJournalEntryLinesTable).where(inArray(glJournalEntryLinesTable.journalEntryId, ids));
    await db.delete(glJournalEntriesTable).where(inArray(glJournalEntriesTable.id, ids));
  } catch {
    // GL errors must never crash the main flow
  }
}

/**
 * Post a reversal (mirror) of an existing GL entry for a reference.
 * Flips debits and credits. Uses referenceType "reversal_{referenceType}" to avoid
 * hitting the deduplication guard.
 */
export async function postReversalEntry(
  referenceType: string,
  referenceId: number,
  description: string,
  entryDate: Date,
): Promise<void> {
  try {
    const entries = await db
      .select({ id: glJournalEntriesTable.id })
      .from(glJournalEntriesTable)
      .where(and(
        eq(glJournalEntriesTable.referenceType, referenceType),
        eq(glJournalEntriesTable.referenceId, referenceId),
      ));
    if (entries.length === 0) return;

    // Check if reversal already posted
    const reversalType = `reversal_${referenceType}`;
    const existingReversal = await db
      .select({ id: glJournalEntriesTable.id })
      .from(glJournalEntriesTable)
      .where(and(
        eq(glJournalEntriesTable.referenceType, reversalType),
        eq(glJournalEntriesTable.referenceId, referenceId),
      ))
      .limit(1);
    if (existingReversal.length > 0) return;

    const lines = await db
      .select()
      .from(glJournalEntryLinesTable)
      .where(eq(glJournalEntryLinesTable.journalEntryId, entries[0].id));
    if (lines.length === 0) return;

    const entryNumber = await getNextEntryNumber();
    const [reversalEntry] = await db.insert(glJournalEntriesTable).values({
      entryNumber,
      description,
      entryDate,
      status: "posted",
      referenceType: reversalType,
      referenceId,
    }).returning();

    await db.insert(glJournalEntryLinesTable).values(
      lines.map((l) => ({
        journalEntryId: reversalEntry.id,
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
        description: l.description ?? null,
      }))
    );
  } catch {
    // Never crash
  }
}

/**
 * Add back to petty cash balance when an expense is deleted or reversed.
 */
export async function refundPettyCash(amount: number, description: string, referenceType: string, referenceId: number): Promise<void> {
  try {
    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    if (!account) return;
    await db.update(pettyCashAccountsTable)
      .set({ balance: sql`${pettyCashAccountsTable.balance} + ${amount.toFixed(2)}` })
      .where(eq(pettyCashAccountsTable.id, account.id));
    await db.insert(pettyCashTransactionsTable).values({
      accountId: account.id,
      type: "top_up",
      amount: amount.toFixed(2),
      description,
      referenceType: `refund_${referenceType}`,
      referenceId,
      transactionDate: new Date(),
    });
  } catch {
    // Never crash
  }
}

/**
 * Post (or replace) an opening balance GL entry for a client, subcontractor, or supplier.
 * Always deletes any existing entry for the referenceType+referenceId first,
 * then posts a fresh one if amount > 0. This means changing an opening balance
 * stays correct in the GL without leaving ghost entries.
 *
 * Client:        Dr AR (1100) / Cr Opening Balance Equity (3000)
 * Subcontractor: Dr Opening Balance Equity (3000) / Cr Sub Payables (2001)
 * Supplier:      Dr Opening Balance Equity (3000) / Cr Supplier Payables (2050)
 */
export async function postOrUpdateOpeningBalance(
  referenceType: string,
  referenceId: number,
  amount: number,
  debitCode: string,
  creditCode: string,
  description: string,
): Promise<void> {
  try {
    // Delete existing OB journal entry for this entity
    const existing = await db
      .select({ id: glJournalEntriesTable.id })
      .from(glJournalEntriesTable)
      .where(and(
        eq(glJournalEntriesTable.referenceType, referenceType),
        eq(glJournalEntriesTable.referenceId, referenceId),
      ));
    if (existing.length > 0) {
      const ids = existing.map((e) => e.id);
      await db.delete(glJournalEntryLinesTable).where(inArray(glJournalEntryLinesTable.journalEntryId, ids));
      await db.delete(glJournalEntriesTable).where(inArray(glJournalEntriesTable.id, ids));
    }
    // Post new entry only if amount is non-zero
    if (Math.abs(amount) > 0.001) {
      await postJournalEntry({
        description,
        entryDate: new Date(),
        referenceType,
        referenceId,
        lines: [
          { accountCode: debitCode,  debit:  amount > 0 ? amount : 0,  credit: amount < 0 ? -amount : 0, description },
          { accountCode: creditCode, credit: amount > 0 ? amount : 0,  debit:  amount < 0 ? -amount : 0, description },
        ],
      });
    }
  } catch {
    // GL errors must never crash the main flow
  }
}

/**
 * Maps a funding source label to the GL credit account code.
 * bank_transfer → 1002 Bank
 * loan          → 2500 Loans Payable
 * owner_cash    → 3001 Owner's Capital
 * client_cash   → 1100 Accounts Receivable
 */
export function pettyCashSourceAccount(source?: string | null): string {
  switch (source) {
    case "loan":        return "2500";
    case "owner_cash":  return "3001";
    case "client_cash": return "1100";
    default:            return "1002"; // bank_transfer (default)
  }
}

/**
 * Resolve the GL credit/debit account code for a bank payment.
 * If a specific bankAccountId is provided and the payment method is bank/cash,
 * look up that bank's GL code; otherwise fall back to creditAccountForPaymentMethod.
 */
export async function resolveBankGlCode(paymentMethod: string, bankAccountId?: number | null): Promise<string> {
  if ((paymentMethod === "bank_transfer" || paymentMethod === "cash") && bankAccountId) {
    try {
      const [bankAccount] = await db
        .select({ glCode: bankAccountsTable.glCode })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.id, bankAccountId))
        .limit(1);
      if (bankAccount) return bankAccount.glCode;
    } catch { /* fall through */ }
  }
  return creditAccountForPaymentMethod(paymentMethod);
}

/**
 * Seed the default bank account (GL 1002) if no bank accounts exist yet.
 * Called once on server startup.
 */
export async function seedDefaultBankAccount(): Promise<void> {
  try {
    const existing = await db.select({ id: bankAccountsTable.id }).from(bankAccountsTable).limit(1);
    if (existing.length > 0) return;
    await db.insert(bankAccountsTable).values({
      name: "Default Bank Account",
      glCode: "1002",
      isDefault: true,
      isActive: true,
    });
    console.log("[startup] Seeded default bank account (GL 1002).");
  } catch (e) {
    console.error("[startup] Failed to seed default bank account:", e);
  }
}

export async function topUpPettyCash(amount: number, description: string, entryDate: Date, source?: string | null, bankAccountId?: number | null): Promise<void> {
  try {
    const [account] = await db.select().from(pettyCashAccountsTable).limit(1);
    if (!account) return;

    const creditCode = source === "bank_transfer"
      ? await resolveBankGlCode("bank_transfer", bankAccountId)
      : pettyCashSourceAccount(source);
    await postJournalEntry({
      description,
      entryDate,
      lines: [
        { accountCode: "1003", debit: amount },          // Dr Petty Cash
        { accountCode: creditCode, credit: amount },     // Cr funding source
      ],
    });

    await db.update(pettyCashAccountsTable)
      .set({ balance: sql`${pettyCashAccountsTable.balance} + ${amount.toFixed(2)}` })
      .where(eq(pettyCashAccountsTable.id, account.id));

    await db.insert(pettyCashTransactionsTable).values({
      accountId: account.id,
      type: "top_up",
      amount: amount.toFixed(2),
      description,
      referenceType: "top_up",
      referenceId: null,
      transactionDate: entryDate,
    });
  } catch {
    // Never crash
  }
}
