import { Router } from "express";
import { db } from "@workspace/db";
import {
  tripsTable,
  trucksTable,
  driversTable,
  subcontractorsTable,
  batchesTable,
  tripExpensesTable,
  clearancesTable,
  tripAmendmentsTable,
  deliveryNotesTable,
  clientsTable,
  companySettingsTable,
  agentTransactionsTable,
  suppliersTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { calculateTripFinancials, snapTripRates } from "../lib/financials";
import { logAudit } from "../lib/audit";
import { blockIfClosed, bumpDateIfClosed, appendNote } from "../lib/financialPeriod";
import { postJournalEntry } from "../lib/glPosting";

// Status workflow order — higher index = further along
const TRIP_STATUS_ORDER = ["nominated", "loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "completed"];
// Reverting from these statuses has financial impact — requires manager or admin
const TRIP_FINANCIAL_STATUSES = ["delivered", "completed"];

const router = Router();

// GET /api/trips — list all trips with joins
router.get("/", async (req, res, next) => {
  try {
    const { status, batchId, truckId, subcontractorId, search } = req.query as Record<string, string>;
    const rows = await db
      .select({
        id: tripsTable.id,
        batchId: tripsTable.batchId,
        batchName: batchesTable.name,
        batchRoute: batchesTable.route,
        clientName: clientsTable.name,
        truckId: tripsTable.truckId,
        truckPlate: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        driverId: tripsTable.driverId,
        driverName: driversTable.name,
        subcontractorName: subcontractorsTable.name,
        subcontractorId: tripsTable.subcontractorId,
        product: tripsTable.product,
        capacity: tripsTable.capacity,
        status: tripsTable.status,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        incidentFlag: tripsTable.incidentFlag,
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
      .leftJoin(subcontractorsTable, eq(tripsTable.subcontractorId, subcontractorsTable.id))
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .orderBy(desc(tripsTable.createdAt));

    let filtered = rows;
    if (status) filtered = filtered.filter((r) => r.status === status);
    if (batchId) filtered = filtered.filter((r) => r.batchId === parseInt(batchId));
    if (truckId) filtered = filtered.filter((r) => r.truckId === parseInt(truckId));
    if (subcontractorId) filtered = filtered.filter((r) => r.subcontractorId === parseInt(subcontractorId));
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.truckPlate?.toLowerCase().includes(s) ||
        r.driverName?.toLowerCase().includes(s) ||
        r.batchName?.toLowerCase().includes(s) ||
        r.clientName?.toLowerCase().includes(s)
      );
    }

    res.json(filtered.map((r) => ({
      ...r,
      capacity: parseFloat(r.capacity),
      loadedQty: r.loadedQty ? parseFloat(r.loadedQty) : null,
      deliveredQty: r.deliveredQty ? parseFloat(r.deliveredQty) : null,
    })));
  } catch (e) { next(e); }
});

async function buildTripDetail(tripId: number) {
  const [trip] = await db
    .select({
      id: tripsTable.id,
      batchId: tripsTable.batchId,
      batchName: batchesTable.name,
      truckId: tripsTable.truckId,
      truckPlate: trucksTable.plateNumber,
      trailerPlate: trucksTable.trailerPlate,
      driverId: tripsTable.driverId,
      driverName: driversTable.name,
      subcontractorId: tripsTable.subcontractorId,
      subcontractorName: subcontractorsTable.name,
      product: tripsTable.product,
      capacity: tripsTable.capacity,
      status: tripsTable.status,
      loadedQty: tripsTable.loadedQty,
      deliveredQty: tripsTable.deliveredQty,
      mileageStart: tripsTable.mileageStart,
      mileageEnd: tripsTable.mileageEnd,
      fuel1: tripsTable.fuel1,
      fuel2: tripsTable.fuel2,
      fuel3: tripsTable.fuel3,
      cancellationReason: tripsTable.cancellationReason,
      notes: tripsTable.notes,
      incidentFlag: tripsTable.incidentFlag,
      incidentDescription: tripsTable.incidentDescription,
      incidentReplacementTruckId: tripsTable.incidentReplacementTruckId,
      incidentRevenueOwner: tripsTable.incidentRevenueOwner,
      replacedByTripId: tripsTable.replacedByTripId,
      subRatePerMt: tripsTable.subRatePerMt,
      clientShortRateOverride: tripsTable.clientShortRateOverride,
      subShortRateOverride: tripsTable.subShortRateOverride,
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
    .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
    .leftJoin(subcontractorsTable, eq(tripsTable.subcontractorId, subcontractorsTable.id))
    .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
    .where(eq(tripsTable.id, tripId));

  if (!trip) return null;

  const [expenses, clearances, amendments, deliveryNote] = await Promise.all([
    db.select().from(tripExpensesTable).where(eq(tripExpensesTable.tripId, tripId)).orderBy(tripExpensesTable.createdAt),
    db.select().from(clearancesTable).where(eq(clearancesTable.tripId, tripId)).orderBy(clearancesTable.createdAt),
    db.select().from(tripAmendmentsTable).where(eq(tripAmendmentsTable.tripId, tripId)).orderBy(desc(tripAmendmentsTable.amendedAt)),
    db.select().from(deliveryNotesTable).where(eq(deliveryNotesTable.tripId, tripId)).then((r) => r[0] ?? null),
  ]);

  const financials = await calculateTripFinancials(tripId);

  return {
    ...trip,
    capacity: parseFloat(trip.capacity),
    loadedQty: trip.loadedQty ? parseFloat(trip.loadedQty) : null,
    deliveredQty: trip.deliveredQty ? parseFloat(trip.deliveredQty) : null,
    mileageStart: trip.mileageStart ? parseFloat(trip.mileageStart) : null,
    mileageEnd: trip.mileageEnd ? parseFloat(trip.mileageEnd) : null,
    fuel1: trip.fuel1 ? parseFloat(trip.fuel1) : null,
    fuel2: trip.fuel2 ? parseFloat(trip.fuel2) : null,
    fuel3: trip.fuel3 ? parseFloat(trip.fuel3) : null,
    expenses: expenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })),
    clearances,
    amendments,
    deliveryNote,
    financials,
  };
}

router.get("/:id", async (req, res, next) => {
  try {
    const detail = await buildTripDetail(parseInt(req.params.id));
    if (!detail) return res.status(404).json({ error: "Not found" });
    res.json(detail);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));

    // Backward-move guard
    const newStatus: string | undefined = req.body.status;
    if (newStatus && before && newStatus !== before.status) {
      const fromIdx = TRIP_STATUS_ORDER.indexOf(before.status);
      const toIdx = TRIP_STATUS_ORDER.indexOf(newStatus);
      const isBackward = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
      if (isBackward) {
        const revertReason: string | undefined = req.body.revertReason;
        if (!revertReason?.trim()) {
          return res.status(400).json({ error: "A reason is required when reversing a trip status." });
        }
        // Closed-period guard: reverting from a financial status is blocked when the
        // trip's delivery date is in a closed period — history is sacred.
        if (TRIP_FINANCIAL_STATUSES.includes(before.status)) {
          if (await blockIfClosed(res, before.deliveredAt)) return;
        }
        const userRole = (req.session as any)?.userRole as string | undefined;
        if (TRIP_FINANCIAL_STATUSES.includes(before.status) && !["owner", "admin", "manager"].includes(userRole ?? "")) {
          return res.status(403).json({ error: `Reversing a trip from '${before.status}' status requires manager or admin access.` });
        }
      } else {
        // Clearance gate: T1 must be approved before ENTERING at_zambia_entry (from in_transit)
        if (before.status === "in_transit" && newStatus === "at_zambia_entry") {
          const [t1] = await db
            .select()
            .from(clearancesTable)
            .where(
              and(
                eq(clearancesTable.tripId, id),
                eq(clearancesTable.checkpoint, "zambia_entry"),
                eq(clearancesTable.documentType, "T1"),
              ),
            );
          if (!t1 || t1.status !== "approved") {
            // Auto-create a T1 record if missing so the user can act on it immediately
            let clearanceId: number | null = t1?.id ?? null;
            if (!t1) {
              const [created] = await db.insert(clearancesTable).values({
                tripId: id, checkpoint: "zambia_entry", documentType: "T1",
                status: "requested", requestedAt: new Date(),
              }).returning();
              clearanceId = created?.id ?? null;
            }
            return res.status(409).json({
              blocked: true,
              clearanceId,
              checkpoint: "zambia_entry",
              error: "T1 clearance must be approved before entering Zambia.",
            });
          }
        }
        // Clearance gate: TR8 must be approved before ENTERING at_drc_entry (from at_zambia_entry)
        // Also fires as a fallback when LEAVING at_drc_entry (→ delivered) for backward compat
        const isDrcTransition =
          (before.status === "at_zambia_entry" && newStatus === "at_drc_entry") ||
          (before.status === "at_drc_entry");
        if (isDrcTransition) {
          const [tr8] = await db
            .select()
            .from(clearancesTable)
            .where(
              and(
                eq(clearancesTable.tripId, id),
                eq(clearancesTable.checkpoint, "drc_entry"),
                eq(clearancesTable.documentType, "TR8"),
              ),
            );
          if (!tr8 || tr8.status !== "approved") {
            let clearanceId: number | null = tr8?.id ?? null;
            if (!tr8) {
              const [created] = await db.insert(clearancesTable).values({
                tripId: id, checkpoint: "drc_entry", documentType: "TR8",
                status: "requested", requestedAt: new Date(),
              }).returning();
              clearanceId = created?.id ?? null;
            }
            return res.status(409).json({
              blocked: true,
              clearanceId,
              checkpoint: "drc_entry",
              error: "TR8 clearance must be approved before advancing past DRC Entry.",
            });
          }
        }
      }
    }

    // Block cancellation for trips that are already loaded or further along
    const CANCELLABLE_STATUSES_DIRECT = ["nominated", "loading"];
    if (req.body.status === "cancelled" && before && !CANCELLABLE_STATUSES_DIRECT.includes(before.status)) {
      return res.status(400).json({
        error: `Cannot cancel a trip at '${before.status}' status. Cancellation is only allowed before loading is confirmed. For incidents on loaded or in-transit trips, use the incident/amendment process.`,
      });
    }

    // Strip internal fields before DB write
    const { revertReason, ...dbBody } = req.body as Record<string, any>;

    // Stamp deliveredAt the first time a trip reaches 'delivered' — used for accurate P&L date bucketing
    // Guard: block if today falls in a closed financial period (delivery creates P&L)
    if (dbBody.status === "delivered" && !before?.deliveredAt) {
      if (await blockIfClosed(res, new Date())) return;
      dbBody.deliveredAt = new Date();
    }

    // Guard: block incident-attribution edits on a delivered trip whose delivery date is
    // in a closed period — retroactively changing revenue ownership alters closed P&L.
    const INCIDENT_MUTABLE_FIELDS = ["incidentFlag", "incidentDescription", "incidentRevenueOwner", "incidentReplacementTruckId"];
    const touchesIncident = INCIDENT_MUTABLE_FIELDS.some(f => f in dbBody);
    if (touchesIncident && before?.deliveredAt && TRIP_FINANCIAL_STATUSES.includes(before?.status ?? "")) {
      if (await blockIfClosed(res, before.deliveredAt)) return;
    }

    const [trip] = await db.update(tripsTable).set(dbBody).where(eq(tripsTable.id, id)).returning();
    if (!trip) return res.status(404).json({ error: "Not found" });

    // Auto-record agent fee_earned when trip becomes loaded (upfront, before delivery)
    if (dbBody.status === "loaded" && before?.status !== "loaded") {
      try {
        const [batchInfo] = await db
          .select({ agentId: batchesTable.agentId, agentFeePerMt: batchesTable.agentFeePerMt, name: batchesTable.name })
          .from(batchesTable)
          .where(eq(batchesTable.id, trip.batchId));
        if (batchInfo?.agentId && batchInfo?.agentFeePerMt && trip.loadedQty) {
          const loadedQty = parseFloat(trip.loadedQty);
          const feePerMt = parseFloat(batchInfo.agentFeePerMt);
          if (loadedQty > 0 && feePerMt > 0) {
            await db.insert(agentTransactionsTable).values({
              agentId: batchInfo.agentId,
              batchId: trip.batchId,
              tripId: id,
              type: "fee_earned",
              amount: (loadedQty * feePerMt).toFixed(2),
              description: `Fee earned — Trip #${id} (${batchInfo.name ?? ""})`,
              transactionDate: new Date(),
            });
          }
        }
      } catch { /* agent fee is non-critical — don't block the trip update */ }
    }

    // Truck status auto-transitions based on trip lifecycle
    if (dbBody.status === "cancelled") {
      // Cancelled: free the primary truck
      await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.truckId));
    } else if (dbBody.status === "delivered") {
      // Delivered: cargo has arrived — truck is physically free
      if (trip.incidentFlag && trip.incidentReplacementTruckId) {
        // Incident trip: the replacement truck did the work — free it; keep the original in maintenance
        await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.incidentReplacementTruckId));
      } else {
        await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.truckId));
      }
    }

    const isStatusChange = dbBody.status && dbBody.status !== before?.status;
    const fromIdx2 = TRIP_STATUS_ORDER.indexOf(before?.status ?? "");
    const toIdx2 = TRIP_STATUS_ORDER.indexOf(trip.status);
    const isRevert = fromIdx2 !== -1 && toIdx2 !== -1 && toIdx2 < fromIdx2;

    // If reverting a trip that was already stamped to an invoice, clear the stamp so the trip
    // can be re-invoiced after re-delivery — and warn the caller to handle a credit note
    let invoiceWarning: { invoiceId: number } | null = null;
    if (isRevert && before?.invoiceId) {
      await db.update(tripsTable).set({ invoiceId: null }).where(eq(tripsTable.id, id));
      invoiceWarning = { invoiceId: before.invoiceId };
    }

    const cancellationReason = dbBody.cancellationReason ?? null;
    await logAudit(req, {
      action: isStatusChange ? (isRevert ? "status_revert" : trip.status === "cancelled" ? "cancellation" : "status_change") : "update",
      entity: "trip",
      entityId: id,
      description: isStatusChange
        ? trip.status === "cancelled"
          ? `Trip #${trip.id} cancelled (was ${before?.status})${cancellationReason ? ` — Reason: ${cancellationReason}` : ""}`
          : `Trip #${trip.id} status ${isRevert ? "reverted" : "changed"}: ${before?.status} → ${trip.status}${revertReason ? ` — Reason: ${revertReason}` : ""}${invoiceWarning ? ` — invoice #${invoiceWarning.invoiceId} de-linked` : ""}`
        : `Updated trip #${trip.id}`,
      metadata: isStatusChange
        ? { from: before?.status, to: trip.status, ...(revertReason ? { revertReason } : {}), ...(cancellationReason ? { cancellationReason } : {}), ...(invoiceWarning ? { invoiceDeLinked: invoiceWarning.invoiceId } : {}) }
        : undefined,
    });

    // Auto-create clearance documents + fees when reaching border checkpoints
    if (isStatusChange) {
      if (trip.status === "at_zambia_entry") {
        // Create T1 clearance if not already present (may already exist from the gate check)
        const existing = await db.select({ id: clearancesTable.id }).from(clearancesTable)
          .where(and(eq(clearancesTable.tripId, id), eq(clearancesTable.checkpoint, "zambia_entry"), inArray(clearancesTable.documentType, ["T1"])));
        if (existing.length === 0) {
          await db.insert(clearancesTable).values({
            tripId: id, checkpoint: "zambia_entry", documentType: "T1",
            status: "requested", requestedAt: new Date(),
          });
        }
        // Auto-add T1 fee exactly once — use configurable amount + active clearance agency from company settings
        const existingFee = await db.select({ id: tripExpensesTable.id }).from(tripExpensesTable)
          .where(and(eq(tripExpensesTable.tripId, id), eq(tripExpensesTable.costType, "clearance_fee")));
        if (existingFee.length === 0) {
          const [cs] = await db.select({
            fee: companySettingsTable.t1ClearanceFeeUsd,
            agencyId: companySettingsTable.activeClearanceAgencyId,
          }).from(companySettingsTable).limit(1);
          const agencyId = cs?.agencyId ?? null;
          const feeAmount = parseFloat(cs?.fee ?? "80.00");
          const paymentMethod = agencyId ? "fuel_credit" : "cash";
          const [newFee] = await db.insert(tripExpensesTable).values({
            tripId: id,
            costType: "clearance_fee",
            amount: feeAmount.toFixed(2),
            description: "T1 Zambia Entry Clearance Fee",
            paymentMethod,
            supplierId: agencyId,
          }).returning();
          // Post GL: Dr Clearance Expense (5004) / Cr Supplier Payables (2050) or Cash (1002)
          const creditCode = agencyId ? "2050" : "1002";
          await postJournalEntry({
            description: "T1 Zambia Entry Clearance Fee",
            entryDate: new Date(),
            referenceType: "trip_expense",
            referenceId: newFee.id,
            lines: [
              { accountCode: "5004", debit: feeAmount, description: "T1 Clearance Fee" },
              { accountCode: creditCode, credit: feeAmount, description: agencyId ? "Cr Supplier Payables" : "Cr Cash" },
            ],
          });
          // Increment supplier balance if linked to an agency
          if (agencyId) {
            await db.update(suppliersTable)
              .set({ balance: sql`${suppliersTable.balance} + ${feeAmount.toFixed(2)}` })
              .where(eq(suppliersTable.id, agencyId));
          }
        }
      }

      if (trip.status === "at_drc_entry") {
        // Create TR8 clearance if not already present
        const existing = await db.select({ id: clearancesTable.id }).from(clearancesTable)
          .where(and(eq(clearancesTable.tripId, id), eq(clearancesTable.checkpoint, "drc_entry"), inArray(clearancesTable.documentType, ["TR8"])));
        if (existing.length === 0) {
          await db.insert(clearancesTable).values({
            tripId: id, checkpoint: "drc_entry", documentType: "TR8",
            status: "requested", requestedAt: new Date(),
          });
        }
      }
    }

    const detail = await buildTripDetail(id);
    // Attach invoice de-link warning so the frontend can prompt about credit notes
    res.json(invoiceWarning ? { ...detail, _invoiceWarning: invoiceWarning } : detail);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (trip) {
      // Free the primary truck
      await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.truckId));
      // Also free any incident replacement truck (it was set to on_trip)
      if (trip.incidentFlag && trip.incidentReplacementTruckId) {
        await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.incidentReplacementTruckId));
      }
    }
    await db.delete(tripsTable).where(eq(tripsTable.id, id));
    await logAudit(req, { action: "delete", entity: "trip", entityId: id, description: `Deleted trip #${trip?.id ?? id}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:id/amend", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { amendmentType, newTruckId, newDriverId, newCapacity, reason } = req.body;
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (!trip) return res.status(404).json({ error: "Not found" });

    // Only allow cancellation if trip is not loaded or beyond
    const CANCELLABLE_STATUSES = ["draft", "nominated", "loading"];
    if (amendmentType === "cancellation" && !CANCELLABLE_STATUSES.includes(trip.status)) {
      return res.status(400).json({
        error: `Cannot cancel a trip with status '${trip.status}'. Cancellation is only allowed before loading is confirmed.`,
      });
    }

    const LOCKED_STATUSES = ["loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered"];
    if (LOCKED_STATUSES.includes(trip.status) && amendmentType !== "cancellation") {
      return res.status(400).json({
        error: `Cannot amend a trip with status '${trip.status}'. Truck swaps and driver changes are only allowed before loading is confirmed. You may still cancel this trip.`,
      });
    }

    await db.insert(tripAmendmentsTable).values({
      tripId: id,
      amendmentType,
      oldTruckId: trip.truckId,
      newTruckId: newTruckId ?? null,
      oldDriverId: trip.driverId,
      newDriverId: newDriverId ?? null,
      reason,
    });

    const updates: Partial<typeof tripsTable.$inferInsert> = {};
    if (newTruckId) {
      await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.truckId));
      await db.update(trucksTable).set({ status: "on_trip" }).where(eq(trucksTable.id, newTruckId));
      updates.truckId = newTruckId;
      // Re-stamp rate snapshots for the new truck's subcontractor
      const rateSnap = await snapTripRates(newTruckId, trip.product, trip.batchId);
      Object.assign(updates, rateSnap);
    }
    if (newDriverId) updates.driverId = newDriverId;
    if (amendmentType === "capacity_change" && newCapacity != null) {
      updates.capacity = String(parseFloat(newCapacity));
    }
    if (amendmentType === "cancellation") {
      updates.status = "cancelled";
      if (!newTruckId) {
        await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.truckId));
        // Also free any incident replacement truck that was set to on_trip
        if (trip.incidentFlag && trip.incidentReplacementTruckId) {
          await db.update(trucksTable).set({ status: "available" }).where(eq(trucksTable.id, trip.incidentReplacementTruckId));
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(tripsTable).set(updates).where(eq(tripsTable.id, id));
    }

    const detail = await buildTripDetail(id);

    const auditAction = amendmentType === "cancellation" ? "status_change" : "amendment";
    const auditDesc =
      amendmentType === "cancellation"
        ? `Trip #${id} cancelled (was ${trip.status})${reason ? ` — Reason: ${reason}` : ""}`
        : amendmentType === "truck_swap"
        ? `Trip #${id} truck swap: truck #${trip.truckId} → truck #${newTruckId}${reason ? ` — ${reason}` : ""}`
        : amendmentType === "driver_change"
        ? `Trip #${id} driver changed: driver #${trip.driverId ?? "none"} → driver #${newDriverId}${reason ? ` — ${reason}` : ""}`
        : amendmentType === "capacity_change"
        ? `Trip #${id} capacity changed to ${newCapacity} MT${reason ? ` — ${reason}` : ""}`
        : `Trip #${id} amended (${amendmentType})${reason ? ` — ${reason}` : ""}`;

    await logAudit(req, {
      action: auditAction,
      entity: "trip",
      entityId: id,
      description: auditDesc,
      metadata: {
        amendmentType,
        fromStatus: trip.status,
        ...(reason ? { reason } : {}),
        ...(newTruckId ? { newTruckId } : {}),
        ...(newDriverId ? { newDriverId } : {}),
        ...(newCapacity != null ? { newCapacity } : {}),
      },
    });

    res.json(detail);
  } catch (e) { next(e); }
});

