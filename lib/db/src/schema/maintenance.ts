import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trucksTable } from "./trucks";

export const truckMaintenanceTable = pgTable("truck_maintenance", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull().references(() => trucksTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  type: text("type").notNull(), // service | repair | inspection | tyre_change | other
  description: text("description").notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  odometer: integer("odometer"),
  mechanic: text("mechanic"),
  nextServiceDate: text("next_service_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMaintenanceSchema = createInsertSchema(truckMaintenanceTable).omit({ id: true, createdAt: true });
export type InsertMaintenance = z.infer<typeof insertMaintenanceSchema>;
export type TruckMaintenance = typeof truckMaintenanceTable.$inferSelect;
