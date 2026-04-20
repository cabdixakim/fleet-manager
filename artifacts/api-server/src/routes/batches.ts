import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  clientsTable,
  clientTransactionsTable,
  invoicesTable,
  tripsTable,
  trucksTable,
  driversTable,
  subcontractorsTable,
  tripExpensesTable,
  driverPayrollAllocationsTable,
  subcontractorTransactionsTable,
} from "@workspace/db/schema";
import { eq, and, sql, count, inArray, isNull, not } from "drizzle-orm";
import { calculateTripFinancials, snapTripRates } from "../lib/financials";
import { logAudit } from "../lib/audit";

const router = Router();

async function enrichBatch(b: typeof batchesTable.$inferSelect, clientName: string) {
  const trips = await db.select({ id: tripsTable.id, status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.batchId, b.id));
  const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status)).length;
  return { ...b, ratePerMt: parseFloat(b.ratePerMt), clientName, truckCount: trips.length, activeTrips };
}

router.get("/", async (req, res, next) => {
  try {
    const { status, clientId, route } = req.query;
    let batches = await db
      .select({
        ...batchesTable,
        clientName: clientsTable.name,
      })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .orderBy(sql`${batchesTable.createdAt} desc`);

    if (status) batches = batches.filter((b) => b.status === status);
    if (clientId) batches = batches.filter((b) => b.clientId === parseInt(clientId as string));
    if (route) batches = batches.filter((b) => b.route === route);

    const enriched = await Promise.all(batches.map((b) => enrichBatch(b, b.clientName ?? "")));
    res.json(enriched);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [batch] = await db.insert(batchesTable).values(req.body).returning();
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, batch.clientId));
    await logAudit(req, { action: "create", entity: "batch", entityId: batch.id, description: `Created batch ${batch.name} for ${client?.name ?? "client"}`, metadata: { route: batch.route, cargo: batch.cargo, ratePerMt: parseFloat(batch.ratePerMt) } });
    res.status(201).json({ ...batch, ratePerMt: parseFloat(batch.ratePerMt), clientName: client?.name ?? "", truckCount: 0, activeTrips: 0 });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [batch] = await db
      .select({ ...batchesTable, clientName: clientsTable.name })
      .from(batchesTable)
      .leftJoin(clientsTable, eq(batchesTable.clientId, clientsTable.id))
      .where(eq(batchesTable.id, id));

    if (!batch) return res.status(404).json({ error: "Not found" });

    const trips = await db
      .select({
        id: tripsTable.id,
        batchId: tripsTable.batchId,
        batchName: batchesTable.name,
        truckId: tripsTable.truckId,
        truckPlate: trucksTable.plateNumber,
        trailerPlate: trucksTable.trailerPlate,
        driverId: tripsTable.driverId,
        driverName: driversTable.name,
        driverPassport: driversTable.passportNumber,
        driverLicense: driversTable.licenseNumber,
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
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
      .leftJoin(subcontractorsTable, eq(tripsTable.subcontractorId, subcontractorsTable.id))
      .leftJoin(batchesTable, eq(tripsTable.batchId, batchesTable.id))
      .where(eq(tripsTable.batchId, id));

    const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status)).length;

    res.json({
      ...batch,
      ratePerMt: parseFloat(batch.ratePerMt),
      clientName: batch.clientName ?? "",
      truckCount: trips.length,
      activeTrips,
      trips: trips.map((t) => ({
        ...t,
        capacity: parseFloat(t.capacity),
        loadedQty: t.loadedQty ? parseFloat(t.loadedQty) : null,
        deliveredQty: t.deliveredQty ? parseFloat(t.deliveredQty) : null,
        mileageStart: t.mileageStart ? parseFloat(t.mileageStart) : null,
        mileageEnd: t.mileageEnd ? parseFloat(t.mileageEnd) : null,
        fuel1: t.fuel1 ? parseFloat(t.fuel1) : null,
        fuel2: t.fuel2 ? parseFloat(t.fuel2) : null,
        fuel3: t.fuel3 ? parseFloat(t.fuel3) : null,
      })),
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
    if (!before) return res.status(404).json({ error: "Not found" });

    const BATCH_STATUS_ORDER = ["planning", "loading", "in_transit", "delivered", "invoiced", "closed"];
    const BATCH_FINANCIAL_STATUSES = ["invoiced", "closed"];
    // Statuses that cannot be cancelled — too far along
    const NON_CANCELLABLE_STATUSES = ["invoiced", "closed"];
    const newStatus: string | undefined = req.body.status;
    const userRole = (req.session as any)?.userRole as string | undefined;

    if (newStatus && newStatus !== before.status) {
      // Block cancelling an invoiced or closed batch entirely
      if (newStatus === "cancelled" && NON_CANCELLABLE_STATUSES.includes(before.status)) {
        return res.status(400).json({
          error: `Cannot cancel a batch that is already '${before.status}'. To void an invoiced batch, use the amendment or credit note process.`,
        });
      }

      // Block cancelling a batch that has active (non-cancelled) trips with cargo loaded or further
      if (newStatus === "cancelled") {
        const LOADED_OR_BEYOND = ["loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "completed", "invoiced"];
        const activeTrips = await db
          .select({ id: tripsTable.id, status: tripsTable.status })
          .from(tripsTable)
          .where(eq(tripsTable.batchId, id));
        const blockers = activeTrips.filter((t) => LOADED_OR_BEYOND.includes(t.status));
        if (blockers.length > 0) {
          return res.status(400).json({
            error: `Cannot cancel this batch — ${blockers.length} trip${blockers.length !== 1 ? "s are" : " is"} already loaded or in transit. Cancel individual trips first, or use the amendment process.`,
          });
        }
      }

      const fromIdx = BATCH_STATUS_ORDER.indexOf(before.status);
      const toIdx = BATCH_STATUS_ORDER.indexOf(newStatus);
      const isBackward = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;

      // Forward-move gates: trip statuses must support the requested batch status
      if (!isBackward && newStatus !== "cancelled" && !["invoiced", "closed"].includes(newStatus)) {
        const allTrips = await db
          .select({ id: tripsTable.id, status: tripsTable.status, loadedQty: tripsTable.loadedQty, truckId: tripsTable.truckId })
          .from(tripsTable)
          .where(eq(tripsTable.batchId, id));
        const activeTrips = allTrips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

        if (newStatus === "loading") {
          // Allow once at least 1 trip has begun or finished loading
          const LOADING_OR_BEYOND = ["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "completed"];
          const ready = activeTrips.filter((t) => LOADING_OR_BEYOND.includes(t.status));
          if (ready.length === 0) {
            return res.status(400).json({ error: "Cannot advance to 'Loading' — no trips have started loading yet. Mark at least one trip as 'Begin Loading' first." });
          }
        }

        if (newStatus === "in_transit") {
          // Rule 1: every active trip must be at least 'loaded' — no trip still nominated or mid-load
          const notYetLoaded = activeTrips.filter((t) => ["nominated", "loading"].includes(t.status));
          if (notYetLoaded.length > 0) {
            return res.status(400).json({
              error: `Cannot dispatch — ${notYetLoaded.length} trip${notYetLoaded.length !== 1 ? "s have" : " has"} not finished loading yet. All trucks must be marked 'Loaded' with a recorded quantity before the batch can be dispatched.`,
            });
          }

          // Rule 2: every 'loaded'-status trip must have loadedQty recorded
          const missingQty = activeTrips.filter((t) => t.status === "loaded" && !(Number(t.loadedQty) > 0));
          if (missingQty.length > 0) {
            return res.status(400).json({
              error: `Cannot dispatch — ${missingQty.length} trip${missingQty.length !== 1 ? "s are" : " is"} marked 'Loaded' but missing a loaded quantity. Record the loaded quantity on each trip before dispatching.`,
            });
          }

          // Rule 3: at least 1 trip must actually be in transit or beyond
          const IN_TRANSIT_OR_BEYOND = ["in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "completed"];
          const departed = activeTrips.filter((t) => IN_TRANSIT_OR_BEYOND.includes(t.status));
          if (departed.length === 0) {
            return res.status(400).json({ error: "Cannot advance to 'In Transit' — no trips have departed yet. Mark at least one trip as 'Dispatch' first." });
          }
        }

        if (newStatus === "delivered") {
          if (activeTrips.length === 0) {
            return res.status(400).json({ error: "Cannot mark as 'Delivered' — this batch has no active trips." });
          }
          const DONE = ["delivered", "completed"];
          const stillRunning = activeTrips.filter((t) => !DONE.includes(t.status));
          if (stillRunning.length > 0) {
            return res.status(400).json({
              error: `Cannot mark as 'Delivered' — ${stillRunning.length} trip${stillRunning.length !== 1 ? "s are" : " is"} still in progress (${stillRunning.map((t) => t.status).join(", ")}). All active trips must reach 'Delivered' first.`,
            });
          }
        }
      }

      if (isBackward) {
        const revertReason: string | undefined = req.body.revertReason;
        if (!revertReason?.trim()) {
          return res.status(400).json({ error: "A reason is required when reversing a batch status." });
        }
        if (BATCH_FINANCIAL_STATUSES.includes(before.status) && !["owner", "admin", "manager"].includes(userRole ?? "")) {
          return res.status(403).json({ error: `Reversing a batch from '${before.status}' status requires manager or admin access.` });
        }
        // Block revert from invoiced/closed if there are active (non-cancelled) invoices
        if (BATCH_FINANCIAL_STATUSES.includes(before.status)) {
          const activeInvoices = await db
            .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
            .from(invoicesTable)
            .where(and(eq(invoicesTable.batchId, id), not(eq(invoicesTable.status, "cancelled"))));
          if (activeInvoices.length > 0) {
            const nums = activeInvoices.map((i) => i.invoiceNumber).join(", ");
            return res.status(400).json({
              error: `Cannot revert this batch — it has active invoice${activeInvoices.length !== 1 ? "s" : ""} (${nums}). Cancel or delete the invoice first, then revert the batch status.`,
            });
          }
        }
      }
    }

    const { revertReason, ...dbBody } = req.body as Record<string, any>;
    const [batch] = await db.update(batchesTable).set(dbBody).where(eq(batchesTable.id, id)).returning();
    if (!batch) return res.status(404).json({ error: "Not found" });
    const enriched = await enrichBatch(batch, "");
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, batch.clientId));
    const isStatusChange = dbBody.status && dbBody.status !== before?.status;
    const BATCH_STATUS_ORDER2 = ["planning", "loading", "in_transit", "delivered", "invoiced", "closed"];
    const fromIdx2 = BATCH_STATUS_ORDER2.indexOf(before?.status ?? "");
    const toIdx2 = BATCH_STATUS_ORDER2.indexOf(batch.status);
    const isRevert = fromIdx2 !== -1 && toIdx2 !== -1 && toIdx2 < fromIdx2;
    const desc = isStatusChange
      ? `Batch ${batch.name} status ${isRevert ? "reverted" : "changed"} from ${before?.status} to ${batch.status}${revertReason ? ` — Reason: ${revertReason}` : ""}`
      : `Updated batch ${batch.name}`;
    await logAudit(req, {
      action: isStatusChange ? (isRevert ? "status_revert" : "status_change") : "update",
      entity: "batch", entityId: id, description: desc,
      metadata: isStatusChange ? { from: before?.status, to: batch.status, ...(revertReason ? { revertReason } : {}) } : undefined,
    });
    res.json({ ...enriched, clientName: client?.name ?? "" });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
    await db.delete(batchesTable).where(eq(batchesTable.id, id));
    await logAudit(req, { action: "delete", entity: "batch", entityId: id, description: `Deleted batch ${batch?.name ?? id}` });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post("/:id/nominate", async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id);
    const { nominations } = req.body as { nominations: Array<{ truckId: number; driverId?: number; product: string; capacity: number }> };

    // Duplicate check 1: same truck appears more than once in this request
    const incomingTruckIds = nominations.map((n) => n.truckId);
    const incomingDuplicates = incomingTruckIds.filter((id, i) => incomingTruckIds.indexOf(id) !== i);
    if (incomingDuplicates.length > 0) {
      return res.status(400).json({ error: "The same truck cannot be nominated more than once in a single request." });
    }

    // Duplicate check 2: any of these trucks already have an active trip on this batch
    const existingTrips = await db
      .select({ truckId: tripsTable.truckId, product: tripsTable.product })
      .from(tripsTable)
      .where(and(eq(tripsTable.batchId, batchId), not(inArray(tripsTable.status, ["cancelled", "amended_out"]))));
    const alreadyNominated = new Set(existingTrips.map((t) => t.truckId));
    const conflicting = nominations.filter((n) => alreadyNominated.has(n.truckId));
    if (conflicting.length > 0) {
      return res.status(400).json({
        error: `${conflicting.length === 1 ? "That truck is" : "Those trucks are"} already nominated on this batch. Each truck can only appear once per batch.`,
      });
    }

    // Product consistency check 1: all incoming nominations must use the same product
    const incomingProducts = [...new Set(nominations.map((n) => n.product))];
    if (incomingProducts.length > 1) {
      return res.status(400).json({
        error: `All trucks in a batch must carry the same product. You selected both ${incomingProducts.join(" and ")} — please use separate batches for different products.`,
      });
    }

    // Product consistency check 2: must match the product already established for this batch
    if (existingTrips.length > 0) {
      const batchProduct = existingTrips[0].product;
      const incomingProduct = incomingProducts[0];
      if (incomingProduct && incomingProduct !== batchProduct) {
        return res.status(400).json({
          error: `This batch is already carrying ${batchProduct}. You cannot add ${incomingProduct} trucks — each batch is locked to a single product.`,
        });
      }
    }

    const created = await Promise.all(
      nominations.map(async (n) => {
        // Snap rates before inserting so they're baked in from day one
        const rateSnap = await snapTripRates(n.truckId, n.product, batchId);
        // Also snapshot the truck's current subcontractor so history stays correct if truck is later reassigned
        const [truck] = await db.select({ plateNumber: trucksTable.plateNumber, trailerPlate: trucksTable.trailerPlate, subcontractorId: trucksTable.subcontractorId }).from(trucksTable).where(eq(trucksTable.id, n.truckId));
        const [trip] = await db
          .insert(tripsTable)
          .values({ batchId, truckId: n.truckId, driverId: n.driverId ?? null, product: n.product, capacity: n.capacity.toString(), status: "nominated", subcontractorId: truck?.subcontractorId ?? null, ...rateSnap })
          .returning();
        await db.update(trucksTable).set({ status: "on_trip" }).where(eq(trucksTable.id, n.truckId));
        const [driver] = n.driverId ? await db.select({ name: driversTable.name }).from(driversTable).where(eq(driversTable.id, n.driverId)) : [null];
        const [sub] = await db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, truck.subcontractorId));
        return {
          ...trip,
          capacity: parseFloat(trip.capacity),
          truckPlate: truck.plateNumber,
          trailerPlate: truck.trailerPlate,
          driverName: driver?.name ?? null,
          subcontractorId: truck.subcontractorId,
          subcontractorName: sub?.name ?? "",
        };
      })
    );

    // Log one audit entry per nominated trip
    for (const trip of created) {
      await logAudit(req, {
        action: "create",
        entity: "trip",
        entityId: trip.id,
        description: `Nominated truck ${trip.truckPlate} (${trip.subcontractorName}) on batch #${batchId} — ${trip.product}, ${trip.capacity} MT`,
        metadata: { batchId, truckId: trip.truckId, driverId: trip.driverId, product: trip.product, capacity: trip.capacity },
      });
    }

    res.status(201).json(created);
  } catch (e) { next(e); }
});

