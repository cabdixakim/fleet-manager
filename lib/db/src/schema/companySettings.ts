import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

// --- Modernized and documented company settings schema ---
export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("My Transport Company"),
  logoUrl: text("logo_url"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  currency: text("currency").notNull().default("USD"),
  taxId: text("tax_id"),
  website: text("website"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  recoveryCodeHash: text("recovery_code_hash"),
  ownerEmail: text("owner_email"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  revenueAttributionPolicy: text("revenue_attribution_policy").notNull().default("ORIGINAL"), // Revenue & Cost Attribution for In-Transit Amendments
  t1ClearanceFeeUsd: numeric("t1_clearance_fee_usd", { precision: 10, scale: 2 }).notNull().default("80.00"), // Configurable T1 Zambia Entry Clearance Fee
});

/**
 * Type representing a row in the company_settings table.
 * Includes all company-level configuration and branding fields.
 */
export type CompanySettings = typeof companySettingsTable.$inferSelect;
