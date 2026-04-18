import { Router } from "express";
import { db } from "@workspace/db";
import {
  suppliersTable,
  supplierPaymentsTable,
  tripExpensesTable,
  companyExpensesTable,
} from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { postJournalEntry, postOrUpdateOpeningBalance } from "../lib/glPosting";

const router = Router();

// GET /api/suppliers — list all suppliers with running balance owed
router.get("/", async (req, res, next) => {
  try {
    const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);

    const results = await Promise.all(suppliers.map(async (s) => {
      const [tripTotal] = await db
        .select({ total: sql<string>`coalesce(sum(${tripExpensesTable.amount}), 0)` })
        .from(tripExpensesTable)
        .where(eq(tripExpensesTable.supplierId, s.id));

      const [companyTotal] = await db
        .select({ total: sql<string>`coalesce(sum(${companyExpensesTable.amount}), 0)` })
        .from(companyExpensesTable)
        .where(eq(companyExpensesTable.supplierId, s.id));

      const [paymentsTotal] = await db
        .select({ total: sql<string>`coalesce(sum(${supplierPaymentsTable.amount}), 0)` })
        .from(supplierPaymentsTable)
        .where(eq(supplierPaymentsTable.supplierId, s.id));

      const ob = parseFloat(s.openingBalance ?? "0");
      const charged = parseFloat(tripTotal.total) + parseFloat(companyTotal.total);
      const paid = parseFloat(paymentsTotal.total);
      const balance = ob + charged - paid;

      return { ...s, charged, paid, balance };
    }));

    res.json(results);
  } catch (e) { next(e); }
});

// POST /api/suppliers — create supplier
router.post("/", async (req, res, next) => {
  try {
    const [supplier] = await db.insert(suppliersTable).values(req.body).returning();
    await logAudit(req, {
      action: "create",
      entity: "supplier",
      entityId: supplier.id,
      description: `Supplier created: ${supplier.name}`,
      metadata: { type: supplier.type },
    });
    const ob = parseFloat(supplier.openingBalance ?? "0");
    if (ob !== 0) {
      await postOrUpdateOpeningBalance("supplier_ob", supplier.id, ob, "3000", "2050", `Opening balance — ${supplier.name}`);
    }
    res.status(201).json(supplier);
  } catch (e) { next(e); }
});

// PUT /api/suppliers/:id — update supplier
router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
    const [supplier] = await db.update(suppliersTable).set(req.body).where(eq(suppliersTable.id, id)).returning();
    if (!supplier) return res.status(404).json({ error: "Not found" });
    const obBefore = parseFloat(before?.openingBalance ?? "0");
    const obAfter = parseFloat(supplier.openingBalance ?? "0");
    if (obBefore !== obAfter) {
      await postOrUpdateOpeningBalance("supplier_ob", id, obAfter, "3000", "2050", `Opening balance — ${supplier.name}`);
    }
    res.json(supplier);
  } catch (e) { next(e); }
});

// GET /api/suppliers/:id/statement — full statement: expenses + payments
router.get("/:id/statement", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
    if (!supplier) return res.status(404).json({ error: "Not found" });

    const tripExpenses = await db
      .select({
        id: tripExpensesTable.id,
        date: tripExpensesTable.expenseDate,
        description: tripExpensesTable.description,
        costType: tripExpensesTable.costType,
        amount: tripExpensesTable.amount,
      })
      .from(tripExpensesTable)
      .where(eq(tripExpensesTable.supplierId, id))
      .orderBy(desc(tripExpensesTable.expenseDate));

    const companyExpenses = await db
      .select({
        id: companyExpensesTable.id,
        date: companyExpensesTable.expenseDate,
        description: companyExpensesTable.description,
        category: companyExpensesTable.category,
        amount: companyExpensesTable.amount,
      })
      .from(companyExpensesTable)
      .where(eq(companyExpensesTable.supplierId, id))
      .orderBy(desc(companyExpensesTable.expenseDate));

    const payments = await db
      .select()
      .from(supplierPaymentsTable)
      .where(eq(supplierPaymentsTable.supplierId, id))
      .orderBy(desc(supplierPaymentsTable.paymentDate));

    const ob = parseFloat(supplier.openingBalance ?? "0");
    const charged =
      tripExpenses.reduce((s, e) => s + parseFloat(e.amount), 0) +
      companyExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const paid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const balance = ob + charged - paid;

    res.json({
      supplier,
      openingBalance: ob,
      charged,
      paid,
      balance,
      tripExpenses: tripExpenses.map((e) => ({ ...e, amount: parseFloat(e.amount), entryType: "expense" })),
      companyExpenses: companyExpenses.map((e) => ({ ...e, amount: parseFloat(e.amount), entryType: "expense" })),
      payments: payments.map((p) => ({ ...p, amount: parseFloat(p.amount), entryType: "payment" })),
    });
  } catch (e) { next(e); }
});

// POST /api/suppliers/:id/payments — record a payment to a supplier
router.post("/:id/payments", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const { amount, currency, paymentDate, reference, notes } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be > 0" });

    const [payment] = await db.insert(supplierPaymentsTable).values({
      supplierId: id,
      amount: amt.toFixed(2),
      currency: currency ?? "USD",
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      reference: reference ?? null,
      notes: notes ?? null,
    }).returning();

    // GL: Dr Supplier Payables (2050) / Cr Bank (1002)
    await postJournalEntry({
      description: `Payment to ${supplier.name}${reference ? ` — Ref: ${reference}` : ""}`,
      entryDate: new Date(payment.paymentDate),
      referenceType: "supplier_payment",
      referenceId: payment.id,
      lines: [
        { accountCode: "2050", debit: amt, description: `Clear payable — ${supplier.name}` },
        { accountCode: "1002", credit: amt, description: "Bank Account" },
      ],
    });

    await logAudit(req, {
      action: "create",
      entity: "supplier_payment",
      entityId: payment.id,
      description: `Payment of $${amt.toFixed(2)} made to ${supplier.name}${reference ? ` (ref: ${reference})` : ""}`,
      metadata: { supplierId: id, amount: amt },
    });

    res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
  } catch (e) { next(e); }
});

export default router;
