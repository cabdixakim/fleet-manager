import { pgTable, serial, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  agoShortChargeRate: numeric("ago_short_charge_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  pmsShortChargeRate: numeric("pms_short_charge_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  obLocked: boolean("ob_locked").notNull().default(false),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
