import { Router } from "express";
import { db } from "@workspace/db";
import {
  notificationsTable,
  invoicesTable,
  tripsTable,
  trucksTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, lt, inArray, sql, gte, count } from "drizzle-orm";

const router = Router();

// How long before we re-alert on the same record (hours)
const DEDUP_HOURS = 24;

// How many days before a trip in an active status is considered "stuck"
const STUCK_TRIP_DAYS = 7;

const ACTIVE_TRIP_STATUSES = [
  "nominated", "loading", "loaded",
  "in_transit", "at_zambia_entry", "at_drc_entry",
];

// Roles that receive each alert type
const INVOICE_ALERT_ROLES = ["accounts", "admin", "owner"];
const TRIP_ALERT_ROLES    = ["operations", "manager", "admin", "owner"];

async function alreadyNotified(userId: number, type: string, recordId: number, sinceMs: number) {
  const since = new Date(Date.now() - sinceMs);
  const [row] = await db
    .select({ c: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, type),
        sql`${notificationsTable.metadata}->>'recordId' = ${String(recordId)}`,
        gte(notificationsTable.createdAt, since),
      )
    );
  return Number(row?.c ?? 0) > 0;
}

// POST /api/alerts/check
// Called periodically from the frontend (every 10 min) to generate system notifications.
router.post("/check", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let created = 0;
    const dedupMs = DEDUP_HOURS * 60 * 60 * 1000;

    // ── 1. Overdue invoices ──────────────────────────────────────────────
    const overdueInvoices = await db
      .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(
        and(
          inArray(invoicesTable.status, ["sent", "overdue"]),
          lt(invoicesTable.dueDate, new Date()),
        )
      );

    if (overdueInvoices.length > 0) {
      const invoiceUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.role, INVOICE_ALERT_ROLES));

      for (const inv of overdueInvoices) {
        for (const u of invoiceUsers) {
          if (await alreadyNotified(u.id, "overdue_invoice", inv.id, dedupMs)) continue;
          await db.insert(notificationsTable).values({
            userId: u.id,
            type: "overdue_invoice",
            title: "Overdue Invoice",
            body: `Invoice ${inv.invoiceNumber} is past its due date and unpaid`,
            link: `/invoices`,
            read: false,
            metadata: { recordId: String(inv.id), recordType: "invoice", invoiceNumber: inv.invoiceNumber },
          });
          created++;
        }
      }
    }

    // ── 2. Stuck trips ───────────────────────────────────────────────────
    const stuckCutoff = new Date(Date.now() - STUCK_TRIP_DAYS * 24 * 60 * 60 * 1000);

    const stuckTrips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
        plateNumber: trucksTable.plateNumber,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .where(
        and(
          inArray(tripsTable.status, ACTIVE_TRIP_STATUSES),
          lt(tripsTable.createdAt, stuckCutoff),
        )
      );

    if (stuckTrips.length > 0) {
      const tripUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.role, TRIP_ALERT_ROLES));

      for (const trip of stuckTrips) {
        for (const u of tripUsers) {
          if (await alreadyNotified(u.id, "stuck_trip", trip.id, dedupMs)) continue;
          const plate = trip.plateNumber ?? `Trip #${trip.id}`;
          const statusLabel = (trip.status ?? "").replace(/_/g, " ");
          await db.insert(notificationsTable).values({
            userId: u.id,
            type: "stuck_trip",
            title: "Trip May Be Stuck",
            body: `${plate} has been "${statusLabel}" for ${STUCK_TRIP_DAYS}+ days`,
            link: `/trips/${trip.id}`,
            read: false,
            metadata: { recordId: String(trip.id), recordType: "trip", plateNumber: plate },
          });
          created++;
        }
      }
    }

    res.json({ created, overdueInvoices: overdueInvoices.length, stuckTrips: stuckTrips.length });
  } catch (e: any) {
    console.error("Alert check error:", e);
    res.status(500).json({ error: "Alert check failed", detail: e?.message });
  }
});

export default router;
