import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subcontractorsTable } from "./subcontractors";
import { tripsTable } from "./trips";
import { driversTable } from "./drivers";

export const subcontractorTransactionsTable = pgTable("subcontractor_transactions", {
  id: serial("id").primaryKey(),
  subcontractorId: integer("subcontractor_id").notNull().references(() => subcontractorsTable.id),
  type: text("type").notNull(), // net_payable, advance_given, payment_made, driver_salary, adjustment
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  tripId: integer("trip_id").references(() => tripsTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  description: text("description"),
  transactionDate: timestamp("transaction_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubcontractorTransactionSchema = createInsertSchema(subcontractorTransactionsTable).omit({ id: true, createdAt: true });
export type InsertSubcontractorTransaction = z.infer<typeof insertSubcontractorTransactionSchema>;
export type SubcontractorTransaction = typeof subcontractorTransactionsTable.$inferSelect;
