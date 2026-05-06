import { pgTable, serial, text, date, integer, timestamp } from "drizzle-orm/pg-core";

export const TRUCK_DOC_TYPES = [
  { value: "c29",          label: "C29 – Trailer Cross-Border Permit" },
  { value: "comesa",       label: "COMESA Yellow Card" },
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

export const COMPANY_DOC_TYPES = [
  { value: "rental_agreement",   label: "Rental / Lease Agreement" },
  { value: "tpin",               label: "TPIN Certificate" },
  { value: "company_reg",        label: "Certificate of Incorporation" },
  { value: "tax_clearance",      label: "Tax Clearance Certificate" },
  { value: "operating_license",  label: "Operating Licence" },
  { value: "bank_guarantee",     label: "Bank Guarantee" },
  { value: "insurance",          label: "Company Insurance Policy" },
  { value: "fuel_license",       label: "Fuel Dealer / Handling Licence" },
  { value: "cross_border_ops",   label: "Cross-Border Operating Permit" },
  { value: "other",              label: "Other" },
] as const;

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "truck" | "driver" | "company"
  entityId: integer("entity_id"),            // null for company-level documents
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
