import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const glJournalEntriesTable = pgTable("gl_journal_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  description: text("description").notNull(),
  entryDate: timestamp("entry_date").notNull(),
  status: text("status").notNull().default("posted"), // draft | posted
  referenceType: text("reference_type"), // invoice | expense | payroll | trip_expense | manual
  referenceId: integer("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGlJournalEntrySchema = createInsertSchema(glJournalEntriesTable).omit({ id: true, createdAt: true });
export type InsertGlJournalEntry = z.infer<typeof insertGlJournalEntrySchema>;
export type GlJournalEntry = typeof glJournalEntriesTable.$inferSelect;
