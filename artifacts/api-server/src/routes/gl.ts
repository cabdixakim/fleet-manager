import { Router } from "express";
import { db } from "@workspace/db";
import {
  glAccountsTable,
  glJournalEntriesTable,
  glJournalEntryLinesTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, asc, desc, inArray } from "drizzle-orm";

const router = Router();

// ─── Default Chart of Accounts for a fuel-tanker transport company ──────────
const DEFAULT_COA = [
  // ASSETS
  { code: "1001", name: "Cash",                           type: "asset",     subtype: "current_asset",  isSystem: true },
  { code: "1002", name: "Bank Account",                   type: "asset",     subtype: "current_asset",  isSystem: true },
  { code: "1100", name: "Accounts Receivable",            type: "asset",     subtype: "current_asset",  isSystem: true },
  { code: "1200", name: "Prepaid Expenses",               type: "asset",     subtype: "current_asset",  isSystem: false },
  { code: "1500", name: "Trucks & Vehicles",              type: "asset",     subtype: "fixed_asset",    isSystem: false },
  { code: "1501", name: "Accum. Depreciation — Vehicles", type: "asset",     subtype: "fixed_asset",    isSystem: false },
  { code: "1600", name: "Other Fixed Assets",             type: "asset",     subtype: "fixed_asset",    isSystem: false },
  // LIABILITIES
  { code: "2000", name: "Accounts Payable",               type: "liability", subtype: "current_liability", isSystem: true },
  { code: "2001", name: "Subcontractor Payables",         type: "liability", subtype: "current_liability", isSystem: false },
  { code: "2100", name: "Accrued Salaries",               type: "liability", subtype: "current_liability", isSystem: false },
  { code: "2200", name: "Tax Payable",                    type: "liability", subtype: "current_liability", isSystem: false },
  { code: "2500", name: "Loans Payable",                  type: "liability", subtype: "long_term_liability", isSystem: false },
  // EQUITY
  { code: "3001", name: "Owner's Capital",                type: "equity",    subtype: "equity",         isSystem: true },
  { code: "3002", name: "Retained Earnings",              type: "equity",    subtype: "equity",         isSystem: true },
  // REVENUE
  { code: "4001", name: "Freight Revenue",                type: "revenue",   subtype: "operating",      isSystem: true },
  { code: "4002", name: "Other Income",                   type: "revenue",   subtype: "other_income",   isSystem: false },
  // COST OF REVENUE
  { code: "5001", name: "Fuel Costs",                     type: "expense",   subtype: "cogs",           isSystem: false },
  { code: "5002", name: "Driver Salaries",                type: "expense",   subtype: "cogs",           isSystem: false },
  { code: "5003", name: "Subcontractor Costs",            type: "expense",   subtype: "cogs",           isSystem: false },
  { code: "5004", name: "Border & Clearance Fees",        type: "expense",   subtype: "cogs",           isSystem: false },
  { code: "5005", name: "Vehicle Maintenance",            type: "expense",   subtype: "cogs",           isSystem: false },
  // OPERATING EXPENSES
  { code: "6001", name: "General & Administrative",       type: "expense",   subtype: "operating_expense", isSystem: false },
  { code: "6002", name: "Insurance",                      type: "expense",   subtype: "operating_expense", isSystem: false },
  { code: "6003", name: "Legal & Professional Fees",      type: "expense",   subtype: "operating_expense", isSystem: false },
  { code: "6004", name: "Marketing & Advertising",        type: "expense",   subtype: "operating_expense", isSystem: false },
  { code: "6005", name: "Rent & Utilities",               type: "expense",   subtype: "operating_expense", isSystem: false },
];

// ─── Chart of Accounts ───────────────────────────────────────────────────────

router.get("/accounts", async (req, res, next) => {
  try {
    const accounts = await db
      .select()
      .from(glAccountsTable)
      .orderBy(asc(glAccountsTable.code));
    res.json(accounts);
  } catch (e) { next(e); }
});

router.post("/accounts", async (req, res, next) => {
  try {
    const { code, name, type, subtype, description, parentId } = req.body;
    const [account] = await db
      .insert(glAccountsTable)
      .values({ code, name, type, subtype: subtype ?? null, description: description ?? null, parentId: parentId ?? null, isSystem: false })
      .returning();
    res.status(201).json(account);
  } catch (e) { next(e); }
});

router.put("/accounts/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, subtype, description, active } = req.body;
    const [account] = await db
      .update(glAccountsTable)
      .set({ name, subtype: subtype ?? null, description: description ?? null, active: active ?? true })
      .where(eq(glAccountsTable.id, id))
      .returning();
    res.json(account);
  } catch (e) { next(e); }
});

// Seed default chart of accounts (idempotent)
router.post("/seed", async (req, res, next) => {
  try {
    const existing = await db.select({ code: glAccountsTable.code }).from(glAccountsTable);
    const existingCodes = new Set(existing.map((a) => a.code));
    const toInsert = DEFAULT_COA.filter((a) => !existingCodes.has(a.code));
    if (toInsert.length > 0) {
      await db.insert(glAccountsTable).values(toInsert);
    }
    res.json({ seeded: toInsert.length, skipped: DEFAULT_COA.length - toInsert.length });
  } catch (e) { next(e); }
});

