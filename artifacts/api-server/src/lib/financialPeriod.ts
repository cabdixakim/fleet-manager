import type { Response } from "express";
import { and, eq, lte, gte, asc } from "drizzle-orm";
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

function todayString(): string {
  return toDateString(new Date())!;
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

/**
 * Hard-reject mutation if the date is in a closed period.
 * Use for UPDATE/DELETE of historical rows where bumping is not appropriate,
 * and for whole-month operations like payroll that cannot be back-dated.
 */
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

export type BumpResult = {
  /** Date string (YYYY-MM-DD) to actually persist to the row. */
  effectiveDate: string;
  /** True when the input date fell in a closed period and was moved forward. */
  bumped: boolean;
  /** Original date the user submitted (only present when bumped). */
  originalDate?: string;
  /** Name of the closed period that triggered the bump. */
  closedPeriodName?: string;
  /** Short suffix to append to a description so the back-dating is visible in lists. */
  noteSuffix?: string;
};

/**
 * Soft-bump variant of blockIfClosed: if the input date falls in a closed period,
 * forward it to today's date (assumed to be in an open period — if today itself is
 * closed, the function still bumps to today and the caller may surface that to the user).
 *
 * Use for CREATE handlers where back-dating an entry into a closed month should not
 * silently fail — the entry posts to the current open period instead, with the
 * original date preserved on the response and in the description note.
 */
export async function bumpDateIfClosed(
  input: Date | string | null | undefined,
): Promise<BumpResult> {
  const original = toDateString(input) ?? todayString();
  const closed = await findClosedPeriodFor(original);
  if (!closed) return { effectiveDate: original, bumped: false };

  // Bump to today. If today itself is in a closed period, find the next open
  // period that starts after today's closed period and bump to its first day.
  // If no open period exists at all, throw — the caller will surface this as a
  // 5xx and the user must reopen a period before posting.
  let target = todayString();
  const todayClosed = await findClosedPeriodFor(target);
  if (todayClosed) {
    const nextOpen = await db
      .select()
      .from(periodsTable)
      .where(and(eq(periodsTable.isClosed, false), gte(periodsTable.startDate, todayClosed.endDate)))
      .orderBy(asc(periodsTable.startDate))
      .limit(1);
    if (!nextOpen[0]) {
      throw new Error(
        "Cannot post: today's date falls in a closed period and no future open period exists. Reopen a period to continue.",
      );
    }
    target = nextOpen[0].startDate;
  }

  return {
    effectiveDate: target,
    bumped: true,
    originalDate: original,
    closedPeriodName: closed.name,
    noteSuffix: ` (back-dated from ${original} — ${closed.name} closed)`,
  };
}

/** Convenience: append a note suffix to an optional description, returning a non-null string. */
export function appendNote(description: string | null | undefined, suffix: string | undefined): string | null {
  if (!suffix) return description ?? null;
  if (!description) return suffix.trim();
  return `${description}${suffix}`;
}
