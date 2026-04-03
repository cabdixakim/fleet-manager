import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const clearancesTable = pgTable("clearances", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  checkpoint: text("checkpoint").notNull(), // zambia_entry, drc_entry
  documentType: text("document_type").notNull(), // T1, TR8, customs_declaration, transit_permit, health_cert, other
  documentNumber: text("document_number"),
  status: text("status").notNull().default("requested"), // requested, pending, approved, rejected
  requestedAt: timestamp("requested_at"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  documentUrl: text("document_url"), // uploaded scan/photo URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClearanceSchema = createInsertSchema(clearancesTable).omit({ id: true, createdAt: true });
export type InsertClearance = z.infer<typeof insertClearanceSchema>;
export type Clearance = typeof clearancesTable.$inferSelect;
