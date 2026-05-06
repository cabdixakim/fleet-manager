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

export default router;
