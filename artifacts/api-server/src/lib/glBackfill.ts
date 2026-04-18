import { db } from "@workspace/db";
import {
  glAccountsTable,
  glJournalEntriesTable,
  invoicesTable,
  companyExpensesTable,
  driverPayrollTable,
  clientsTable,
  tripExpensesTable,
  pettyCashAccountsTable,
} from "@workspace/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { postJournalEntry, EXPENSE_ACCOUNT_MAP, TRIP_EXPENSE_ACCOUNT_MAP, creditAccountForPaymentMethod } from "./glPosting";

const DEFAULT_COA = [
  { code: "1001", name: "Cash",                            type: "asset",     subtype: "current_asset",        isSystem: true  },
  { code: "1002", name: "Bank Account",                    type: "asset",     subtype: "current_asset",        isSystem: true  },
  { code: "1003", name: "Petty Cash",                      type: "asset",     subtype: "current_asset",        isSystem: true  },
  { code: "1100", name: "Accounts Receivable",             type: "asset",     subtype: "current_asset",        isSystem: true  },
  { code: "1200", name: "Prepaid Expenses",                type: "asset",     subtype: "current_asset",        isSystem: false },
  { code: "1500", name: "Trucks & Vehicles",               type: "asset",     subtype: "fixed_asset",          isSystem: false },
  { code: "1501", name: "Accum. Depreciation — Vehicles",  type: "asset",     subtype: "fixed_asset",          isSystem: false },
  { code: "1600", name: "Other Fixed Assets",              type: "asset",     subtype: "fixed_asset",          isSystem: false },
  { code: "2000", name: "Accounts Payable",                type: "liability", subtype: "current_liability",    isSystem: true  },
  { code: "2001", name: "Subcontractor Payables",          type: "liability", subtype: "current_liability",    isSystem: true  },
  { code: "2050", name: "Supplier Payables",               type: "liability", subtype: "current_liability",    isSystem: true  },
  { code: "2100", name: "Accrued Salaries",                type: "liability", subtype: "current_liability",    isSystem: false },
  { code: "2200", name: "Tax Payable",                     type: "liability", subtype: "current_liability",    isSystem: false },
  { code: "2500", name: "Loans Payable",                   type: "liability", subtype: "long_term_liability",  isSystem: false },
  { code: "3001", name: "Owner's Capital",                 type: "equity",    subtype: "equity",               isSystem: true  },
  { code: "3002", name: "Retained Earnings",               type: "equity",    subtype: "equity",               isSystem: true  },
  { code: "4001", name: "Freight Revenue",                 type: "revenue",   subtype: "operating",            isSystem: true  },
  { code: "4002", name: "Other Income",                    type: "revenue",   subtype: "other_income",         isSystem: false },
  { code: "5001", name: "Fuel Costs",                      type: "expense",   subtype: "cogs",                 isSystem: false },
  { code: "5002", name: "Driver Salaries",                 type: "expense",   subtype: "cogs",                 isSystem: false },
  { code: "5003", name: "Subcontractor Costs",             type: "expense",   subtype: "cogs",                 isSystem: true  },
  { code: "5004", name: "Border & Clearance Fees",         type: "expense",   subtype: "cogs",                 isSystem: false },
  { code: "5005", name: "Vehicle Maintenance",             type: "expense",   subtype: "cogs",                 isSystem: false },
  { code: "6001", name: "General & Administrative",        type: "expense",   subtype: "operating_expense",    isSystem: false },
  { code: "6002", name: "Insurance",                       type: "expense",   subtype: "operating_expense",    isSystem: false },
  { code: "6003", name: "Legal & Professional Fees",       type: "expense",   subtype: "operating_expense",    isSystem: false },
  { code: "6004", name: "Marketing & Advertising",         type: "expense",   subtype: "operating_expense",    isSystem: false },
  { code: "6005", name: "Rent & Utilities",                type: "expense",   subtype: "operating_expense",    isSystem: false },
];

