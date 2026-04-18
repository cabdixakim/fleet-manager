import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const supplierPaymentsTable = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupplierPaymentSchema = createInsertSchema(supplierPaymentsTable).omit({ id: true, createdAt: true });
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export type SupplierPayment = typeof supplierPaymentsTable.$inferSelect;
