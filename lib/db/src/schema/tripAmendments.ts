import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const tripAmendmentsTable = pgTable("trip_amendments", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id),
  amendmentType: text("amendment_type").notNull(), // truck_swap, driver_swap, cancellation
  oldTruckId: integer("old_truck_id"),
  newTruckId: integer("new_truck_id"),
  oldDriverId: integer("old_driver_id"),
  newDriverId: integer("new_driver_id"),
  reason: text("reason").notNull(),
  amendedAt: timestamp("amended_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTripAmendmentSchema = createInsertSchema(tripAmendmentsTable).omit({ id: true, createdAt: true, amendedAt: true });
export type InsertTripAmendment = z.infer<typeof insertTripAmendmentSchema>;
export type TripAmendment = typeof tripAmendmentsTable.$inferSelect;
