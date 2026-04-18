import { pgTable, serial, text, date, integer, timestamp } from "drizzle-orm/pg-core";
import { trucksTable } from "./trucks";
import { driversTable } from "./drivers";

export const TRUCK_DOC_TYPES = [
  { value: "c29",          label: "C29 Cross-Border Permit" },
  { value: "white_book",   label: "White Book (Registration)" },
  { value: "insurance",    label: "Insurance Certificate" },
  { value: "road_tax",     label: "Road Tax Disc" },
  { value: "fitness",      label: "Fitness Certificate" },
  { value: "tare_cert",    label: "Tare Certificate" },
  { value: "route_permit", label: "Route Permit" },
  { value: "customs_bond", label: "Customs Bond" },
  { value: "other",        label: "Other" },
] as const;

export const DRIVER_DOC_TYPES = [
  { value: "license",      label: "Driver's Licence" },
  { value: "passport",     label: "Passport" },
  { value: "medical",      label: "Medical Certificate" },
  { value: "work_permit",  label: "Work Permit" },
  { value: "driver_card",  label: "Driver Card" },
  { value: "nrc",          label: "NRC / National ID" },
  { value: "other",        label: "Other" },
] as const;

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "truck" | "driver"
  entityId: integer("entity_id").notNull(),
  docType: text("doc_type").notNull(),
  docLabel: text("doc_label").notNull(),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Document = typeof documentsTable.$inferSelect;
