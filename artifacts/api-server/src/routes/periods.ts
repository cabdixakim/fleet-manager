import { Router } from "express";
import { db } from "../lib/db";
import {
  periodsTable,
  clientsTable,
  subcontractorsTable,
  tripsTable,
  batchesTable,
  invoicesTable,
  trucksTable,
  companyExpensesTable,
  tripExpensesTable,
} from "@workspace/db/schema";
import { eq, desc, and, gte, lte, inArray, notInArray, count, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { calculateTripFinancials, REVENUE_RECOGNISED_STATUSES } from "../lib/financials";

const router = Router();

function requireRole(req: any, ...roles: string[]) {
  const s = req.session as any;
  const userRole = s?.userRole;
  if (!userRole) return false;
  if (userRole === "owner") return true;
  return roles.includes(userRole);
}

// GET /periods/current — returns the most recent open period
router.get("/current", async (_req, res) => {
  const [period] = await db
    .select()
    .from(periodsTable)
    .where(eq(periodsTable.isClosed, false))
    .orderBy(desc(periodsTable.startDate))
    .limit(1);
  return res.json(period ?? null);
});

// GET /periods
router.get("/", async (_req, res) => {
  const periods = await db
    .select()
    .from(periodsTable)
    .orderBy(desc(periodsTable.startDate));
  return res.json(periods);
});

// GET /periods/:id/close-preview — returns pre-close health stats for the confirm modal
router.get("/:id/close-preview", async (req, res) => {
  const id = Number(req.params.id);
  const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!period) return res.status(404).json({ error: "Period not found" });

  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  end.setHours(23, 59, 59, 999);

  const IN_PROGRESS_STATUSES = ["loaded", "in_transit", "at_border", "customs_cleared"];

  const [openTripsRow] = await db
    .select({ count: count() })
    .from(tripsTable)
    .where(and(
      inArray(tripsTable.status, IN_PROGRESS_STATUSES),
      gte(tripsTable.createdAt, start),
      lte(tripsTable.createdAt, end)
    ));

  const [uninvoicedBatchesRow] = await db
    .select({ count: count() })
    .from(batchesTable)
    .where(and(
      notInArray(batchesTable.status, ["invoiced", "cancelled"]),
      gte(batchesTable.createdAt, start),
      lte(batchesTable.createdAt, end)
    ));

  return res.json({
    period,
    openTrips: Number(openTripsRow?.count ?? 0),
    uninvoicedBatches: Number(uninvoicedBatchesRow?.count ?? 0),
  });
});

