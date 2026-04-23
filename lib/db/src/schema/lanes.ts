import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface LaneCheckpoint {
  seq: number;
  name: string;
  country: string;
  documentType: string | null;
  feeUsd: number | null;
  clearanceRequired: boolean;
}

export const lanesTable = pgTable("lanes", {
  id:          serial("id").primaryKey(),
  value:       text("value").notNull().unique(),
  label:       text("label").notNull(),
  short:       text("short").notNull(),
  chart:       text("chart").notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  checkpoints: jsonb("checkpoints").$type<LaneCheckpoint[]>().notNull().default([]),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export const insertLaneSchema = createInsertSchema(lanesTable).omit({ id: true, createdAt: true });
export type InsertLane = z.infer<typeof insertLaneSchema>;
export type Lane = typeof lanesTable.$inferSelect;