// GET /api/batches/:id/invoices — list invoices raised for this batch
router.get("/:id/invoices", async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id);
    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        grossRevenue: invoicesTable.grossRevenue,
        netRevenue: invoicesTable.netRevenue,
        issuedDate: invoicesTable.issuedDate,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.batchId, batchId))
      .orderBy(invoicesTable.createdAt);
    res.json(invoices.map((i) => ({
      ...i,
      grossRevenue: parseFloat(i.grossRevenue),
      netRevenue: parseFloat(i.netRevenue),
    })));
  } catch (e) { next(e); }
});

router.post("/:id/raise-invoice", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { invoiceReference, invoiceDate, tripIds } = req.body as {
      invoiceReference?: string;
      invoiceDate?: string;
      tripIds?: number[];
    };

    const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    if (batch.status !== "delivered") {
      return res.status(400).json({
        error: `Cannot raise an invoice — batch must be 'Delivered' first (current status: '${batch.status}'). All trips must complete before invoicing.`,
      });
    }

    // Get all delivered trips in this batch that have NOT already been stamped to an invoice
    const deliveredTrips = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(
        eq(tripsTable.batchId, id),
        inArray(tripsTable.status, ["delivered", "completed", "amended_out"]),
        isNull(tripsTable.invoiceId)  // ← only uninvoiced trips
      ));

    // If caller supplied specific tripIds, filter to only uninvoiced delivered ones
    const candidateIds = deliveredTrips.map((t) => t.id);
    const selectedIds = tripIds?.length
      ? tripIds.filter((tid) => candidateIds.includes(tid))
      : candidateIds;

    if (selectedIds.length === 0) {
      return res.status(400).json({ error: "No uninvoiced delivered trips found. All delivered trips may already be included in an existing invoice." });
    }

    // Calculate financials for each selected trip
    let totalLoaded = 0;
    let totalDelivered = 0;
    let grossRevenue = 0;
    let totalShortCharge = 0;

    for (const tripId of selectedIds) {
      const fin = await calculateTripFinancials(tripId);
      grossRevenue += fin.grossRevenue ?? 0;
      totalShortCharge += fin.clientShortCharge ?? 0;  // client-facing deduction, not sub penalty
      // also grab loaded/delivered from trips table
      const [t] = await db
        .select({ loadedQty: tripsTable.loadedQty, deliveredQty: tripsTable.deliveredQty })
        .from(tripsTable).where(eq(tripsTable.id, tripId));
      totalLoaded += t?.loadedQty ? parseFloat(t.loadedQty) : 0;
      totalDelivered += t?.deliveredQty ? parseFloat(t.deliveredQty) : 0;
    }

    const netRevenue = grossRevenue - totalShortCharge;

    if (grossRevenue <= 0) {
      return res.status(400).json({ error: "Invoice amount is zero. Check that trips have loaded/delivered quantities." });
    }

    // Check for duplicate user-supplied reference
    if (invoiceReference?.trim()) {
      const [existing] = await db
        .select({ id: invoicesTable.id })
        .from(invoicesTable)
        .where(eq(invoicesTable.invoiceNumber, invoiceReference.trim()));
      if (existing) {
        return res.status(400).json({
          error: `Reference "${invoiceReference.trim()}" is already in use. Please choose a different one.`,
        });
      }
    }

    const txDate = invoiceDate ? new Date(invoiceDate) : new Date();
    const dueDateParsed = req.body.dueDate ? new Date(req.body.dueDate) : null;

    // Insert with a placeholder number first to get the auto-increment ID
    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: "__PENDING__",
      batchId: id,
      clientId: batch.clientId,
      totalLoadedQty: totalLoaded.toFixed(3),
      totalDeliveredQty: totalDelivered.toFixed(3),
      ratePerMt: batch.ratePerMt,
      grossRevenue: grossRevenue.toFixed(2),
      totalShortCharge: totalShortCharge.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      status: "sent",
      issuedDate: txDate,
      dueDate: dueDateParsed,
    }).returning();

    // Assign final invoice number: user-supplied or sequential INV-XXXX
    const finalInvoiceNumber = invoiceReference?.trim() ?? `INV-${String(invoice.id).padStart(4, "0")}`;
    const [updatedInvoice] = await db
      .update(invoicesTable)
      .set({ invoiceNumber: finalInvoiceNumber })
      .where(eq(invoicesTable.id, invoice.id))
      .returning();
    Object.assign(invoice, updatedInvoice);

    // Create accounting entry in client ledger for balance tracking
    // Use netRevenue (gross minus client short charge credit) so that the ledger reflects
    // what the client actually owes, and cancellation reversals are perfectly symmetrical.
    const [tx] = await db.insert(clientTransactionsTable).values({
      clientId: batch.clientId,
      batchId: id,
      type: "invoice",
      amount: netRevenue.toFixed(2),
      reference: invoiceNumber,
      invoiceId: invoice.id,
      description: `Invoice ${invoiceNumber} — ${batch.name} (${selectedIds.length} trip${selectedIds.length !== 1 ? "s" : ""})`,
      transactionDate: txDate,
    }).returning();

    // Stamp each invoiced trip with this invoice's ID — prevents them being picked up in a future invoice
    if (selectedIds.length > 0) {
      await db.update(tripsTable)
        .set({ invoiceId: invoice.id })
        .where(inArray(tripsTable.id, selectedIds));
    }

    // Mark batch as invoiced if all uninvoiced delivered trips are now included
    if (batch.status !== "invoiced") {
      const allDelivered = candidateIds.length > 0 && selectedIds.length >= candidateIds.length;
      if (allDelivered) {
        await db.update(batchesTable).set({ status: "invoiced" }).where(eq(batchesTable.id, id));
      }
    }

    await logAudit(req, {
      action: "create", entity: "invoice", entityId: invoice.id,
      description: `Invoice ${invoiceNumber} raised for batch ${batch.name}: $${grossRevenue.toFixed(2)} gross (${selectedIds.length} trip${selectedIds.length !== 1 ? "s" : ""})`,
    });

    res.status(201).json({
      invoiceId: invoice.id,
      invoiceNumber,
      transaction: { ...tx, amount: parseFloat(tx.amount) },
      grossRevenue,
      netRevenue,
      tripCount: selectedIds.length,
    });
  } catch (e) { next(e); }
});

