import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { glJournalEntriesTable } from "./glJournalEntries";
import { glAccountsTable } from "./glAccounts";

export const glJournalEntryLinesTable = pgTable("gl_journal_entry_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => glJournalEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => glAccountsTable.id),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGlJournalEntryLineSchema = createInsertSchema(glJournalEntryLinesTable).omit({ id: true, createdAt: true });
export type InsertGlJournalEntryLine = z.infer<typeof insertGlJournalEntryLineSchema>;
export type GlJournalEntryLine = typeof glJournalEntryLinesTable.$inferSelect;
