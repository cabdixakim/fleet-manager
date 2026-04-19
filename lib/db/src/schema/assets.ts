import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trucksTable } from "./trucks";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").references(() => trucksTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }).notNull(),
  purchaseDate: text("purchase_date").notNull(),
  usefulLifeYears: integer("useful_life_years").notNull(),
  salvageValue: numeric("salvage_value", { precision: 14, scale: 2 }).notNull().default("0"),

  // Financing / installment fields
  financed: boolean("financed").notNull().default(false),
  lender: text("lender"),
  downPayment: numeric("down_payment", { precision: 14, scale: 2 }),
  loanAmount: numeric("loan_amount", { precision: 14, scale: 2 }),
  installmentAmount: numeric("installment_amount", { precision: 14, scale: 2 }),
  installmentFrequency: text("installment_frequency"), // monthly | quarterly | bi-annual | annual
  totalInstallments: integer("total_installments"),
  installmentsPaid: integer("installments_paid").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