export async function seedGLAccounts(): Promise<number> {
  const existing = await db.select({ code: glAccountsTable.code }).from(glAccountsTable);
  const existingCodes = new Set(existing.map((a) => a.code));
  const toInsert = DEFAULT_COA.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length > 0) {
    await db.insert(glAccountsTable).values(toInsert as any[]);
  }
  return toInsert.length;
}

export async function seedPettyCashAccount(): Promise<void> {
  const existing = await db.select({ id: pettyCashAccountsTable.id }).from(pettyCashAccountsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(pettyCashAccountsTable).values({ name: "Petty Cash", balance: "0", currency: "USD" });
  }
}

async function alreadyPosted(refType: string, refId: number): Promise<boolean> {
  const rows = await db
    .select({ id: glJournalEntriesTable.id })
    .from(glJournalEntriesTable)
    .where(and(
      eq(glJournalEntriesTable.referenceType, refType),
      eq(glJournalEntriesTable.referenceId, refId),
    ))
    .limit(1);
  return rows.length > 0;
}

export async function backfillGLEntries(): Promise<{ invoices: number; payments: number; expenses: number; tripExpenses: number; payroll: number }> {
  let invoiceCount = 0;
  let paymentCount = 0;
  let expenseCount = 0;
  let tripExpenseCount = 0;
  let payrollCount = 0;

  // ── Invoices → Dr AR / Cr Revenue ────────────────────────────────────────
  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      netRevenue: invoicesTable.netRevenue,
      issuedDate: invoicesTable.issuedDate,
      clientId: invoicesTable.clientId,
    })
    .from(invoicesTable)
    .orderBy(asc(invoicesTable.id));

  for (const inv of invoices) {
    if (await alreadyPosted("invoice", inv.id)) continue;
    const net = parseFloat(inv.netRevenue as string);
    if (net <= 0) continue;
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, inv.clientId));
    await postJournalEntry({
      description: `Invoice ${inv.invoiceNumber} — ${client?.name ?? "client"}`,
      entryDate: inv.issuedDate ? new Date(inv.issuedDate) : new Date(),
      referenceType: "invoice",
      referenceId: inv.id,
      lines: [
        { accountCode: "1100", debit: net, description: `AR — ${inv.invoiceNumber}` },
        { accountCode: "4001", credit: net, description: "Freight Revenue" },
      ],
    });
    invoiceCount++;
  }

  // ── Paid invoices → Dr Bank / Cr AR ──────────────────────────────────────
  const paidInvoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      netRevenue: invoicesTable.netRevenue,
      createdAt: invoicesTable.createdAt,
      clientId: invoicesTable.clientId,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.status, "paid"))
    .orderBy(asc(invoicesTable.id));

  for (const inv of paidInvoices) {
    if (await alreadyPosted("invoice_payment", inv.id)) continue;
    const net = parseFloat(inv.netRevenue as string);
    if (net <= 0) continue;
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, inv.clientId));
    await postJournalEntry({
      description: `Payment received — ${inv.invoiceNumber} — ${client?.name ?? "client"}`,
      entryDate: new Date(inv.createdAt),
      referenceType: "invoice_payment",
      referenceId: inv.id,
      lines: [
        { accountCode: "1002", debit: net, description: "Bank Account" },
        { accountCode: "1100", credit: net, description: `Clear AR — ${inv.invoiceNumber}` },
      ],
    });
    paymentCount++;
  }

  // ── Company expenses → Dr Expense / Cr correct account ───────────────────
  const expenses = await db
    .select({
      id: companyExpensesTable.id,
      category: companyExpensesTable.category,
      description: companyExpensesTable.description,
      amount: companyExpensesTable.amount,
      expenseDate: companyExpensesTable.expenseDate,
      paymentMethod: companyExpensesTable.paymentMethod,
    })
    .from(companyExpensesTable)
    .orderBy(asc(companyExpensesTable.id));

  for (const exp of expenses) {
    if (await alreadyPosted("company_expense", exp.id)) continue;
    const amount = parseFloat(exp.amount as string);
    if (amount <= 0) continue;
    const expenseAccountCode = EXPENSE_ACCOUNT_MAP[exp.category ?? "other"] ?? "6001";
    const creditCode = creditAccountForPaymentMethod(exp.paymentMethod);
    await postJournalEntry({
      description: exp.description ?? `${exp.category} expense`,
      entryDate: new Date(exp.expenseDate),
      referenceType: "company_expense",
      referenceId: exp.id,
      lines: [
        { accountCode: expenseAccountCode, debit: amount, description: exp.description },
        { accountCode: creditCode, credit: amount, description: "Payment" },
      ],
    });
    expenseCount++;
  }

  // ── Trip Expenses → Dr cost account / Cr correct account ─────────────────
  const tripExpenses = await db
    .select({
      id: tripExpensesTable.id,
      costType: tripExpensesTable.costType,
      description: tripExpensesTable.description,
      amount: tripExpensesTable.amount,
      expenseDate: tripExpensesTable.expenseDate,
      tripId: tripExpensesTable.tripId,
      batchId: tripExpensesTable.batchId,
      truckId: tripExpensesTable.truckId,
      paymentMethod: tripExpensesTable.paymentMethod,
    })
    .from(tripExpensesTable)
    .orderBy(asc(tripExpensesTable.id));

  for (const exp of tripExpenses) {
    if (await alreadyPosted("trip_expense", exp.id)) continue;
    const amount = parseFloat(exp.amount as string);
    if (amount <= 0) continue;
    const glAccount = TRIP_EXPENSE_ACCOUNT_MAP[exp.costType ?? "other"] ?? "6001";
    const creditCode = creditAccountForPaymentMethod(exp.paymentMethod);
    const contextLabel = exp.tripId ? `trip #${exp.tripId}` : exp.batchId ? `batch #${exp.batchId}` : exp.truckId ? `truck #${exp.truckId}` : "general";
    await postJournalEntry({
      description: `${exp.costType ?? "Expense"} — ${contextLabel}${exp.description ? `: ${exp.description}` : ""}`,
      entryDate: new Date(exp.expenseDate),
      referenceType: "trip_expense",
      referenceId: exp.id,
      lines: [
        { accountCode: glAccount, debit: amount, description: exp.description ?? exp.costType ?? undefined },
        { accountCode: creditCode, credit: amount, description: "Payment" },
      ],
    });
    tripExpenseCount++;
  }

  // ── Payroll → Dr Staff Expense / Cr AP ───────────────────────────────────
  const payrollRows = await db
    .select({
      id: driverPayrollTable.id,
      driverId: driverPayrollTable.driverId,
      month: driverPayrollTable.month,
      year: driverPayrollTable.year,
      monthlySalary: driverPayrollTable.monthlySalary,
    })
    .from(driverPayrollTable)
    .orderBy(asc(driverPayrollTable.id));

  for (const p of payrollRows) {
    if (await alreadyPosted("payroll", p.id)) continue;
    const salary = parseFloat(p.monthlySalary as string);
    if (salary <= 0) continue;
    await postJournalEntry({
      description: `Payroll — driver #${p.driverId} ${p.month}/${p.year}`,
      entryDate: new Date(p.year, p.month - 1, 1),
      referenceType: "payroll",
      referenceId: p.id,
      lines: [
        { accountCode: "5002", debit: salary, description: "Driver salary" },
        { accountCode: "2000", credit: salary, description: "Accounts Payable" },
      ],
    });
    payrollCount++;
  }

  return { invoices: invoiceCount, payments: paymentCount, expenses: expenseCount, tripExpenses: tripExpenseCount, payroll: payrollCount };
}
