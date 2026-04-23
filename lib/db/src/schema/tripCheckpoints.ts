import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const tripCheckpointsTable = pgTable("trip_checkpoints", {
  id:                serial("id").primaryKey(),
  tripId:            integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  seq:               integer("seq").notNull(),
  name:              text("name").notNull(),
  country:           text("country"),
  documentType:      text("document_type"),
  feeUsd:            numeric("fee_usd", { precision: 10, scale: 2 }),
  clearanceRequired: boolean("clearance_required").notNull().default(false),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
});

export const insertTripCheckpointSchema = createInsertSchema(tripCheckpointsTable).omit({ id: true, createdAt: true });
export type InsertTripCheckpoint = z.infer<typeof insertTripCheckpointSchema>;
export type TripCheckpoint = typeof tripCheckpointsTable.$inferSelect;