// ─── Journal Entries ──────────────────────────────────────────────────────────

router.get("/entries", async (req, res, next) => {
  try {
    const { from, to, referenceType } = req.query;
    const conditions: any[] = [];
    if (from) conditions.push(gte(glJournalEntriesTable.entryDate, new Date(from as string)));
    if (to)   conditions.push(lte(glJournalEntriesTable.entryDate, new Date(to as string)));
    if (referenceType) conditions.push(eq(glJournalEntriesTable.referenceType, referenceType as string));

    const entries = await db
      .select()
      .from(glJournalEntriesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(glJournalEntriesTable.entryDate), desc(glJournalEntriesTable.id));

    // Attach lines + account names
    const entryIds = entries.map((e) => e.id);
    const lines = entryIds.length > 0
      ? await db
          .select({
            id: glJournalEntryLinesTable.id,
            journalEntryId: glJournalEntryLinesTable.journalEntryId,
            accountId: glJournalEntryLinesTable.accountId,
            accountCode: glAccountsTable.code,
            accountName: glAccountsTable.name,
            debit: glJournalEntryLinesTable.debit,
            credit: glJournalEntryLinesTable.credit,
            description: glJournalEntryLinesTable.description,
          })
          .from(glJournalEntryLinesTable)
          .leftJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
          .where(inArray(glJournalEntryLinesTable.journalEntryId, entryIds))
      : [];

    const linesByEntry = lines.reduce((acc, l) => {
      if (!acc[l.journalEntryId]) acc[l.journalEntryId] = [];
      acc[l.journalEntryId].push(l);
      return acc;
    }, {} as Record<number, typeof lines>);

    res.json(entries.map((e) => ({
      ...e,
      lines: linesByEntry[e.id] ?? [],
      totalDebit: (linesByEntry[e.id] ?? []).reduce((s, l) => s + parseFloat(l.debit as string), 0),
    })));
  } catch (e) { next(e); }
});

router.post("/entries", async (req, res, next) => {
  try {
    const { description, entryDate, referenceType, lines } = req.body as {
      description: string;
      entryDate: string;
      referenceType?: string;
      lines: { accountId: number; debit: number; credit: number; description?: string }[];
    };

    if (!lines || lines.length < 2) {
      return res.status(400).json({ error: "Journal entry requires at least 2 lines" });
    }

    const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: `Entry is not balanced: Dr ${totalDebit.toFixed(2)} ≠ Cr ${totalCredit.toFixed(2)}` });
    }

    const [count] = await db.select({ count: sql<number>`count(*)` }).from(glJournalEntriesTable);
    const entryNumber = `JE-${String(Number(count.count) + 1).padStart(5, "0")}`;

    const [entry] = await db
      .insert(glJournalEntriesTable)
      .values({ entryNumber, description, entryDate: new Date(entryDate), status: "posted", referenceType: referenceType ?? "manual" })
      .returning();

    await db.insert(glJournalEntryLinesTable).values(
      lines.map((l) => ({
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: Number(l.debit).toFixed(2),
        credit: Number(l.credit).toFixed(2),
        description: l.description ?? null,
      }))
    );

    const { logAudit } = await import("../lib/audit");
    await logAudit(req, { action: "create", entity: "journal_entry", entityId: entry.id, description: `Manual journal entry ${entryNumber}: ${description}` });

    res.status(201).json(entry);
  } catch (e) { next(e); }
});

