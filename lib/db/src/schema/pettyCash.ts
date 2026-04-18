import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pettyCashAccountsTable = pgTable("petty_cash_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Petty Cash"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pettyCashTransactionsTable = pgTable("petty_cash_transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => pettyCashAccountsTable.id),
  type: text("type").notNull(), // top_up | expense
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  referenceType: text("reference_type"), // trip_expense | company_expense | top_up
  referenceId: integer("reference_id"),
  transactionDate: timestamp("transaction_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPettyCashTransactionSchema = createInsertSchema(pettyCashTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPettyCashTransaction = z.infer<typeof insertPettyCashTransactionSchema>;
export type PettyCashTransaction = typeof pettyCashTransactionsTable.$inferSelect;