// GET /periods/:id/financials — period-level financial summary
router.get("/:id/financials", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
    if (!period) return res.status(404).json({ error: "Period not found" });

    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    end.setHours(23, 59, 59, 999);

    // Delivered trips in this period
    const periodTrips = await db
      .select({
        id: tripsTable.id,
        truckId: tripsTable.truckId,
        batchId: tripsTable.batchId,
        status: tripsTable.status,
      })
      .from(tripsTable)
      .where(and(
        inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
        gte(tripsTable.createdAt, start),
        lte(tripsTable.createdAt, end)
      ));

    // Invoices in this period
    const periodInvoices = await db
      .select({
        id: invoicesTable.id,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        grossRevenue: invoicesTable.grossRevenue,
        netRevenue: invoicesTable.netRevenue,
        totalShortCharge: invoicesTable.totalShortCharge,
        status: invoicesTable.status,
        invoiceNumber: invoicesTable.invoiceNumber,
        issuedDate: invoicesTable.issuedDate,
        dueDate: invoicesTable.dueDate,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(and(
        gte(invoicesTable.createdAt, start),
        lte(invoicesTable.createdAt, end)
      ));

    // Company overhead expenses in this period
    const overheadExpenses = await db
      .select({ amount: companyExpensesTable.amount })
      .from(companyExpensesTable)
      .where(and(
        gte(companyExpensesTable.expenseDate, start),
        lte(companyExpensesTable.expenseDate, end)
      ));

    // Aggregate trip financials
    let totalGross = 0;
    let totalCommission = 0;
    let totalShortCharges = 0;
    let totalTripExpenses = 0;
    let totalDriverSalaries = 0;

    const subMap: Record<number, {
      id: number; name: string; commissionRate: number;
      gross: number; commission: number; shortCharges: number;
      tripExpenses: number; driverSalaries: number; netPayable: number; trips: number;
    }> = {};

    for (const trip of periodTrips) {
      try {
        const fin = await calculateTripFinancials(trip.id);
        const g = fin.grossRevenue ?? 0;
        const c = fin.commission ?? 0;
        const sc = fin.shortCharge ?? 0;
        const te = fin.tripExpensesTotal ?? 0;
        const ds = fin.driverSalaryAllocation ?? 0;
        const net = fin.netPayable ?? 0;

        totalGross += g;
        totalCommission += c;
        totalShortCharges += sc;
        totalTripExpenses += te;
        totalDriverSalaries += ds;

        // Get subcontractor for this trip via truck
        const [truck] = await db
          .select({ subcontractorId: trucksTable.subcontractorId })
          .from(trucksTable)
          .where(eq(trucksTable.id, trip.truckId));

        if (truck?.subcontractorId) {
          if (!subMap[truck.subcontractorId]) {
            const [sub] = await db
              .select({ id: subcontractorsTable.id, name: subcontractorsTable.name, commissionRate: subcontractorsTable.commissionRate })
              .from(subcontractorsTable)
              .where(eq(subcontractorsTable.id, truck.subcontractorId));
            subMap[truck.subcontractorId] = {
              id: sub?.id ?? truck.subcontractorId,
              name: sub?.name ?? "Unknown",
              commissionRate: parseFloat(sub?.commissionRate ?? "0"),
              gross: 0, commission: 0, shortCharges: 0,
              tripExpenses: 0, driverSalaries: 0, netPayable: 0, trips: 0
            };
          }
          subMap[truck.subcontractorId].gross += g;
          subMap[truck.subcontractorId].commission += c;
          subMap[truck.subcontractorId].shortCharges += sc;
          subMap[truck.subcontractorId].tripExpenses += te;
          subMap[truck.subcontractorId].driverSalaries += ds;
          subMap[truck.subcontractorId].netPayable += net;
          subMap[truck.subcontractorId].trips += 1;
        }
      } catch { /* skip on error */ }
    }

    // Client receivables from invoices
    const clientMap: Record<number, {
      clientId: number; clientName: string;
      totalInvoiced: number; totalPaid: number; totalOutstanding: number;
      invoices: number;
    }> = {};

    for (const inv of periodInvoices) {
      const cid = inv.clientId ?? 0;
      const net = parseFloat(inv.netRevenue ?? inv.grossRevenue ?? "0");
      if (!clientMap[cid]) {
        clientMap[cid] = { clientId: cid, clientName: inv.clientName ?? "Unknown", totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, invoices: 0 };
      }
      clientMap[cid].invoices += 1;
      clientMap[cid].totalInvoiced += net;
      if (inv.status === "paid") {
        clientMap[cid].totalPaid += net;
      } else {
        clientMap[cid].totalOutstanding += net;
      }
    }

    const totalOverhead = overheadExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
    const companyEarnings = totalCommission + totalShortCharges - totalOverhead;

    const totalInvoiced = Object.values(clientMap).reduce((s, c) => s + c.totalInvoiced, 0);
    const totalPaid = Object.values(clientMap).reduce((s, c) => s + c.totalPaid, 0);
    const totalOutstanding = Object.values(clientMap).reduce((s, c) => s + c.totalOutstanding, 0);
    const totalNetSubPayable = Object.values(subMap).reduce((s, c) => s + c.netPayable, 0);

    return res.json({
      period,
      trips: periodTrips.length,
      revenue: {
        grossRevenue: totalGross,
        totalCommission,
        totalShortCharges,
        totalTripExpenses,
        totalDriverSalaries,
        companyEarnings,
        totalOverhead,
      },
      clientReceivables: {
        total: totalInvoiced,
        paid: totalPaid,
        outstanding: totalOutstanding,
        byClient: Object.values(clientMap).sort((a, b) => b.totalInvoiced - a.totalInvoiced),
      },
      subcontractorPayables: {
        total: totalNetSubPayable,
        bySubcontractor: Object.values(subMap).sort((a, b) => b.netPayable - a.netPayable),
      },
    });
  } catch (e) { next(e); }
});

