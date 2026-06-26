import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, companySettingsTable, tripsTable, batchesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

async function getCallerRole(req: any): Promise<string | null> {
  const s = req.session as any;
  if (!s?.userId) return null;
  const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, s.userId));
  return u?.role ?? null;
}

router.delete("/clear-test-data", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (callerRole !== "owner") {
      return res.status(403).json({ error: "Only the owner can clear test data." });
    }

    // Check it hasn't already been used
    const [settings] = await db.select({ testDataCleared: companySettingsTable.testDataCleared, id: companySettingsTable.id })
      .from(companySettingsTable).limit(1);
    if (settings?.testDataCleared) {
      return res.status(409).json({ error: "Test data has already been cleared. This action is one-time only." });
    }

    // Delete in FK-safe order, most-dependent tables first
    await db.execute(sql`DELETE FROM gl_journal_entry_lines`);
    await db.execute(sql`DELETE FROM gl_journal_entries`);
    await db.execute(sql`DELETE FROM client_transactions`);
    await db.execute(sql`DELETE FROM trip_amendments`);
    await db.execute(sql`DELETE FROM delivery_notes`);
    await db.execute(sql`DELETE FROM trip_checkpoints`);
    await db.execute(sql`DELETE FROM trip_expenses`);
    await db.execute(sql`DELETE FROM clearances`);
    await db.execute(sql`DELETE FROM invoices`);
    await db.execute(sql`DELETE FROM trips`);
    await db.execute(sql`DELETE FROM batches`);
    await db.execute(sql`DELETE FROM clients`);

    // Stamp the flag — self-destruct
    if (settings?.id) {
      await db.update(companySettingsTable)
        .set({ testDataCleared: true })
        .where(eq(companySettingsTable.id, settings.id));
    }

    res.json({ success: true, message: "Test data cleared. This button has been permanently disabled." });
  } catch (e) { next(e); }
});

router.delete("/destroy-fleet", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (callerRole !== "owner") {
      return res.status(403).json({ error: "Only the owner can do this." });
    }

    const [settings] = await db.select({ fleetDataDestroyed: companySettingsTable.fleetDataDestroyed, id: companySettingsTable.id })
      .from(companySettingsTable).limit(1);
    if (settings?.fleetDataDestroyed) {
      return res.status(409).json({ error: "Fleet data has already been destroyed. This action is one-time only." });
    }

    // Notifications
    await db.execute(sql`DELETE FROM notifications`);

    // Expenses — GL lines best-effort (table may not exist in all envs)
    try { await db.execute(sql`DELETE FROM gl_journal_entry_lines WHERE entry_id IN (SELECT id FROM gl_journal_entries WHERE reference_type = 'trip_expense')`); } catch {}
    try { await db.execute(sql`DELETE FROM gl_journal_entries WHERE reference_type = 'trip_expense'`); } catch {}
    await db.execute(sql`DELETE FROM trip_expenses`);

    // Truck-linked records — best-effort for tables that may not exist in all envs
    try { await db.execute(sql`DELETE FROM truck_driver_assignments`); } catch {}
    try { await db.execute(sql`DELETE FROM maintenance`); } catch {}
    try { await db.execute(sql`DELETE FROM insurance_claims`); } catch {}

    // Self-referential FK on trailers (current_horse_id)
    await db.execute(sql`UPDATE trucks SET current_horse_id = NULL`);

    // Also clear denorm on horses
    await db.execute(sql`UPDATE trucks SET trailer_plate = NULL`);

    // All trucks (horses + trailers)
    await db.execute(sql`DELETE FROM trucks`);

    // Stamp the flag — self-destruct
    if (settings?.id) {
      await db.update(companySettingsTable)
        .set({ fleetDataDestroyed: true })
        .where(eq(companySettingsTable.id, settings.id));
    }

    res.json({ success: true, message: "Fleet data destroyed. This button has been permanently disabled." });
  } catch (e) { next(e); }
});

// DELETE /api/admin/reset-trips-batches
// Owner-only. Deletes all trips, batches, nominations and all child records.
// Trucks, drivers, subcontractors, clients, GL accounts — all untouched.
router.delete("/reset-trips-batches", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (callerRole !== "owner") {
      return res.status(403).json({ error: "Only the owner can reset trips and batches." });
    }

    await db.execute(sql`DELETE FROM driver_payroll_allocations`);
    await db.execute(sql`DELETE FROM driver_payroll`);
    await db.execute(sql`DELETE FROM gl_journal_entry_lines`);
    await db.execute(sql`DELETE FROM gl_journal_entries`);
    await db.execute(sql`DELETE FROM insurance_claims`);
    await db.execute(sql`DELETE FROM subcontractor_transactions`);
    await db.execute(sql`DELETE FROM client_transactions`);
    await db.execute(sql`DELETE FROM trip_amendments`);
    await db.execute(sql`DELETE FROM delivery_notes`);
    await db.execute(sql`DELETE FROM trip_checkpoints`);
    await db.execute(sql`DELETE FROM trip_expenses`);
    await db.execute(sql`DELETE FROM clearances`);
    await db.execute(sql`DELETE FROM invoices`);
    await db.execute(sql`DELETE FROM trips`);
    await db.execute(sql`DELETE FROM batches`);

    await logAudit(db, {
      userId: (req.session as any)?.userId ?? null,
      action: "reset_trips_batches",
      entity: "admin",
      entityId: null,
      details: { message: "All trips and batches deleted by owner" },
    });

    res.json({ success: true, message: "All trips and batches have been deleted. Trucks, drivers, clients and other data are untouched." });
  } catch (e) { next(e); }
});


// POST /api/admin/fix-op27-product
// One-shot: voids INV-0007, sets all OP-27 trips product → PMS, reverts batch to delivered.
router.post("/fix-op27-product", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (callerRole !== "owner") {
      return res.status(403).json({ error: "Only the owner can run this fix." });
    }

    const BATCH_DB_ID = 3;
    const INVOICE_ID = 7;

    await db.transaction(async (tx) => {
      // 1. Clear invoice_id on all trips + set product to PMS
      await tx.update(tripsTable)
        .set({ product: "PMS", invoiceId: null })
        .where(eq(tripsTable.batchId, BATCH_DB_ID));

      // 2. Delete client transactions for INV-0007
      await tx.execute(sql`DELETE FROM client_transactions WHERE invoice_id = ${INVOICE_ID}`);

      // 3. Delete the invoice
      await tx.execute(sql`DELETE FROM invoices WHERE id = ${INVOICE_ID}`);

      // 4. Revert batch to delivered
      await tx.update(batchesTable)
        .set({ status: "delivered" })
        .where(eq(batchesTable.id, BATCH_DB_ID));
    });

    await logAudit(req, {
      action: "fix_op27_product",
      entity: "admin",
      entityId: BATCH_DB_ID,
      description: "One-shot fix: OP-27 all trips product set to PMS, INV-0007 voided, batch reverted to delivered.",
    });

    res.json({ success: true, message: "Done. INV-0007 voided, all OP-27 trips set to PMS, batch back to delivered." });
  } catch (e) { next(e); }
});

export default router;
