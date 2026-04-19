import { Router } from "express";
import { db } from "@workspace/db";
import {
  glAccountsTable,
  glJournalEntriesTable,
  glJournalEntryLinesTable,
  invoicesTable,
  clientsTable,
  suppliersTable,
  supplierPaymentsTable,
  tripExpensesTable,
  companyExpensesTable,
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

// ─── AR Aging ──────────────────────────────────────────────────────────────
router.get("/reports/ar-aging", async (req, res, next) => {
  try {
    const today = new Date();

    const rows = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        netRevenue: invoicesTable.netRevenue,
        issuedDate: invoicesTable.issuedDate,
        dueDate: invoicesTable.dueDate,
        status: invoicesTable.status,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(inArray(invoicesTable.status, ["sent", "overdue"]));

    const enriched = rows.map((inv) => {
      const base = inv.dueDate
        ? new Date(inv.dueDate)
        : inv.issuedDate
          ? new Date(new Date(inv.issuedDate).getTime() + 30 * 86400000)
          : today;
      const ageDays = Math.max(0, Math.floor((today.getTime() - base.getTime()) / 86400000));
      const amount = parseFloat(inv.netRevenue ?? "0");
      return { ...inv, ageDays, amount };
    });

    type ClientBucket = {
      clientId: number; clientName: string;
      current: number; d30: number; d60: number; d90plus: number; total: number;
      invoices: typeof enriched;
    };

    const byClient: Record<string, ClientBucket> = {};
    for (const row of enriched) {
      const key = String(row.clientId);
      if (!byClient[key]) {
        byClient[key] = {
          clientId: row.clientId, clientName: row.clientName ?? "",
          current: 0, d30: 0, d60: 0, d90plus: 0, total: 0, invoices: [],
        };
      }
      const b = byClient[key];
      b.total += row.amount;
      b.invoices.push(row);
      if (row.ageDays <= 30) b.current += row.amount;
      else if (row.ageDays <= 60) b.d30 += row.amount;
      else if (row.ageDays <= 90) b.d60 += row.amount;
      else b.d90plus += row.amount;
    }

    const clients = Object.values(byClient).sort((a, b) => b.total - a.total);
    const summary = clients.reduce(
      (s, c) => ({ current: s.current + c.current, d30: s.d30 + c.d30, d60: s.d60 + c.d60, d90plus: s.d90plus + c.d90plus, total: s.total + c.total }),
      { current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 }
    );

    res.json({ clients, summary, asOf: today.toISOString() });
  } catch (e) { next(e); }
});

// ─── AP Aging ──────────────────────────────────────────────────────────────
router.get("/reports/ap-aging", async (req, res, next) => {
  try {
    const today = new Date();
    const allSuppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);

    const rows = await Promise.all(allSuppliers.map(async (s) => {
      const [tripTot] = await db
        .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(tripExpensesTable).where(eq(tripExpensesTable.supplierId, s.id));
      const [compTot] = await db
        .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(companyExpensesTable).where(eq(companyExpensesTable.supplierId, s.id));
      const [payTot] = await db
        .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
        .from(supplierPaymentsTable).where(eq(supplierPaymentsTable.supplierId, s.id));

      const ob = parseFloat(s.openingBalance ?? "0");
      const charged = parseFloat(tripTot?.total ?? "0") + parseFloat(compTot?.total ?? "0");
      const paid = parseFloat(payTot?.total ?? "0");
      const balance = ob + charged - paid;
      if (balance < 0.01) return null;

      const [latestExp] = await db
        .select({ date: tripExpensesTable.expenseDate })
        .from(tripExpensesTable)
        .where(eq(tripExpensesTable.supplierId, s.id))
        .orderBy(desc(tripExpensesTable.expenseDate))
        .limit(1);

      const baseDate = latestExp?.date ? new Date(latestExp.date) : today;
      const ageDays = Math.max(0, Math.floor((today.getTime() - baseDate.getTime()) / 86400000));

      return {
        supplierId: s.id, supplierName: s.name, supplierType: s.type,
        balance, ageDays,
        current: ageDays <= 30 ? balance : 0,
        d30: ageDays > 30 && ageDays <= 60 ? balance : 0,
        d60: ageDays > 60 && ageDays <= 90 ? balance : 0,
        d90plus: ageDays > 90 ? balance : 0,
      };
    }));

    const suppliers = rows.filter(Boolean).sort((a: any, b: any) => b.balance - a.balance);
    const summary = (suppliers as any[]).reduce(
      (s: any, c: any) => ({ current: s.current + c.current, d30: s.d30 + c.d30, d60: s.d60 + c.d60, d90plus: s.d90plus + c.d90plus, total: s.total + c.balance }),
      { current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 }
    );

    res.json({ suppliers, summary, asOf: today.toISOString() });
  } catch (e) { next(e); }
});