// POST /:id/incident — flag a loaded/in-transit trip as an incident (accident, breakdown, etc.)
// Accepts: { description, replacementTruckId?, revenueOwner? }
// revenueOwner: 'original' | 'replacement' | 'split' — defaults to company revenueAttributionPolicy
router.post("/:id/incident", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { description, replacementTruckId, revenueOwner } = req.body;
    if (!description) return res.status(400).json({ error: "description is required" });

    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (!trip) return res.status(404).json({ error: "Not found" });

    const INCIDENT_ELIGIBLE = ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"];
    if (!INCIDENT_ELIGIBLE.includes(trip.status)) {
      return res.status(400).json({
        error: `Cannot flag a trip with status '${trip.status}' as an incident. Trip must be in progress.`,
      });
    }

    // Validate replacement truck if provided
    let validReplacementTruckId: number | null = null;
    if (replacementTruckId) {
      const [repTruck] = await db.select({ id: trucksTable.id, status: trucksTable.status }).from(trucksTable).where(eq(trucksTable.id, Number(replacementTruckId)));
      if (!repTruck) return res.status(400).json({ error: "Replacement truck not found" });
      validReplacementTruckId = repTruck.id;
    }

    // Flag the trip with incident info — status stays as-is so the trip continues its workflow
    await db.update(tripsTable)
      .set({
        incidentFlag: true,
        incidentDescription: description,
        incidentReplacementTruckId: validReplacementTruckId,
        incidentRevenueOwner: revenueOwner ?? null,
      })
      .where(eq(tripsTable.id, id));

    // Flag the original truck as needing maintenance
    await db.update(trucksTable)
      .set({ status: "maintenance" })
      .where(eq(trucksTable.id, trip.truckId));

    // If a replacement truck is provided, set it to on_trip — it physically takes over
    if (validReplacementTruckId) {
      await db.update(trucksTable)
        .set({ status: "on_trip" })
        .where(eq(trucksTable.id, validReplacementTruckId));

      await db.insert(tripAmendmentsTable).values({
        tripId: id,
        amendmentType: "incident",
        oldTruckId: trip.truckId,
        newTruckId: validReplacementTruckId,
        oldDriverId: trip.driverId,
        newDriverId: null,
        reason: `Incident: ${description}. Replacement truck #${validReplacementTruckId} taking over. Revenue attribution: ${revenueOwner ?? "original"}.`,
      });
    } else {
      await db.insert(tripAmendmentsTable).values({
        tripId: id,
        amendmentType: "incident",
        oldTruckId: trip.truckId,
        newTruckId: null,
        oldDriverId: trip.driverId,
        newDriverId: null,
        reason: description,
      });
    }

    await logAudit(req, {
      action: "update",
      entity: "trip",
      entityId: id,
      description: `Trip #${id} flagged as incident: ${description}${validReplacementTruckId ? ` — replacement truck #${validReplacementTruckId}` : ""}`,
      metadata: { incidentFlag: true, previousStatus: trip.status, replacementTruckId: validReplacementTruckId, revenueOwner: revenueOwner ?? null },
    });

    const detail = await buildTripDetail(id);
    res.json(detail);
  } catch (e) { next(e); }
});

