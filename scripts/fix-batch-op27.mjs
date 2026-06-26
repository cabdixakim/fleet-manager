import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get all trips for batch 3 (OP-27)
    const tripsRes = await client.query(
      "SELECT id, loaded_qty, delivered_qty FROM trips WHERE batch_id = $1 ORDER BY id",
      [3]
    );

    // 2. Divide loaded_qty and delivered_qty by 1000, clear invoice_id
    for (const t of tripsRes.rows) {
      const newLoaded = (parseFloat(t.loaded_qty) / 1000).toFixed(3);
      const newDelivered = (parseFloat(t.delivered_qty) / 1000).toFixed(3);
      await client.query(
        "UPDATE trips SET loaded_qty = $1, delivered_qty = $2, invoice_id = NULL WHERE id = $3",
        [newLoaded, newDelivered, t.id]
      );
      console.log(`  Trip ${t.id}: ${t.loaded_qty} → ${newLoaded} m³  |  ${t.delivered_qty} → ${newDelivered} m³`);
    }
    console.log("✓ Corrected all trip quantities (÷1000) and cleared invoice links");

    // 3. Delete client transaction for INV-0006 (invoice_id = 6)
    const ctDel = await client.query(
      "DELETE FROM client_transactions WHERE invoice_id = ANY($1::int[])",
      [[5, 6]]
    );
    console.log(`✓ Deleted ${ctDel.rowCount} client transaction(s)`);

    // 4. Delete both invoices (ids 5 and 6)
    const invDel = await client.query(
      "DELETE FROM invoices WHERE id = ANY($1::int[])",
      [[5, 6]]
    );
    console.log(`✓ Deleted ${invDel.rowCount} invoice(s) (INV-0005, INV-0006)`);

    // 5. Revert batch status to delivered
    await client.query(
      "UPDATE batches SET status = $1 WHERE id = $2",
      ["delivered", 3]
    );
    console.log("✓ Batch OP-27 status → delivered");

    await client.query("COMMIT");
    console.log("\n✅ Done. OP-27 is clean and ready for re-invoicing.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLED BACK:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
