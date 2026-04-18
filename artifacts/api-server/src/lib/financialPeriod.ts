import type { Response } from "express";
import { and, eq, lte, gte } from "drizzle-orm";
import { db } from "./db";
import { periodsTable } from "@workspace/db/schema";

function toDateString(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function findClosedPeriodFor(date: Date | string | null | undefined) {
  const dateStr = toDateString(date);
  if (!dateStr) return null;
  const [hit] = await db
    .select()
    .from(periodsTable)
    .where(and(
      eq(periodsTable.isClosed, true),
      lte(periodsTable.startDate, dateStr),
      gte(periodsTable.endDate, dateStr),
    ))
    .limit(1);
  return hit ?? null;
}

export async function blockIfClosed(
  res: Response,
  ...dates: (Date | string | null | undefined)[]
): Promise<boolean> {
  for (const d of dates) {
    const period = await findClosedPeriodFor(d);
    if (period) {
      res.status(409).json({
        error: `This date falls in a closed period (${period.name}). Reopen the period to make changes.`,
        periodId: period.id,
        periodName: period.name,
      });
      return true;
    }
  }
  return false;
}
