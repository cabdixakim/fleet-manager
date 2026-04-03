import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { trucksTable } from "./trucks";
import { driversTable } from "./drivers";

export const truckDriverAssignmentsTable = pgTable("truck_driver_assignments", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull().references(() => trucksTable.id),
  driverId: integer("driver_id").notNull().references(() => driversTable.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
  unassignedAt: timestamp("unassigned_at"),
});
// ...existing code...
