import { pgTable, serial, text, numeric, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { clientsTable } from "./clients";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  totalLoadedQty: numeric("total_loaded_qty", { precision: 10, scale: 3 }).notNull().default("0"),
  totalDeliveredQty: numeric("total_delivered_qty", { precision: 10, scale: 3 }).notNull().default("0"),
  ratePerMt: numeric("rate_per_mt", { precision: 10, scale: 4 }).notNull(),
  grossRevenue: numeric("gross_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  totalShortCharge: numeric("total_short_charge", { precision: 14, scale: 2 }).notNull().default("0"),
  netRevenue: numeric("net_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"), // draft, sent, paid, overdue, cancelled
  issuedDate: timestamp("issued_date"),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Amendment tracking
  isAmended: boolean("is_amended").notNull().default(false),
  amendmentCount: integer("amendment_count").notNull().default(0),
  amendedAt: timestamp("amended_at"),
  amendmentReason: text("amendment_reason"),
  originalGrossRevenue: numeric("original_gross_revenue", { precision: 14, scale: 2 }),
  originalNetRevenue: numeric("original_net_revenue", { precision: 14, scale: 2 }),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
