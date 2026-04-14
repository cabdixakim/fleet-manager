import 'dotenv/config';
import app from "./app";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
});
