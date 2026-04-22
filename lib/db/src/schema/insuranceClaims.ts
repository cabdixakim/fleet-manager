import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trucksTable } from "./trucks";
import { tripsTable } from "./trips";
import { companyInsurancePoliciesTable } from "./companyInsurancePolicies";

export const insuranceClaimsTable = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").references(() => trucksTable.id),
  tripId: integer("trip_id").references(() => tripsTable.id),

  // Link to the company policy this claim is being made under.
  // cargo_loss claims → cargo_transit policy
  // accident / theft → vehicle_fleet policy (or truck's individual policy if no fleet policy)
  // third_party claims → third_party policy
  companyPolicyId: integer("company_policy_id").references(() => companyInsurancePoliciesTable.id),

  claimType: text("claim_type").notNull(), // cargo_loss | accident | theft | third_party | other
  status: text("status").notNull().default("draft"), // draft | filed | acknowledged | approved | rejected | settled

  // These are snapshotted from the linked policy at claim creation so the record remains
  // accurate even if the policy is later updated or replaced.
  insurerName: text("insurer_name"),
  policyNumber: text("policy_number"),

  amountClaimed: numeric("amount_claimed", { precision: 14, scale: 2 }),
  amountSettled: numeric("amount_settled", { precision: 14, scale: 2 }),

  incidentDate: text("incident_date"),
  filedDate: text("filed_date"),
  settledDate: text("settled_date"),

  description: text("description"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInsuranceClaimSchema = createInsertSchema(insuranceClaimsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInsuranceClaim = z.infer<typeof insertInsuranceClaimSchema>;
export type InsuranceClaim = typeof insuranceClaimsTable.$inferSelect;
