import { relations } from "drizzle-orm";
import { periodsTable } from "./periods";

export const periodsRelations = relations(periodsTable, ({ many }) => ({
  // Add relations here if needed in the future
}));
