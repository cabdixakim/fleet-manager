import { pgTable, serial, text, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subcontractorsTable } from "./subcontractors";

export const trucksTable = pgTable("trucks", {
  id: serial("id").primaryKey(),
  plateNumber: text("plate_number").notNull().unique(),
  trailerPlate: text("trailer_plate"),
  companyOwned: boolean("company_owned").notNull().default(false),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  status: text("status").notNull().default("available"), // available, on_trip, maintenance, idle
  notes: text("notes"),
  currentLocation: text("current_location"),

  // Insurance
  insurerName: text("insurer_name"),
  policyNumber: text("policy_number"),
  coverageAmount: numeric("coverage_amount", { precision: 14, scale: 2 }),
  premiumAmount: numeric("premium_amount", { precision: 14, scale: 2 }),
  insuranceExpiry: text("insurance_expiry"), // ISO date string

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTruckSchema = createInsertSchema(trucksTable).omit({ id: true, createdAt: true });
export type InsertTruck = z.infer<typeof insertTruckSchema>;
export type Truck = typeof trucksTable.$inferSelect;
