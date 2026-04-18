import { pgTable, serial, text, numeric, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { batchesTable } from "./batches";
import { trucksTable } from "./trucks";
import { subcontractorsTable } from "./subcontractors";
import { suppliersTable } from "./suppliers";

export const tripExpensesTable = pgTable("trip_expenses", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "cascade" }),
  batchId: integer("batch_id").references(() => batchesTable.id),
  truckId: integer("truck_id").references(() => trucksTable.id),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  tier: text("tier").notNull().default("trip"),
  costType: text("cost_type").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  expenseDate: timestamp("expense_date").defaultNow().notNull(),
  settled: boolean("settled").notNull().default(false),
  // Payment method: how the expense was/will be paid
  paymentMethod: text("payment_method").notNull().default("cash"), // cash | petty_cash | fuel_credit | bank_transfer
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTripExpenseSchema = createInsertSchema(tripExpensesTable).omit({ id: true, createdAt: true });
export type InsertTripExpense = z.infer<typeof insertTripExpenseSchema>;
export type TripExpense = typeof tripExpensesTable.$inferSelect;
