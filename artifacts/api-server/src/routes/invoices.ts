import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable,
  batchesTable,
  clientsTable,
  clientTransactionsTable,
  tripsTable,
  trucksTable,
  agentsTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { calculateTripFinancials } from "../lib/financials";
import { logAudit } from "../lib/audit";
import { postJournalEntry, postReversalEntry, deleteJournalEntriesForReference, resolveBankGlCode } from "../lib/glPosting";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        batchId: invoicesTable.batchId,
        batchName: batchesTable.name,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        totalLoadedQty: invoicesTable.totalLoadedQty,
        totalDeliveredQty: invoicesTable.totalDeliveredQty,
        ratePerMt: invoicesTable.ratePerMt,
        grossRevenue: invoicesTable.grossRevenue,
        totalShortCharge: invoicesTable.totalShortCharge,
        netRevenue: invoicesTable.netRevenue,
        status: invoicesTable.status,
        issuedDate: invoicesTable.issuedDate,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(batchesTable, eq(invoicesTable.batchId, batchesTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .orderBy(desc(invoicesTable.createdAt));

    res.json(
      invoices.map((i) => ({
        ...i,
        totalLoadedQty: parseFloat(i.totalLoadedQty),
        totalDeliveredQty: parseFloat(i.totalDeliveredQty),
        ratePerMt: parseFloat(i.ratePerMt),
        grossRevenue: parseFloat(i.grossRevenue),
        totalShortCharge: parseFloat(i.totalShortCharge),
        netRevenue: parseFloat(i.netRevenue),
      }))
    );
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { batchId, issuedDate, dueDate, notes, status } = req.body;

    const [batch] = await db
      .select({ ratePerMt: batchesTable.ratePerMt, clientId: batchesTable.clientId, name: batchesTable.name, status: batchesTable.status })
      .from(batchesTable)
      .where(eq(batchesTable.id, batchId));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    if (batch.status !== "delivered") {
      return res.status(400).json({
        error: `Cannot raise an invoice — batch must be 'Delivered' first (current status: '${batch.status}'). All trips must complete before invoicing.`,
      });
    }

    const trips = await db
      .select({
        id: tripsTable.id,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        status: tripsTable.status,
        product: tripsTable.product,
      })
      .from(tripsTable)
      .where(eq(tripsTable.batchId, batchId));

    const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

    let totalLoaded = 0;
    let totalDelivered = 0;
    let grossRevenue = 0;
    let totalShortCharge = 0;

    for (const t of activeTrips) {
      const fin = await calculateTripFinancials(t.id);
      totalLoaded += t.loadedQty ? parseFloat(t.loadedQty) : 0;
      totalDelivered += t.deliveredQty ? parseFloat(t.deliveredQty) : 0;
      grossRevenue += fin.grossRevenue ?? 0;
      totalShortCharge += fin.clientShortCharge ?? 0; // client-facing rate, not sub penalty
    }

    const ratePerMt = parseFloat(batch.ratePerMt);
    const netRevenue = grossRevenue - totalShortCharge;

    const invoiceNumber = `INV-${Date.now()}`;

    const [invoice] = await db
      .insert(invoicesTable)
      .values({
        invoiceNumber,
        batchId,
        clientId: batch.clientId,
        totalLoadedQty: totalLoaded.toString(),
        totalDeliveredQty: totalDelivered.toString(),
        ratePerMt: ratePerMt.toString(),
        grossRevenue: grossRevenue.toString(),
        totalShortCharge: totalShortCharge.toString(),
        netRevenue: netRevenue.toString(),
        status: status ?? "draft",
        issuedDate: issuedDate ?? null,
        dueDate: dueDate ?? null,
        notes: notes ?? null,
      })
      .returning();

    await db.update(batchesTable).set({ status: "invoiced" }).where(eq(batchesTable.id, batchId));

    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, batch.clientId));
    await logAudit(req, { action: "create", entity: "invoice", entityId: invoice.id, description: `Created invoice ${invoice.invoiceNumber} for ${client?.name ?? "client"} — $${netRevenue.toFixed(0)}`, metadata: { batchId, grossRevenue, netRevenue, totalShortCharge } });

    // Auto-post to GL: Dr Accounts Receivable, Cr Freight Revenue
    if (netRevenue > 0) {
      await postJournalEntry({
        description: `Invoice ${invoice.invoiceNumber} — ${client?.name ?? "client"}`,
        entryDate: issuedDate ? new Date(issuedDate) : new Date(),
        referenceType: "invoice",
        referenceId: invoice.id,
        lines: [
          { accountCode: "1100", debit: netRevenue, description: `AR — ${invoice.invoiceNumber}` },
          { accountCode: "4001", credit: netRevenue, description: "Freight Revenue" },
        ],
      });
    }

    res.status(201).json({
      ...invoice,
      batchName: batch.name,
      clientName: client?.name ?? "",
      totalLoadedQty: parseFloat(invoice.totalLoadedQty),
      totalDeliveredQty: parseFloat(invoice.totalDeliveredQty),
      ratePerMt: parseFloat(invoice.ratePerMt),
      grossRevenue: parseFloat(invoice.grossRevenue),
      totalShortCharge: parseFloat(invoice.totalShortCharge),
      netRevenue: parseFloat(invoice.netRevenue),
    });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [invoice] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        batchId: invoicesTable.batchId,
        batchName: batchesTable.name,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientEmail: clientsTable.contactEmail,
        totalLoadedQty: invoicesTable.totalLoadedQty,
        totalDeliveredQty: invoicesTable.totalDeliveredQty,
        ratePerMt: invoicesTable.ratePerMt,
        grossRevenue: invoicesTable.grossRevenue,
        totalShortCharge: invoicesTable.totalShortCharge,
        netRevenue: invoicesTable.netRevenue,
        status: invoicesTable.status,
        issuedDate: invoicesTable.issuedDate,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        isAmended: invoicesTable.isAmended,
        amendmentCount: invoicesTable.amendmentCount,
        amendedAt: invoicesTable.amendedAt,
        amendmentReason: invoicesTable.amendmentReason,
        originalGrossRevenue: invoicesTable.originalGrossRevenue,
        originalNetRevenue: invoicesTable.originalNetRevenue,
        agentFeePerMt: batchesTable.agentFeePerMt,
        agentName: agentsTable.name,
      })
      .from(invoicesTable)
      .leftJoin(batchesTable, eq(invoicesTable.batchId, batchesTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(agentsTable, eq(batchesTable.agentId, agentsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!invoice) return res.status(404).json({ error: "Not found" });

    // Only include trips stamped to THIS invoice — prevents showing de-linked or unrelated trips
    const trips = await db
      .select({
        id: tripsTable.id,
        truckPlate: trucksTable.plateNumber,
        product: tripsTable.product,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
        status: tripsTable.status,
      })
      .from(tripsTable)
      .leftJoin(trucksTable, eq(tripsTable.truckId, trucksTable.id))
      .where(eq(tripsTable.invoiceId, id));

    const lineItems = await Promise.all(
      trips.map(async (t) => {
        const fin = await calculateTripFinancials(t.id);
        const clientShortCharge = fin.clientShortCharge ?? 0;
        return {
          tripId: t.id,
          truckPlate: t.truckPlate,
          product: t.product,
          loadedQty: t.loadedQty ? parseFloat(t.loadedQty) : 0,
          deliveredQty: t.deliveredQty ? parseFloat(t.deliveredQty) : 0,
          shortQty: fin.shortQty ?? 0,
          allowanceQty: fin.allowanceQty ?? 0,
          chargeableShort: fin.chargeableShort ?? 0,
          shortRate: fin.clientShortChargeRate ?? 0,
          shortCharge: clientShortCharge,
          grossRevenue: fin.grossRevenue ?? 0,
          netRevenue: (fin.grossRevenue ?? 0) - clientShortCharge,
        };
      })
    );

    // Fetch client transactions for this batch to build the account statement
    const batchTransactions = await db
      .select()
      .from(clientTransactionsTable)
      .where(eq(clientTransactionsTable.batchId, invoice.batchId))
      .orderBy(clientTransactionsTable.transactionDate);

    const advances = batchTransactions
      .filter((t) => t.type === "advance")
      .map((t) => ({ ...t, amount: parseFloat(t.amount) }));

    const payments = batchTransactions
      .filter((t) => t.type === "payment")
      .map((t) => ({ ...t, amount: parseFloat(t.amount) }));

    const adjustments = batchTransactions
      .filter((t) => t.type === "adjustment")
      .map((t) => ({ ...t, amount: parseFloat(t.amount) }));

    const totalAdvances = advances.reduce((s, t) => s + t.amount, 0);
    const totalPayments = payments.reduce((s, t) => s + t.amount, 0);
    const totalAdjustments = adjustments.reduce((s, t) => s + t.amount, 0);
    const invoiceGross = parseFloat(invoice.grossRevenue);
    const invoiceShortCharge = parseFloat(invoice.totalShortCharge);
    const invoiceNetRevenue = parseFloat(invoice.netRevenue);
    // netDue starts from netRevenue (what the client actually owes after short-charge deductions),
    // then reduces by any advances, payments, and adjustments already received.
    const netDue = invoiceNetRevenue - totalAdvances - totalPayments - totalAdjustments;

    res.json({
      ...invoice,
      totalLoadedQty: parseFloat(invoice.totalLoadedQty),
      totalDeliveredQty: parseFloat(invoice.totalDeliveredQty),
      ratePerMt: parseFloat(invoice.ratePerMt),
      grossRevenue: invoiceGross,
      totalShortCharge: invoiceShortCharge,
      netRevenue: invoiceNetRevenue,
      originalGrossRevenue: invoice.originalGrossRevenue ? parseFloat(invoice.originalGrossRevenue) : null,
      originalNetRevenue: invoice.originalNetRevenue ? parseFloat(invoice.originalNetRevenue) : null,
      agentName: invoice.agentName ?? null,
      agentFeePerMt: invoice.agentFeePerMt ? parseFloat(invoice.agentFeePerMt) : null,
      lineItems,
      accountStatement: {
        grossRevenue: invoiceGross,
        totalShortCharge: invoiceShortCharge,
        invoicedAmount: invoiceNetRevenue, // the amount actually owed by client (net of short charges)
        advances,
        payments,
        adjustments,
        totalAdvances,
        totalPayments,
        totalAdjustments,
        netDue,
      },
    });
  } catch (e) { next(e); }
});

