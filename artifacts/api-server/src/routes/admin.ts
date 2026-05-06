import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, companySettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

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

export default router;