router.get("/:id/expenses", async (req, res, next) => {
  try {
    const expenses = await db
      .select()
      .from(tripExpensesTable)
      .where(eq(tripExpensesTable.tripId, parseInt(req.params.id)));
    res.json(expenses.map((e) => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (e) { next(e); }
});

router.post("/:id/expenses", async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);

    // Auto-populate batchId, truckId, subcontractorId from the trip so expenses
    // can be aggregated by subcontractor and batch without extra joins.
    const [trip] = await db
      .select({ batchId: tripsTable.batchId, truckId: tripsTable.truckId, driverId: tripsTable.driverId, subcontractorId: tripsTable.subcontractorId })
      .from(tripsTable)
      .where(eq(tripsTable.id, tripId));

    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const { costType, description, amount, currency, expenseDate } = req.body;
    const bump = await bumpDateIfClosed(expenseDate ?? new Date());

    const [expense] = await db
      .insert(tripExpensesTable)
      .values({
        tripId,
        batchId: trip.batchId,
        truckId: trip.truckId,
        subcontractorId: trip.subcontractorId ?? null,
        tier: "trip",
        costType,
        description: appendNote(description, bump.noteSuffix),
        amount: parseFloat(amount).toFixed(2),
        currency: currency ?? "USD",
        expenseDate: new Date(bump.effectiveDate),
        settled: false,
      })
      .returning();

    await logAudit(req, {
      action: "create",
      entity: "trip_expense",
      entityId: expense.id,
      description: `Expense logged on trip #${tripId}: ${req.body.costType} — $${req.body.amount}`,
    });

    res.status(201).json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (e) { next(e); }
});

router.get("/:id/clearances", async (req, res, next) => {
  try {
    const clearances = await db.select().from(clearancesTable).where(eq(clearancesTable.tripId, parseInt(req.params.id)));
    res.json(clearances);
  } catch (e) { next(e); }
});

router.post("/:id/clearances", async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);
    const [clearance] = await db.insert(clearancesTable).values({ ...req.body, tripId }).returning();
    await logAudit(req, {
      action: "create",
      entity: "clearance",
      entityId: clearance.id,
      description: `Clearance document created for trip #${tripId}: ${clearance.documentType} at ${clearance.checkpoint?.replace(/_/g, " ") ?? "?"}`,
      metadata: { tripId, documentType: clearance.documentType, checkpoint: clearance.checkpoint, status: clearance.status },
    });
    res.status(201).json(clearance);
  } catch (e) { next(e); }
});

