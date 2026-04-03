import { pgTable, serial, text, date, boolean } from "drizzle-orm/pg-core";

export const periodsTable = pgTable("periods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g. "March 2026", "2026-Q1", etc.
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
});

export type Period = typeof periodsTable.$inferSelect;
