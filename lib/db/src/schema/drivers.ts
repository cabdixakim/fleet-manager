import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  passportNumber: text("passport_number"),
  licenseNumber: text("license_number"),
  phone: text("phone"),
  status: text("status").notNull().default("active"), // active, suspended, terminated
  statusEffectiveDate: timestamp("status_effective_date"),
  monthlySalary: numeric("monthly_salary", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
