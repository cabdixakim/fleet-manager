import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  recordType: varchar("record_type", { length: 50 }),
  recordId: integer("record_id"),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  assignedTo: integer("assigned_to").notNull().references(() => usersTable.id),
  note: text("note"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type Task = typeof tasksTable.$inferSelect;
export type NewTask = typeof tasksTable.$inferInsert;