// GET /periods/:id
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!period) return res.status(404).json({ error: "Period not found" });
  return res.json(period);
});

// POST /periods — admin/manager only
router.post("/", async (req, res) => {
  if (!requireRole(req, "admin", "manager")) return res.status(403).json({ error: "Not authorised" });
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) return res.status(400).json({ error: "name, startDate, endDate are required" });
  const [period] = await db
    .insert(periodsTable)
    .values({ name, startDate, endDate, isClosed: false })
    .returning();
  await logAudit(req, { action: "create", entity: "period", entityId: period.id, description: `Created period: ${name} (${startDate} → ${endDate})` });
  return res.status(201).json(period);
});

// PUT /periods/:id — admin/manager only, only if not closed
router.put("/:id", async (req, res) => {
  if (!requireRole(req, "admin", "manager")) return res.status(403).json({ error: "Not authorised" });
  const id = Number(req.params.id);
  const [existing] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Period not found" });
  if (existing.isClosed) return res.status(400).json({ error: "Cannot edit a closed period" });
  const { name, startDate, endDate } = req.body;
  const [updated] = await db
    .update(periodsTable)
    .set({ name: name ?? existing.name, startDate: startDate ?? existing.startDate, endDate: endDate ?? existing.endDate })
    .where(eq(periodsTable.id, id))
    .returning();
  await logAudit(req, { action: "update", entity: "period", entityId: id, description: `Updated period: ${updated.name}` });
  return res.json(updated);
});

// POST /periods/:id/close — admin/manager only
router.post("/:id/close", async (req, res) => {
  if (!requireRole(req, "admin", "manager")) return res.status(403).json({ error: "Not authorised" });
  const id = Number(req.params.id);
  const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (period.isClosed) return res.status(400).json({ error: "Period is already closed" });

  const [closed] = await db
    .update(periodsTable)
    .set({ isClosed: true })
    .where(eq(periodsTable.id, id))
    .returning();

  await db.update(clientsTable).set({ obLocked: true }).where(eq(clientsTable.obLocked, false));
  await db.update(subcontractorsTable).set({ obLocked: true }).where(eq(subcontractorsTable.obLocked, false));

  await logAudit(req, { action: "update", entity: "period", entityId: id, description: `Closed period: ${period.name} — opening balances locked for all clients and subcontractors` });
  return res.json({ ...closed, lockedCount: { note: "All client and subcontractor opening balances are now locked" } });
});

// POST /periods/:id/reopen — admin only
router.post("/:id/reopen", async (req, res) => {
  if (!requireRole(req, "admin")) return res.status(403).json({ error: "Only admins can reopen periods" });
  const id = Number(req.params.id);
  const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (!period.isClosed) return res.status(400).json({ error: "Period is not closed" });

  const [reopened] = await db
    .update(periodsTable)
    .set({ isClosed: false })
    .where(eq(periodsTable.id, id))
    .returning();

  await logAudit(req, { action: "update", entity: "period", entityId: id, description: `Reopened period: ${period.name}` });
  return res.json(reopened);
});

// DELETE /periods/:id — admin only
router.delete("/:id", async (req, res) => {
  if (!requireRole(req, "admin")) return res.status(403).json({ error: "Only admins can delete periods" });
  const id = Number(req.params.id);
  const [period] = await db.select().from(periodsTable).where(eq(periodsTable.id, id));
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (period.isClosed) return res.status(400).json({ error: "Cannot delete a closed period" });
  await db.delete(periodsTable).where(eq(periodsTable.id, id));
  await logAudit(req, { action: "delete", entity: "period", entityId: id, description: `Deleted period: ${period.name}` });
  return res.json({ success: true });
});

export default router;
