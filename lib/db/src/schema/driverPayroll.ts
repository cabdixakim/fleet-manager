import { pgTable, serial, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const driverPayrollTable = pgTable("driver_payroll", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  monthlySalary: numeric("monthly_salary", { precision: 10, scale: 2 }).notNull(),
  tripsCount: integer("trips_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const driverPayrollAllocationsTable = pgTable("driver_payroll_allocations", {
  id: serial("id").primaryKey(),
  payrollId: integer("payroll_id").notNull().references(() => driverPayrollTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDriverPayrollSchema = createInsertSchema(driverPayrollTable).omit({ id: true, createdAt: true });
export type InsertDriverPayroll = z.infer<typeof insertDriverPayrollSchema>;
export type DriverPayroll = typeof driverPayrollTable.$inferSelect;
export type DriverPayrollAllocation = typeof driverPayrollAllocationsTable.$inferSelect;
