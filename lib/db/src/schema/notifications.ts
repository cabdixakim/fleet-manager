import { pgTable, serial, integer, text, varchar, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 500 }),
  read: boolean("read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
