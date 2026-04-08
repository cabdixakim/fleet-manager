import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { agentsTable } from "./agents";

export const batchesTable = pgTable("batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  route: text("route").notNull(),
  status: text("status").notNull().default("planning"),
  ratePerMt: numeric("rate_per_mt", { precision: 10, scale: 4 }).notNull(),
  agentId: integer("agent_id").references(() => agentsTable.id),
  agentFeePerMt: numeric("agent_fee_per_mt", { precision: 10, scale: 4 }),
  nominatedDate: timestamp("nominated_date"),
  loadedDate: timestamp("loaded_date"),
  deliveredDate: timestamp("delivered_date"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBatchSchema = createInsertSchema(batchesTable).omit({ id: true, createdAt: true });
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;
