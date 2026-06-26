import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray } from "drizzle-orm";
import { tripsTable, invoicesTable, clientTransactionsTable, batchesTable } from "@workspace/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  const BATCH_DB_ID = 3;
  const INVOICE_IDS = [5, 6];
  const CLIENT_TX_INVOICE_ID = 6;

  await db.transaction(async (tx) => {
    // 1. Get all trips first
    const batchTrips = await tx
      .select({ id: tripsTable.id, loadedQty: tripsTable.loadedQty, deliveredQty: tripsTable.deliveredQty })
      .from(tripsTable)
      .where(eq(tripsTable.batchId, BATCH_DB_ID));

    // 2. Divide loaded_qty and delivered_qty by 1000 (litres → m³) and clear invoice_id
    for (const t of batchTrips) {
      const newLoaded = (parseFloat(t.loadedQty ?? "0") / 1000).toFixed(3);
      const newDelivered = (parseFloat(t.deliveredQty ?? "0") / 1000).toFixed(3);
      await tx.update(tripsTable)
        .set({ loadedQty: newLoaded, deliveredQty: newDelivered, invoiceId: null })
        .where(eq(tripsTable.id, t.id));
      console.log(`  Trip ${t.id}: ${t.loadedQty} → ${newLoaded} m³  |  ${t.deliveredQty} → ${newDelivered} m³`);
    }
    console.log("✓ Corrected all trip quantities (÷1000) and cleared invoice links");

    // 3. Delete client transactions linked to INV-0006
    await tx.delete(clientTransactionsTable)
      .where(eq(clientTransactionsTable.invoiceId, CLIENT_TX_INVOICE_ID));
    console.log("✓ Deleted client transaction for INV-0006");

    // 4. Delete both invoices
    await tx.delete(invoicesTable)
      .where(inArray(invoicesTable.id, INVOICE_IDS));
    console.log("✓ Deleted INV-0005 and INV-0006");

    // 5. Revert batch status to delivered
    await tx.update(batchesTable)
      .set({ status: "delivered" })
      .where(eq(batchesTable.id, BATCH_DB_ID));
    console.log("✓ Batch OP-27 status → delivered");
  });

  console.log("\n✅ Done. OP-27 is clean and ready for re-invoicing.");
  await pool.end();
}

main().catch((e) => { console.error("❌ FAILED:", e); process.exit(1); });
