import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const deliveryNotesTable = pgTable("delivery_notes", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDeliveryNoteSchema = createInsertSchema(deliveryNotesTable).omit({ id: true, createdAt: true });
export type InsertDeliveryNote = z.infer<typeof insertDeliveryNoteSchema>;
export type DeliveryNote = typeof deliveryNotesTable.$inferSelect;
