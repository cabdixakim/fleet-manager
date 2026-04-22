import { pgTable, serial, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Company-level insurance policies — distinct from per-truck physical coverage.
// Three types live here:
//   vehicle_fleet  — a single fleet policy that covers all company trucks (comprehensive/physical damage)
//   cargo_transit  — goods-in-transit / open-cover policy covering the fuel cargo on every load
//   third_party    — third-party liability covering injury or property damage caused to others
//
// Per-truck insurance details (insurer, policy number, expiry) remain on the trucksTable
// for trucks that each carry their own individual policy rather than being under a fleet policy.

export const companyInsurancePoliciesTable = pgTable("company_insurance_policies", {
  id: serial("id").primaryKey(),

  policyType: text("policy_type").notNull(), // vehicle_fleet | cargo_transit | third_party

  insurerName: text("insurer_name").notNull(),
  policyNumber: text("policy_number").notNull(),

  // Coverage limits
  coverageAmount: numeric("coverage_amount", { precision: 14, scale: 2 }),
  premiumAmount: numeric("premium_amount", { precision: 14, scale: 2 }),

  // Policy period
  startDate: text("start_date"),   // ISO date e.g. 2025-01-01
  expiryDate: text("expiry_date"), // ISO date e.g. 2026-01-01

  // For cargo policies: max value covered per load / per trip
  perLoadLimit: numeric("per_load_limit", { precision: 14, scale: 2 }),

  // Routes or regions this policy covers (free text, e.g. "SADC Region", "DRC cross-border")
  coverageScope: text("coverage_scope"),

  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCompanyInsurancePolicySchema = createInsertSchema(companyInsurancePoliciesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyInsurancePolicy = z.infer<typeof insertCompanyInsurancePolicySchema>;
export type CompanyInsurancePolicy = typeof companyInsurancePoliciesTable.$inferSelect;