// PUT /api/invoices/:id/amend — adjust invoice amounts with per-trip overrides
router.put("/:id/amend", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { reason, adjustments: tripAdjustments } = req.body as {
      reason: string;
      adjustments: { tripId: number; deliveredQty?: number; ratePerMt?: number; loadedQty?: number; clientShortRate?: number }[];
    };

    if (!reason?.trim()) return res.status(400).json({ error: "Amendment reason is required." });

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    if (invoice.status === "paid") return res.status(400).json({ error: "Cannot amend a paid invoice." });
    const oldGross = parseFloat(invoice.grossRevenue);

    // Get all trips stamped to this invoice
    const invoicedTrips = await db
      .select({
        id: tripsTable.id,
        loadedQty: tripsTable.loadedQty,
        deliveredQty: tripsTable.deliveredQty,
      })
      .from(tripsTable)
      .where(eq(tripsTable.invoiceId, id));

    if (invoicedTrips.length === 0) return res.status(400).json({ error: "No trips are stamped to this invoice." });

    // Build a map of overrides keyed by tripId
    const overrideMap = new Map((tripAdjustments ?? []).map((a) => [a.tripId, a]));

    // Recalculate totals applying any per-trip overrides
    let newGross = 0;
    let newShort = 0;

    for (const trip of invoicedTrips) {
      const override = overrideMap.get(trip.id);
      const fin = await calculateTripFinancials(trip.id, {
        overrideDeliveredQty: override?.deliveredQty,
        overrideRate: override?.ratePerMt,
        overrideLoadedQty: override?.loadedQty,
        overrideClientShortRate: override?.clientShortRate,
      });
      newGross += fin.grossRevenue ?? 0;
      newShort += fin.clientShortCharge ?? 0; // client-facing short charge rate
    }

    const newNet = newGross - newShort;
    const oldNet = parseFloat(invoice.netRevenue);
    const delta = newNet - oldNet; // net change (captures both rate and qty adjustments)

    // Preserve original amounts only on first amendment
    const isFirstAmendment = !invoice.isAmended;
    const updateData: Record<string, unknown> = {
      grossRevenue: newGross.toFixed(2),
      totalShortCharge: newShort.toFixed(2),
      netRevenue: newNet.toFixed(2),
      isAmended: true,
      amendmentCount: (invoice.amendmentCount ?? 0) + 1,
      amendedAt: new Date(),
      amendmentReason: reason.trim(),
    };
    if (isFirstAmendment) {
      updateData.originalGrossRevenue = oldGross.toFixed(2);
      updateData.originalNetRevenue = parseFloat(invoice.netRevenue).toFixed(2);
    }

    const [updated] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();

    // Post correcting entry to client ledger if there's a delta
    if (Math.abs(delta) >= 0.01) {
      await db.insert(clientTransactionsTable).values({
        clientId: invoice.clientId,
        type: "adjustment",
        amount: delta.toFixed(2),
        reference: `Amendment #${updated.amendmentCount} — ${invoice.invoiceNumber}`,
        batchId: invoice.batchId,
        invoiceId: id,
        description: reason.trim(),
        transactionDate: new Date(),
      });

      // Re-post the AR/Revenue GL entry with the updated net revenue
      await deleteJournalEntriesForReference("invoice", id);
      if (newNet > 0) {
        await postJournalEntry({
          description: `Invoice ${invoice.invoiceNumber} — amendment #${updated.amendmentCount}`,
          entryDate: new Date(),
          referenceType: "invoice",
          referenceId: id,
          lines: [
            { accountCode: "1100", debit: newNet, description: `AR — ${invoice.invoiceNumber}` },
            { accountCode: "4001", credit: newNet, description: "Freight Revenue" },
          ],
        });
      }
    }

    await logAudit(req, {
      action: "update",
      entity: "invoice",
      entityId: id,
      description: `Invoice ${invoice.invoiceNumber} amended (amendment #${updated.amendmentCount}): $${oldGross.toFixed(2)} → $${newGross.toFixed(2)} (delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}). Reason: ${reason.trim()}`,
      metadata: { oldGross, newGross, delta, reason },
    });

    res.json({ ...updated, delta });
  } catch (e) { next(e); }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { status, paidDate } = req.body;
    const VALID = ["draft", "sent", "paid", "overdue", "cancelled"];
    if (!VALID.includes(status)) return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID.join(", ")}` });

    const [before] = await db.select({ status: invoicesTable.status }).from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!before) return res.status(404).json({ error: "Not found" });

    const updateData: Record<string, unknown> = { status };
    if (status === "paid") updateData.paidDate = paidDate ?? new Date().toISOString().split("T")[0];
    const [invoice] = await db
      .update(invoicesTable)
      .set(updateData)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.status, before.status)))
      .returning();
    if (!invoice) return res.status(409).json({ conflict: true });

    // When cancelling: reverse ledger entry, unstamp trips, revert batch
    if (status === "cancelled" && invoice.clientId) {
      // Post a reversal entry to cancel out the original invoice charge
      const invoiceAmount = parseFloat(invoice.netRevenue ?? invoice.grossRevenue ?? "0");
      if (invoiceAmount > 0) {
        await db.insert(clientTransactionsTable).values({
          clientId: invoice.clientId,
          batchId: invoice.batchId,
          invoiceId: id,
          type: "adjustment",
          amount: (-invoiceAmount).toFixed(2),
          reference: `VOID — ${invoice.invoiceNumber}`,
          description: `Invoice ${invoice.invoiceNumber} cancelled — reversal of original charge`,
          transactionDate: new Date(),
        });
      }

      if (invoice.batchId) {
        await db.update(tripsTable).set({ invoiceId: null }).where(eq(tripsTable.invoiceId, id));
        const allBatchInvoices = await db
          .select({ id: invoicesTable.id, status: invoicesTable.status })
          .from(invoicesTable)
          .where(eq(invoicesTable.batchId, invoice.batchId));
        const hasOtherActive = allBatchInvoices.some((i) => i.id !== id && i.status !== "cancelled");
        if (!hasOtherActive) {
          const [batch] = await db.select({ status: batchesTable.status }).from(batchesTable).where(eq(batchesTable.id, invoice.batchId));
          if (batch?.status === "invoiced" || batch?.status === "closed") {
            await db.update(batchesTable).set({ status: "delivered" }).where(eq(batchesTable.id, invoice.batchId));
          }
        }
      }

      // Reverse GL: Dr Revenue / Cr AR (undoes the original Dr AR / Cr Revenue posting)
      await postReversalEntry("invoice", id, `VOID — ${invoice.invoiceNumber}`, new Date());
      // Also reverse the payment GL entry if it exists (i.e. invoice was paid before cancellation)
      await postReversalEntry("invoice_payment", id, `VOID payment — ${invoice.invoiceNumber}`, new Date());
    }

    // Auto-post to GL when paid: Dr Bank (specific or default), Cr Accounts Receivable
    // Use netDue (netRevenue minus advances/payments already recorded) to avoid double-counting
    if (status === "paid") {
      const { bankAccountId } = req.body;
      const netRevenue = parseFloat(invoice.netRevenue ?? invoice.grossRevenue ?? "0");
      const [alreadyReceived] = await db
        .select({ total: sql<string>`coalesce(sum(amount), '0')` })
        .from(clientTransactionsTable)
        .where(and(
          eq(clientTransactionsTable.invoiceId, id),
          sql`type IN ('payment', 'advance')`,
        ));
      const received = parseFloat(alreadyReceived?.total ?? "0");
      const netDue = Math.max(0, netRevenue - received);
      if (netDue > 0.005) {
        const bankGlCode = await resolveBankGlCode("bank_transfer", bankAccountId ?? null);
        await postJournalEntry({
          description: `Payment received — ${invoice.invoiceNumber}`,
          entryDate: paidDate ? new Date(paidDate) : new Date(),
          referenceType: "invoice_payment",
          referenceId: invoice.id,
          lines: [
            { accountCode: bankGlCode, debit: netDue, description: `Payment — ${invoice.invoiceNumber}` },
            { accountCode: "1100", credit: netDue, description: "Clear AR" },
          ],
        });
      }
    }

    const auditSuffix = status === "cancelled" ? " — ledger reversed, trips de-linked, batch reverted to Delivered" : "";
    await logAudit(req, {
      action: "update", entity: "invoice", entityId: invoice.id,
      description: `Invoice ${invoice.invoiceNumber} marked as ${status}${auditSuffix}`,
    });
    res.json(invoice);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [invoice] = await db
      .update(invoicesTable)
      .set(req.body)
      .where(eq(invoicesTable.id, id))
      .returning();
    if (!invoice) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update",
      entity: "invoice",
      entityId: id,
      description: `Invoice ${invoice.invoiceNumber} updated`,
      metadata: { fields: Object.keys(req.body) },
    });
    res.json(invoice);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [invoice] = await db
      .select({ invoiceNumber: invoicesTable.invoiceNumber, netRevenue: invoicesTable.netRevenue, batchId: invoicesTable.batchId, clientId: invoicesTable.clientId })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Reverse any ledger entries that were posted when this invoice was raised
    // (same logic as cancel — prevents orphaned balances on the client ledger)
    if (invoice.clientId) {
      const ledgerEntries = await db
        .select({ amount: clientTransactionsTable.amount })
        .from(clientTransactionsTable)
        .where(and(eq(clientTransactionsTable.invoiceId, id), eq(clientTransactionsTable.type, "invoice")));
      for (const entry of ledgerEntries) {
        const amt = parseFloat(entry.amount);
        if (amt > 0) {
          await db.insert(clientTransactionsTable).values({
            clientId: invoice.clientId,
            batchId: invoice.batchId,
            invoiceId: id,
            type: "adjustment",
            amount: (-amt).toFixed(2),
            reference: `VOID — ${invoice.invoiceNumber}`,
            description: `Invoice ${invoice.invoiceNumber} deleted — reversal of original charge`,
            transactionDate: new Date(),
          });
        }
      }
    }

    // Unstamp all trips that were on this invoice
    await db.update(tripsTable).set({ invoiceId: null }).where(eq(tripsTable.invoiceId, id));

    // Revert batch to delivered if it was invoiced/closed and no other invoices remain
    if (invoice.batchId) {
      const allBatchInvoices = await db
        .select({ id: invoicesTable.id })
        .from(invoicesTable)
        .where(eq(invoicesTable.batchId, invoice.batchId));
      const otherInvoices = allBatchInvoices.filter((i) => i.id !== id);
      if (otherInvoices.length === 0) {
        const [batch] = await db.select({ status: batchesTable.status }).from(batchesTable).where(eq(batchesTable.id, invoice.batchId));
        if (batch?.status === "invoiced" || batch?.status === "closed") {
          await db.update(batchesTable).set({ status: "delivered" }).where(eq(batchesTable.id, invoice.batchId));
        }
      }
    }

    // Reverse GL entries posted for this invoice (AR/Revenue and payment if it existed)
    await postReversalEntry("invoice", id, `DELETED — ${invoice.invoiceNumber}`, new Date());
    await postReversalEntry("invoice_payment", id, `DELETED payment — ${invoice.invoiceNumber}`, new Date());

    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "invoice",
      entityId: id,
      description: `Deleted invoice ${invoice.invoiceNumber}${invoice.netRevenue ? ` ($${parseFloat(invoice.netRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })})` : ""} — GL reversed, ledger reversed, trips de-linked, batch reverted to Delivered`,
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
