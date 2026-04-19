import { Router } from "express";
import { db } from "@workspace/db";
import {
  bankAccountsTable,
  bankReconciliationItemsTable,
  glAccountsTable,
  glJournalEntryLinesTable,
  glJournalEntriesTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

const router = Router();

async function nextBankGlCode(): Promise<string> {
  const accounts = await db.select({ glCode: bankAccountsTable.glCode }).from(bankAccountsTable);
  const used = new Set(accounts.map((a) => a.glCode));
  for (let code = 1010; code <= 1099; code++) {
    if (!used.has(String(code))) return String(code);
  }
  throw new Error("No available GL codes in range 1010–1099");
}

async function seedBankGlAccount(glCode: string, name: string): Promise<void> {
  const existing = await db.select({ id: glAccountsTable.id }).from(glAccountsTable).where(eq(glAccountsTable.code, glCode)).limit(1);
  if (existing.length > 0) return;
  await db.insert(glAccountsTable).values({ code: glCode, name, type: "asset", subtype: "current_asset", isSystem: false });
}

async function getBankGlBalance(glCode: string): Promise<number> {
  const [glAccount] = await db.select({ id: glAccountsTable.id }).from(glAccountsTable).where(eq(glAccountsTable.code, glCode)).limit(1);
  if (!glAccount) return 0;
  const [result] = await db
    .select({ balance: sql<string>`COALESCE(SUM(${glJournalEntryLinesTable.debit}) - SUM(${glJournalEntryLinesTable.credit}), 0)` })
    .from(glJournalEntryLinesTable)
    .where(eq(glJournalEntryLinesTable.accountId, glAccount.id));
  return parseFloat(result?.balance ?? "0");
}

router.get("/", async (_req, res, next) => {
  try {
    const accounts = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.id);
    const withBalances = await Promise.all(
      accounts.map(async (a) => ({ ...a, glBalance: await getBankGlBalance(a.glCode) }))
    );
    res.json(withBalances);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, bankName, accountNumber } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const glCode = await nextBankGlCode();
    await seedBankGlAccount(glCode, `${name.trim()} — Bank`);
    const [account] = await db.insert(bankAccountsTable).values({
      name: name.trim(),
      bankName: bankName?.trim() || null,
      accountNumber: accountNumber?.trim() || null,
      glCode,
      isDefault: false,
      isActive: true,
    }).returning();
    res.status(201).json(account);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, bankName, accountNumber, isActive } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (bankName !== undefined) updateData.bankName = bankName?.trim() || null;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    const [updated] = await db.update(bankAccountsTable).set(updateData).where(eq(bankAccountsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isDefault) return res.status(400).json({ error: "Cannot delete the default bank account" });
    await db.update(bankAccountsTable).set({ isActive: false }).where(eq(bankAccountsTable.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "Not found" });
    const glBalance = await getBankGlBalance(account.glCode);
    res.json({ ...account, glBalance });
  } catch (e) { next(e); }
});

router.get("/:id/transactions", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [bankAccount] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!bankAccount) return res.status(404).json({ error: "Not found" });

    const [glAccount] = await db.select({ id: glAccountsTable.id })
      .from(glAccountsTable).where(eq(glAccountsTable.code, bankAccount.glCode)).limit(1);
    if (!glAccount) return res.json([]);

    const lines = await db
      .select({
        lineId: glJournalEntryLinesTable.id,
        journalEntryId: glJournalEntryLinesTable.journalEntryId,
        debit: glJournalEntryLinesTable.debit,
        credit: glJournalEntryLinesTable.credit,
        lineDescription: glJournalEntryLinesTable.description,
        entryDate: glJournalEntriesTable.entryDate,
        entryNumber: glJournalEntriesTable.entryNumber,
        entryDescription: glJournalEntriesTable.description,
        referenceType: glJournalEntriesTable.referenceType,
        referenceId: glJournalEntriesTable.referenceId,
      })
      .from(glJournalEntryLinesTable)
      .innerJoin(glJournalEntriesTable, eq(glJournalEntryLinesTable.journalEntryId, glJournalEntriesTable.id))
      .where(eq(glJournalEntryLinesTable.accountId, glAccount.id))
      .orderBy(glJournalEntriesTable.entryDate);

    const lineIds = lines.map((l) => l.lineId);
    const clearedItems = lineIds.length > 0
      ? await db.select().from(bankReconciliationItemsTable)
          .where(and(
            eq(bankReconciliationItemsTable.bankAccountId, id),
            inArray(bankReconciliationItemsTable.glEntryLineId, lineIds)
          ))
      : [];
    const clearedMap = new Map(clearedItems.map((c) => [c.glEntryLineId, c.isCleared]));

    res.json(lines.map((l) => ({
      ...l,
      debit: parseFloat(l.debit),
      credit: parseFloat(l.credit),
      isCleared: clearedMap.get(l.lineId) ?? false,
    })));
  } catch (e) { next(e); }
});

router.post("/:id/reconcile", async (req, res, next) => {
  try {
    const bankAccountId = parseInt(req.params.id);
    const { lineIds, isCleared } = req.body;
    if (!Array.isArray(lineIds)) return res.status(400).json({ error: "lineIds must be an array" });

    for (const glEntryLineId of lineIds as number[]) {
      const [existing] = await db.select().from(bankReconciliationItemsTable)
        .where(and(
          eq(bankReconciliationItemsTable.bankAccountId, bankAccountId),
          eq(bankReconciliationItemsTable.glEntryLineId, glEntryLineId)
        )).limit(1);

      if (existing) {
        await db.update(bankReconciliationItemsTable)
          .set({ isCleared, clearedAt: isCleared ? new Date() : null })
          .where(eq(bankReconciliationItemsTable.id, existing.id));
      } else {
        await db.insert(bankReconciliationItemsTable).values({
          bankAccountId,
          glEntryLineId,
          isCleared,
          clearedAt: isCleared ? new Date() : null,
        });
      }
    }

    res.json({ ok: true, updated: lineIds.length });
  } catch (e) { next(e); }
});

export default router;
