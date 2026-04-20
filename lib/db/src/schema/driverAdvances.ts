import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { driverPayrollTable } from "./driverPayroll";

export const driverAdvancesTable = pgTable("driver_advances", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending | deducted
  payrollId: integer("payroll_id").references(() => driverPayrollTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DriverAdvance = typeof driverAdvancesTable.$inferSelect;
export type NewDriverAdvance = typeof driverAdvancesTable.$inferInsert;