router.delete("/entries/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select().from(glJournalEntriesTable).where(eq(glJournalEntriesTable.id, id));
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    if (entry.referenceType !== "manual") {
      return res.status(400).json({ error: "Only manual journal entries can be deleted. Auto-posted entries are tied to their source transactions." });
    }
    await db.delete(glJournalEntriesTable).where(eq(glJournalEntriesTable.id, id));
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Reports ─────────────────────────────────────────────────────────────────

// Trial Balance — sum of debits and credits per account in a date range
router.get("/reports/trial-balance", async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const conditions: any[] = [];
    if (from) conditions.push(gte(glJournalEntriesTable.entryDate, new Date(from as string)));
    if (to)   conditions.push(lte(glJournalEntriesTable.entryDate, new Date(to as string)));

    const rows = await db
      .select({
        accountId: glJournalEntryLinesTable.accountId,
        code: glAccountsTable.code,
        name: glAccountsTable.name,
        type: glAccountsTable.type,
        subtype: glAccountsTable.subtype,
        totalDebit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.credit}::numeric), 0)`,
      })
      .from(glJournalEntryLinesTable)
      .leftJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
      .leftJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(glJournalEntryLinesTable.accountId, glAccountsTable.code, glAccountsTable.name, glAccountsTable.type, glAccountsTable.subtype)
      .orderBy(asc(glAccountsTable.code));

    const result = rows.map((r) => {
      const dr = parseFloat(r.totalDebit);
      const cr = parseFloat(r.totalCredit);
      return {
        ...r,
        totalDebit: dr,
        totalCredit: cr,
        balance: dr - cr, // positive = debit balance, negative = credit balance
      };
    });

    const grandTotalDebit = result.reduce((s, r) => s + r.totalDebit, 0);
    const grandTotalCredit = result.reduce((s, r) => s + r.totalCredit, 0);

    res.json({ rows: result, grandTotalDebit, grandTotalCredit });
  } catch (e) { next(e); }
});

// P&L Statement — revenue vs expenses in a date range
router.get("/reports/pl", async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const conditions: any[] = [
      inArray(glAccountsTable.type, ["revenue", "expense"]),
    ];
    if (from) conditions.push(gte(glJournalEntriesTable.entryDate, new Date(from as string)));
    if (to)   conditions.push(lte(glJournalEntriesTable.entryDate, new Date(to as string)));

    const rows = await db
      .select({
        code: glAccountsTable.code,
        name: glAccountsTable.name,
        type: glAccountsTable.type,
        subtype: glAccountsTable.subtype,
        totalDebit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.credit}::numeric), 0)`,
      })
      .from(glJournalEntryLinesTable)
      .leftJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
      .leftJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(and(...conditions))
      .groupBy(glAccountsTable.code, glAccountsTable.name, glAccountsTable.type, glAccountsTable.subtype)
      .orderBy(asc(glAccountsTable.code));

    const revenueRows = rows
      .filter((r) => r.type === "revenue")
      .map((r) => ({ ...r, amount: parseFloat(r.totalCredit) - parseFloat(r.totalDebit) }));

    const expenseRows = rows
      .filter((r) => r.type === "expense")
      .map((r) => ({ ...r, amount: parseFloat(r.totalDebit) - parseFloat(r.totalCredit) }));

    const cogsRows = expenseRows.filter((r) => r.subtype === "cogs");
    const opexRows = expenseRows.filter((r) => r.subtype !== "cogs");

    const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
    const totalCogs = cogsRows.reduce((s, r) => s + r.amount, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalOpex = opexRows.reduce((s, r) => s + r.amount, 0);
    const netIncome = grossProfit - totalOpex;

    res.json({ revenueRows, cogsRows, opexRows, totalRevenue, totalCogs, grossProfit, totalOpex, netIncome });
  } catch (e) { next(e); }
});

// Balance Sheet — as of a date
router.get("/reports/balance-sheet", async (req, res, next) => {
  try {
    const { asOf } = req.query;

    const conditions: any[] = [
      inArray(glAccountsTable.type, ["asset", "liability", "equity"]),
    ];
    if (asOf) conditions.push(lte(glJournalEntriesTable.entryDate, new Date(asOf as string)));

    const rows = await db
      .select({
        code: glAccountsTable.code,
        name: glAccountsTable.name,
        type: glAccountsTable.type,
        subtype: glAccountsTable.subtype,
        totalDebit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.credit}::numeric), 0)`,
      })
      .from(glJournalEntryLinesTable)
      .leftJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
      .leftJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(and(...conditions))
      .groupBy(glAccountsTable.code, glAccountsTable.name, glAccountsTable.type, glAccountsTable.subtype)
      .orderBy(asc(glAccountsTable.code));

    // Also compute retained earnings from P&L for all time up to asOf
    const plConditions: any[] = [inArray(glAccountsTable.type, ["revenue", "expense"])];
    if (asOf) plConditions.push(lte(glJournalEntriesTable.entryDate, new Date(asOf as string)));

    const plRows = await db
      .select({
        type: glAccountsTable.type,
        totalDebit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.credit}::numeric), 0)`,
      })
      .from(glJournalEntryLinesTable)
      .leftJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
      .leftJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(and(...plConditions))
      .groupBy(glAccountsTable.type);

    const totalRevenue = plRows.filter((r) => r.type === "revenue").reduce((s, r) => s + parseFloat(r.totalCredit) - parseFloat(r.totalDebit), 0);
    const totalExpense = plRows.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(r.totalDebit) - parseFloat(r.totalCredit), 0);
    const currentPeriodEarnings = totalRevenue - totalExpense;

    const assetRows = rows.filter((r) => r.type === "asset").map((r) => ({ ...r, balance: parseFloat(r.totalDebit) - parseFloat(r.totalCredit) }));
    const liabilityRows = rows.filter((r) => r.type === "liability").map((r) => ({ ...r, balance: parseFloat(r.totalCredit) - parseFloat(r.totalDebit) }));
    const equityRows = rows.filter((r) => r.type === "equity").map((r) => ({ ...r, balance: parseFloat(r.totalCredit) - parseFloat(r.totalDebit) }));

    const totalAssets = assetRows.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0);
    const totalEquity = equityRows.reduce((s, r) => s + r.balance, 0) + currentPeriodEarnings;

    res.json({ assetRows, liabilityRows, equityRows, currentPeriodEarnings, totalAssets, totalLiabilities, totalEquity });
  } catch (e) { next(e); }
});

export default router;
