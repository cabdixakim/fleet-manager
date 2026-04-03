import { pgTable, serial, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subcontractorsTable = pgTable("subcontractors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  // If set, all trips for this sub default to the rate-differential model at this rate.
  // Trip-level subRatePerMt overrides this. Falls back to commissionRate when null.
  defaultSubRatePerMt: numeric("default_sub_rate_per_mt", { precision: 12, scale: 4 }),
  agoShortChargeRate: numeric("ago_short_charge_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  pmsShortChargeRate: numeric("pms_short_charge_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  obLocked: boolean("ob_locked").notNull().default(false),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubcontractorSchema = createInsertSchema(subcontractorsTable).omit({ id: true, createdAt: true });
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type Subcontractor = typeof subcontractorsTable.$inferSelect;
