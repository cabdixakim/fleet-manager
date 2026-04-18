import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const glAccountsTable = pgTable("gl_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset | liability | equity | revenue | expense
  subtype: text("subtype"),    // current_asset | fixed_asset | current_liability | long_term_liability | cogs | operating_expense | other_income | other_expense
  description: text("description"),
  parentId: integer("parent_id"),
  isSystem: boolean("is_system").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGlAccountSchema = createInsertSchema(glAccountsTable).omit({ id: true, createdAt: true });
export type InsertGlAccount = z.infer<typeof insertGlAccountSchema>;
export type GlAccount = typeof glAccountsTable.$inferSelect;