router.get("/:id/delivery-note", async (req, res, next) => {
  try {
    const [note] = await db.select().from(deliveryNotesTable).where(eq(deliveryNotesTable.tripId, parseInt(req.params.id)));
    if (!note) return res.status(404).json({ error: "Not found" });
    res.json(note);
  } catch (e) { next(e); }
});

// PATCH /api/trips/:id/reassign-batch — move a trip (and all its expenses) to a different batch
router.patch("/:id/reassign-batch", async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);
    const { batchId } = req.body;
    if (!batchId) return res.status(400).json({ error: "batchId is required" });

    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const [batch] = await db
      .select({ id: batchesTable.id, name: batchesTable.name, status: batchesTable.status })
      .from(batchesTable)
      .where(eq(batchesTable.id, parseInt(batchId)));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "cancelled") return res.status(400).json({ error: "Cannot reassign to a cancelled batch" });
    if (batch.status === "closed") return res.status(400).json({ error: "Cannot reassign to a closed batch" });
    if (batch.status === "invoiced") return res.status(400).json({ error: "Cannot reassign to an already-invoiced batch — cancel the invoice first" });

    const oldBatchId = trip.batchId;
    const [oldBatch] = await db
      .select({ name: batchesTable.name })
      .from(batchesTable)
      .where(eq(batchesTable.id, oldBatchId));

    const cleanNote = (trip.notes ?? "")
      .replace(/\n?\[moved from batch #\d+(?:\s+"[^"]+")?\]/g, "")
      .trim();
    const moveNote = cleanNote
      ? `${cleanNote}\n[moved from batch #${oldBatchId}${oldBatch?.name ? ` "${oldBatch.name}"` : ""}]`
      : `[moved from batch #${oldBatchId}${oldBatch?.name ? ` "${oldBatch.name}"` : ""}]`;

    const [updatedTrip] = await db
      .update(tripsTable)
      .set({ batchId: batch.id, notes: moveNote })
      .where(eq(tripsTable.id, tripId))
      .returning();

    // Move all trip-tier expenses to the new batch
    await db
      .update(tripExpensesTable)
      .set({ batchId: batch.id })
      .where(and(eq(tripExpensesTable.tripId, tripId), eq(tripExpensesTable.tier, "trip")));

    await logAudit(req, {
      action: "update", entity: "trip", entityId: tripId,
      description: `Trip #${tripId} (${trip.truckId ? `truck #${trip.truckId}` : "unknown truck"}) reassigned from batch #${oldBatchId} → batch "${batch.name}" (#${batch.id})`,
      metadata: { oldBatchId, newBatchId: batch.id, batchName: batch.name },
    });
    res.json(updatedTrip);
  } catch (e) { next(e); }
});

router.post("/:id/delivery-note", async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);
    const existing = await db.select().from(deliveryNotesTable).where(eq(deliveryNotesTable.tripId, tripId));
    const isUpdate = existing.length > 0;
    let note;
    if (isUpdate) {
      [note] = await db.update(deliveryNotesTable).set(req.body).where(eq(deliveryNotesTable.tripId, tripId)).returning();
    } else {
      [note] = await db.insert(deliveryNotesTable).values({ ...req.body, tripId }).returning();
    }
    await logAudit(req, {
      action: isUpdate ? "update" : "create",
      entity: "delivery_note",
      entityId: tripId,
      description: `Delivery note ${isUpdate ? "updated" : "created"} for trip #${tripId}${req.body.deliveryNoteNumber ? ` — DN# ${req.body.deliveryNoteNumber}` : ""}`,
      metadata: { tripId, deliveryNoteNumber: req.body.deliveryNoteNumber ?? null },
    });
    return res.status(201).json(note);
  } catch (e) { next(e); }
});

export default router;
