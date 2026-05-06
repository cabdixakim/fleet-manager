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
  // Trailer assigned to this trip — defaults to the horse's current trailer but can be overridden
  trailerId: integer("trailer_id").references(() => trucksTable.id),
  // Snapshotted at nomination time — which subcontractor owned the truck when the trip was created.
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  product: text("product").notNull(), // AGO, PMS
  capacity: numeric("capacity", { precision: 10, scale: 3 }).notNull(),
  status: text("status").notNull().default("nominated"),
  loadedQty: numeric("loaded_qty", { precision: 10, scale: 3 }),
  deliveredQty: numeric("delivered_qty", { precision: 10, scale: 3 }),
  mileageStart: numeric("mileage_start", { precision: 10, scale: 2 }),
  mileageEnd: numeric("mileage_end", { precision: 10, scale: 2 }),
  fuel1: numeric("fuel1", { precision: 10, scale: 2 }),
  fuel2: numeric("fuel2", { precision: 10, scale: 2 }),
  fuel3: numeric("fuel3", { precision: 10, scale: 2 }),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  incidentFlag: boolean("incident_flag").notNull().default(false),
  incidentDescription: text("incident_description"),
  incidentReplacementTruckId: integer("incident_replacement_truck_id"),
  incidentRevenueOwner: text("incident_revenue_owner"),
  replacedByTripId: integer("replaced_by_trip_id"),
  invoiceId: integer("invoice_id"),
  subRatePerMt: numeric("sub_rate_per_mt", { precision: 12, scale: 4 }),
  clientShortRateOverride: numeric("client_short_rate_override", { precision: 10, scale: 4 }),
  subShortRateOverride: numeric("sub_short_rate_override", { precision: 10, scale: 4 }),
  agentFeeOverride: numeric("agent_fee_override", { precision: 10, scale: 4 }),
  commissionRateSnapshot: numeric("commission_rate_snapshot", { precision: 8, scale: 4 }),
  defaultSubRateSnapshot: numeric("default_sub_rate_snapshot", { precision: 12, scale: 4 }),
  subShortRateSnapshot: numeric("sub_short_rate_snapshot", { precision: 10, scale: 4 }),
  clientShortRateSnapshot: numeric("client_short_rate_snapshot", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
