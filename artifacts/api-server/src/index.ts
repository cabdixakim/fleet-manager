import 'dotenv/config';
import app from "./app";
import { db } from "@workspace/db";
import { sql, count } from "drizzle-orm";
import { seedGLAccounts, backfillGLEntries, seedPettyCashAccount } from "./lib/glBackfill";
import { seedDefaultBankAccount } from "./lib/glPosting";
import { lanesTable } from "@workspace/db/schema";

const DEFAULT_LANES = [
  { value: "dar_to_lubumbashi",   label: "Dar es Salaam → Lubumbashi", short: "Dar → Lub",        chart: "Dar→Lbm",   sortOrder: 0 },
  { value: "beira_to_lubumbashi", label: "Beira → Lubumbashi",         short: "Beira → Lub",      chart: "Beira→Lbm", sortOrder: 1 },
  { value: "ndola_lubumbashi",    label: "Ndola → Lubumbashi",         short: "Ndola → Lub",      chart: "Ndola→Lbm", sortOrder: 2 },
  { value: "lusaka_lubumbashi",   label: "Lusaka → Lubumbashi",        short: "Lusaka → Lub",     chart: "Lsk→Lbm",   sortOrder: 3 },
  { value: "dar_lusaka",          label: "Dar es Salaam → Lusaka",     short: "Dar → Lusaka",     chart: "Dar→Lsk",   sortOrder: 4 },
  { value: "beira_lusaka",        label: "Beira → Lusaka",             short: "Beira → Lusaka",   chart: "Beira→Lsk", sortOrder: 5 },
  { value: "durban_lusaka",       label: "Durban → Lusaka",            short: "Durban → Lusaka",  chart: "Dur→Lsk",   sortOrder: 6 },
  { value: "ndola_kolwezi",       label: "Ndola → Kolwezi",            short: "Ndola → Kolwezi",  chart: "Ndl→Klw",   sortOrder: 7 },
  { value: "lusaka_kolwezi",      label: "Lusaka → Kolwezi",           short: "Lusaka → Kolwezi", chart: "Lsk→Klw",   sortOrder: 8 },
];

async function seedLanes() {
  const [{ value: existing }] = await db.select({ value: count() }).from(lanesTable);
  if (existing === 0) {
    await db.insert(lanesTable).values(DEFAULT_LANES);
    console.log(`[startup] Seeded ${DEFAULT_LANES.length} default lanes.`);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function backfillTripSubcontractors() {
  try {
    const result = await db.execute(sql`
      UPDATE trips
      SET subcontractor_id = trucks.subcontractor_id
      FROM trucks
      WHERE trips.truck_id = trucks.id
        AND trips.subcontractor_id IS NULL
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[startup] Backfilled subcontractor_id on ${count} trip(s).`);
  } catch (e) {
    console.error("[startup] Failed to backfill trip subcontractor_id:", e);
  }
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await backfillTripSubcontractors();

  // Ensure GL chart of accounts is seeded, then backfill any un-posted historical entries
  try {
    const seeded = await seedGLAccounts();
    if (seeded > 0) console.log(`[startup] Seeded ${seeded} GL account(s).`);
    await seedPettyCashAccount();
    await seedDefaultBankAccount();
    const backfill = await backfillGLEntries();
    const total = backfill.invoices + backfill.payments + backfill.expenses + backfill.tripExpenses + backfill.payroll;
    if (total > 0) {
      console.log(`[startup] GL backfill: ${backfill.invoices} invoices, ${backfill.payments} payments, ${backfill.expenses} company expenses, ${backfill.tripExpenses} trip expenses, ${backfill.payroll} payroll entries posted.`);
    }
  } catch (e) {
    console.error("[startup] GL seed/backfill failed:", e);
  }

  try { await seedLanes(); } catch (e) { console.error("[startup] Lane seed failed:", e); }
});
