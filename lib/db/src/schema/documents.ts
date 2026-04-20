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

export const TRIP_DOC_TYPES = [
  { value: "delivery_note",    label: "Delivery Note" },
  { value: "pod",              label: "Proof of Delivery (POD)" },
  { value: "loading_order",    label: "Loading Order" },
  { value: "weigh_bridge",     label: "Weigh Bridge Certificate" },
  { value: "gate_pass",        label: "Gate Pass" },
  { value: "customs_entry",    label: "Customs Entry / IM4" },
  { value: "transit_bond",     label: "Transit Bond" },
  { value: "other",            label: "Other" },
] as const;

export const BATCH_DOC_TYPES = [
  { value: "loading_order",    label: "Loading Order" },
  { value: "packing_list",     label: "Packing List" },
  { value: "contract",         label: "Contract / Agreement" },
  { value: "quota_allocation", label: "Quota Allocation" },
  { value: "other",            label: "Other" },
] as const;

export const GENERAL_DOC_TYPES = [
  { value: "insurance",        label: "Insurance Policy" },
  { value: "contract",         label: "Contract / Agreement" },
  { value: "correspondence",   label: "Correspondence" },
  { value: "report",           label: "Report" },
  { value: "other",            label: "Other" },
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
