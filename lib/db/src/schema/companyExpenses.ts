import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const companyExpensesTable = pgTable("company_expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // rent, utilities, staff, travel, legal, marketing, other
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  expenseDate: timestamp("expense_date").defaultNow().notNull(),
  // Payment method: how the expense was/will be paid
  paymentMethod: text("payment_method").notNull().default("cash"), // cash | petty_cash | fuel_credit | bank_transfer
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompanyExpenseSchema = createInsertSchema(companyExpensesTable).omit({ id: true, createdAt: true });
export type InsertCompanyExpense = z.infer<typeof insertCompanyExpenseSchema>;
export type CompanyExpense = typeof companyExpensesTable.$inferSelect;
