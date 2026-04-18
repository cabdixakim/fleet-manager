import 'dotenv/config';
import app from "./app";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { seedGLAccounts, backfillGLEntries } from "./lib/glBackfill";

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
    const backfill = await backfillGLEntries();
    const total = backfill.invoices + backfill.payments + backfill.expenses + backfill.tripExpenses + backfill.payroll;
    if (total > 0) {
      console.log(`[startup] GL backfill: ${backfill.invoices} invoices, ${backfill.payments} payments, ${backfill.expenses} company expenses, ${backfill.tripExpenses} trip expenses, ${backfill.payroll} payroll entries posted.`);
    }
  } catch (e) {
    console.error("[startup] GL seed/backfill failed:", e);
  }
});
