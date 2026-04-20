import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trucksTable } from "./trucks";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").references(() => trucksTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),

  // Cost & depreciation basis
  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }).notNull(),
  purchaseDate: text("purchase_date").notNull(),
  usefulLifeYears: integer("useful_life_years").notNull(),
  salvageValue: numeric("salvage_value", { precision: 14, scale: 2 }).notNull().default("0"),

  // Depreciation method & migration support
  depreciationMethod: text("depreciation_method").notNull().default("straight_line"), // straight_line | declining_balance
  entryDate: text("entry_date"),                                                        // date entered into this system (defaults to purchaseDate)
  entryAccumulatedDepreciation: numeric("entry_accumulated_depreciation", { precision: 14, scale: 2 }).notNull().default("0"), // accum dep at time of entry
  remainingUsefulLifeMonths: integer("remaining_useful_life_months"),                  // if set, overrides usefulLifeYears for forward calc

  // Financing / seller installment plan
  financed: boolean("financed").notNull().default(false),
  lender: text("lender"),                                                               // seller / finance company name
  downPayment: numeric("down_payment", { precision: 14, scale: 2 }),
  loanAmount: numeric("loan_amount", { precision: 14, scale: 2 }),                     // outstanding balance AT TIME OF ENTRY into system
  installmentAmount: numeric("installment_amount", { precision: 14, scale: 2 }),
  installmentFrequency: text("installment_frequency"),                                 // monthly | quarterly | bi-annual | annual
  totalInstallments: integer("total_installments"),                                    // kept for reference, auto-calculated in UI
  installmentsPaid: integer("installments_paid").notNull().default(0),                 // payments recorded in THIS system

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
