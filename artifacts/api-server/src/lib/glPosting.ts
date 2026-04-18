import { db } from "@workspace/db";
import {
  glJournalEntriesTable,
  glJournalEntryLinesTable,
  glAccountsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

async function getAccountByCode(code: string) {
  const [account] = await db.select().from(glAccountsTable).where(eq(glAccountsTable.code, code));
  return account ?? null;
}

async function getNextEntryNumber(): Promise<string> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(glJournalEntriesTable);
  const num = Number(row?.count ?? 0) + 1;
  return `JE-${String(num).padStart(5, "0")}`;
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

/**
 * Post a balanced journal entry. Skips if already posted for the same referenceType+referenceId.
 * Silently fails if GL accounts are not seeded yet (system not yet configured).
 */
export async function postJournalEntry(params: PostParams): Promise<void> {
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
      if (existing.length > 0) return;
    }

    // Resolve account IDs — if any account is missing, skip silently (COA not seeded)
    const resolved: { accountId: number; debit: number; credit: number; description?: string }[] = [];
    for (const l of lines) {
      const account = await getAccountByCode(l.accountCode);
      if (!account) return; // COA not ready
      resolved.push({ accountId: account.id, debit: l.debit ?? 0, credit: l.credit ?? 0, description: l.description });
    }

    // Validate balanced
    const totalDebit = resolved.reduce((s, l) => s + l.debit, 0);
    const totalCredit = resolved.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return; // unbalanced — skip silently

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
  } catch {
    // GL posting errors must never crash main transaction flow
  }
}