router.get("/:id/financials", async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id);
    const [batch] = await db.select({ name: batchesTable.name, ratePerMt: batchesTable.ratePerMt }).from(batchesTable).where(eq(batchesTable.id, batchId));
    if (!batch) return res.status(404).json({ error: "Not found" });

    const trips = await db
      .select({ id: tripsTable.id, loadedQty: tripsTable.loadedQty, deliveredQty: tripsTable.deliveredQty, capacity: tripsTable.capacity, truckPlate: trucksTable.plateNumber, product: tripsTable.product, status: tripsTable.status, subcontractorId: tripsTable.subcontractorId, invoiceId: tripsTable.invoiceId })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .where(and(eq(tripsTable.batchId, batchId)));

    const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

    const tripBreakdown = await Promise.all(
      activeTrips.map(async (t) => {
        const fin = await calculateTripFinancials(t.id);
        return { tripId: t.id, truckPlate: t.truckPlate, product: t.product, subcontractorId: t.subcontractorId, invoiceId: t.invoiceId ?? null, ...fin };
      })
    );

    // Fetch advances given to subcontractors for trips in this batch
    const tripIds = activeTrips.map((t) => t.id).filter(Boolean);
    const subAdvances: Record<number, number> = {};
    if (tripIds.length > 0) {
      const advanceTxs = await db
        .select({ subcontractorId: subcontractorTransactionsTable.subcontractorId, amount: subcontractorTransactionsTable.amount })
        .from(subcontractorTransactionsTable)
        .where(and(inArray(subcontractorTransactionsTable.tripId, tripIds), eq(subcontractorTransactionsTable.type, "advance_given")));
      for (const tx of advanceTxs) {
        subAdvances[tx.subcontractorId] = (subAdvances[tx.subcontractorId] ?? 0) + parseFloat(tx.amount);
      }
    }

    const totalCapacity = activeTrips.reduce((s, t) => s + parseFloat(t.capacity), 0);
    const totalLoadedQty = activeTrips.reduce((s, t) => s + (t.loadedQty ? parseFloat(t.loadedQty) : 0), 0);
    const totalDeliveredQty = activeTrips.reduce((s, t) => s + (t.deliveredQty ? parseFloat(t.deliveredQty) : 0), 0);
    const grossRevenue = tripBreakdown.reduce((s, t) => s + (t.grossRevenue ?? 0), 0);
    const totalCommission = tripBreakdown.reduce((s, t) => s + (t.commission ?? 0), 0);
    const totalShortCharges = tripBreakdown.reduce((s, t) => s + (t.shortCharge ?? 0), 0);
    const totalTripExpenses = tripBreakdown.reduce((s, t) => s + t.tripExpensesTotal, 0);
    const totalDriverSalaries = tripBreakdown.reduce((s, t) => s + t.driverSalaryAllocation, 0);
    const totalNetPayable = tripBreakdown.reduce((s, t) => s + (t.netPayable ?? 0), 0);

    res.json({
      batchId,
      batchName: batch.name,
      totalCapacity,
      totalLoadedQty,
      totalDeliveredQty,
      grossRevenue,
      totalCommission,
      totalShortCharges,
      totalTripExpenses,
      totalDriverSalaries,
      totalNetPayable,
      netProfit: totalCommission - totalTripExpenses,
      tripBreakdown,
      subAdvances,
    });
  } catch (e) { next(e); }
});

export default router;