// ─── Cash Flow Statement ────────────────────────────────────────────────────
router.get("/reports/cash-flow", async (req, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    // Cash/bank accounts: type = 'asset' and code starts with 10
    const cashAccounts = await db
      .select({ id: glAccountsTable.id, code: glAccountsTable.code, name: glAccountsTable.name })
      .from(glAccountsTable)
      .where(and(eq(glAccountsTable.type, "asset"), sql`${glAccountsTable.code} LIKE '10%'`));

    const cashAccountIds = cashAccounts.map((a) => a.id);
    if (cashAccountIds.length === 0) return res.json({ operating: [], financing: [], openingCash: 0, closingCash: 0, netChange: 0 });

    const periodConditions: any[] = [];
    if (from) periodConditions.push(gte(glJournalEntriesTable.entryDate, new Date(from)));
    if (to) periodConditions.push(lte(glJournalEntriesTable.entryDate, new Date(to)));

    // Lines touching cash accounts within period
    const cashLines = await db
      .select({
        lineId: glJournalEntryLinesTable.id,
        accountId: glJournalEntryLinesTable.accountId,
        debit: glJournalEntryLinesTable.debit,
        credit: glJournalEntryLinesTable.credit,
        description: glJournalEntryLinesTable.description,
        entryDate: glJournalEntriesTable.entryDate,
        referenceType: glJournalEntriesTable.referenceType,
      })
      .from(glJournalEntryLinesTable)
      .innerJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(and(
        inArray(glJournalEntryLinesTable.accountId, cashAccountIds),
        ...(periodConditions.length ? periodConditions : [])
      ))
      .orderBy(asc(glJournalEntriesTable.entryDate));

    // Opening cash balance (Dr - Cr before period start)
    let openingCash = 0;
    if (from) {
      const [obRow] = await db
        .select({ total: sql<string>`coalesce(sum(${glJournalEntryLinesTable.debit}::numeric - ${glJournalEntryLinesTable.credit}::numeric), 0)` })
        .from(glJournalEntryLinesTable)
        .innerJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
        .where(and(
          inArray(glJournalEntryLinesTable.accountId, cashAccountIds),
          sql`${glJournalEntriesTable.entryDate} < ${from}::timestamp`
        ));
      openingCash = parseFloat(obRow?.total ?? "0");
    }

    // Categorise cash movements
    const OPERATING_TYPES = ["invoice_payment", "company_expense", "trip_expense", "payroll", "sub_payment", "sub_advance", "supplier_payment", "petty_cash_topup", "petty_cash_expense", "petty_cash_replenishment", "opening_balance", "supplier_ob", "subcontractor_ob", "client_ob"];

    type FlowItem = { label: string; amount: number; referenceType: string };
    const operating: Record<string, FlowItem> = {};
    const financing: Record<string, FlowItem> = {};

    const LABELS: Record<string, string> = {
      invoice_payment: "Cash received from customers",
      company_expense: "Cash paid for company expenses",
      trip_expense: "Cash paid for trip expenses",
      payroll: "Cash paid for payroll",
      sub_payment: "Cash paid to subcontractors",
      sub_advance: "Cash advances to subcontractors",
      supplier_payment: "Cash paid to suppliers",
      petty_cash_topup: "Petty cash top-ups",
      petty_cash_expense: "Petty cash disbursements",
      petty_cash_replenishment: "Petty cash replenishments",
      opening_balance: "Opening balance adjustments",
      supplier_ob: "Supplier opening balances",
      subcontractor_ob: "Subcontractor opening balances",
      client_ob: "Client opening balances",
      manual: "Other financing / manual entries",
    };

    let closingCash = openingCash;
    for (const line of cashLines) {
      const dr = parseFloat(line.debit ?? "0");
      const cr = parseFloat(line.credit ?? "0");
      const netAmt = dr - cr; // positive = cash in (Dr increases asset), negative = cash out
      closingCash += netAmt;

      const rt = line.referenceType ?? "manual";
      const bucket = OPERATING_TYPES.includes(rt) ? operating : financing;
      if (!bucket[rt]) bucket[rt] = { label: LABELS[rt] ?? rt, amount: 0, referenceType: rt };
      bucket[rt].amount += netAmt;
    }

    const netChange = closingCash - openingCash;

    res.json({
      operating: Object.values(operating),
      financing: Object.values(financing),
      openingCash,
      closingCash,
      netChange,
      period: { from, to },
    });
  } catch (e) { next(e); }
});

// ─── Expense Breakdown by Account ───────────────────────────────────────────
router.get("/reports/expense-breakdown", async (req, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    const conditions: any[] = [
      eq(glAccountsTable.type, "expense"),
    ];
    if (from) conditions.push(gte(glJournalEntriesTable.entryDate, new Date(from)));
    if (to) conditions.push(lte(glJournalEntriesTable.entryDate, new Date(to)));

    const rows = await db
      .select({
        accountId: glAccountsTable.id,
        code: glAccountsTable.code,
        accountName: glAccountsTable.name,
        totalDebit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.credit}::numeric), 0)`,
      })
      .from(glJournalEntryLinesTable)
      .innerJoin(glAccountsTable, eq(glJournalEntryLinesTable.accountId, glAccountsTable.id))
      .innerJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(and(...conditions))
      .groupBy(glAccountsTable.id, glAccountsTable.code, glAccountsTable.name)
      .orderBy(asc(glAccountsTable.code));

    const accounts = rows.map((r) => {
      const net = parseFloat(r.totalDebit) - parseFloat(r.totalCredit);
      return { ...r, net, totalDebit: parseFloat(r.totalDebit), totalCredit: parseFloat(r.totalCredit) };
    }).filter((r) => r.net !== 0);

    const total = accounts.reduce((s, r) => s + r.net, 0);
    const withPct = accounts.map((r) => ({ ...r, pct: total > 0 ? (r.net / total) * 100 : 0 }));

    res.json({ accounts: withPct, total, period: { from, to } });
  } catch (e) { next(e); }
});

export default router;
