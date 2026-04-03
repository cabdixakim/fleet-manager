import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { batchesTable } from "./batches";

export const clientTransactionsTable = pgTable("client_transactions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  type: text("type").notNull(), // invoice, advance, payment, adjustment
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reference: text("reference"), // invoice number or reference
  batchId: integer("batch_id").references(() => batchesTable.id),
  invoiceId: integer("invoice_id"),
  description: text("description"),
  transactionDate: timestamp("transaction_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientTransactionSchema = createInsertSchema(clientTransactionsTable).omit({ id: true, createdAt: true });
export type InsertClientTransaction = z.infer<typeof insertClientTransactionSchema>;
export type ClientTransaction = typeof clientTransactionsTable.$inferSelect;
