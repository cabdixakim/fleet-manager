import { pgTable, serial, text, numeric, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { trucksTable } from "./trucks";
import { driversTable } from "./drivers";
import { subcontractorsTable } from "./subcontractors";

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id),
  truckId: integer("truck_id").notNull().references(() => trucksTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  // Snapshotted at nomination time — which subcontractor owned the truck when the trip was created.
  // This ensures historical records remain correct even if the truck is later reassigned.
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  product: text("product").notNull(), // AGO, PMS
  capacity: numeric("capacity", { precision: 10, scale: 3 }).notNull(),
  status: text("status").notNull().default("nominated"),
  // nominated, amended_out, cancelled, loading, loaded,
  // in_transit, at_zambia_entry, at_drc_entry, delivered
  loadedQty: numeric("loaded_qty", { precision: 10, scale: 3 }),
  deliveredQty: numeric("delivered_qty", { precision: 10, scale: 3 }),
  mileageStart: numeric("mileage_start", { precision: 10, scale: 2 }),
  mileageEnd: numeric("mileage_end", { precision: 10, scale: 2 }),
  fuel1: numeric("fuel1", { precision: 10, scale: 2 }),
  fuel2: numeric("fuel2", { precision: 10, scale: 2 }),
  fuel3: numeric("fuel3", { precision: 10, scale: 2 }),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  // Incident tracking — for loaded trucks that had accidents/incidents
  incidentFlag: boolean("incident_flag").notNull().default(false),
  incidentDescription: text("incident_description"),
  incidentReplacementTruckId: integer("incident_replacement_truck_id"), // replacement truck assigned after incident
  incidentRevenueOwner: text("incident_revenue_owner"), // 'original' | 'replacement' | 'split' — overrides company policy per-incident
  replacedByTripId: integer("replaced_by_trip_id"), // links to the replacement trip added to the batch
  // Invoice tracking — set when this trip is included in a raised invoice; cleared if trip is reverted
  invoiceId: integer("invoice_id"), // FK → invoices.id (no hard ref to avoid circular import)
  // Per-trip rate overrides
  // If subRatePerMt is set, the rate-differential model is used instead of commission:
  //   company margin = (clientRatePerMt − subRatePerMt) × loadedQty
  //   sub is paid at their agreed rate, not gross minus commission
  subRatePerMt: numeric("sub_rate_per_mt", { precision: 12, scale: 4 }),
  // Optional per-trip short charge rate overrides ($/MT). Falls back to client/sub defaults when null.
  clientShortRateOverride: numeric("client_short_rate_override", { precision: 10, scale: 4 }),
  subShortRateOverride: numeric("sub_short_rate_override", { precision: 10, scale: 4 }),
  // Per-trip broker/agent fee override. When set, overrides the batch-level agentFeePerMt for this trip only.
  agentFeeOverride: numeric("agent_fee_override", { precision: 10, scale: 4 }),
  // Rate snapshots — stamped at nomination time so changing sub/client rates never rewrites history.
  // Falls back to live lookup for trips created before snapshots were introduced.
  commissionRateSnapshot: numeric("commission_rate_snapshot", { precision: 8, scale: 4 }),   // sub commission % (e.g. 8.0000)
  defaultSubRateSnapshot: numeric("default_sub_rate_snapshot", { precision: 12, scale: 4 }), // sub's default rate/MT (rate_differential model)
  subShortRateSnapshot: numeric("sub_short_rate_snapshot", { precision: 10, scale: 4 }),     // sub short charge $/MT for this product
  clientShortRateSnapshot: numeric("client_short_rate_snapshot", { precision: 10, scale: 4 }), // client short charge $/MT for this product
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Stamped when the trip status first reaches 'delivered' — used for accurate P&L date bucketing
  deliveredAt: timestamp("delivered_at"),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
