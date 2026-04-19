import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable, trucksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function computeDepreciation(asset: {
  purchasePrice: string;
  salvageValue: string;
  usefulLifeYears: number;
  purchaseDate: string;
}) {
  const cost = parseFloat(asset.purchasePrice);
  const salvage = parseFloat(asset.salvageValue);
  const lifeMonths = asset.usefulLifeYears * 12;
  const monthlyDep = (cost - salvage) / lifeMonths;

  const start = new Date(asset.purchaseDate);
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
  const monthsDepreciated = Math.min(monthsElapsed, lifeMonths);
  const accumulated = monthlyDep * monthsDepreciated;
  const netBookValue = Math.max(salvage, cost - accumulated);

  return {
    monthlyDepreciation: parseFloat(monthlyDep.toFixed(2)),
    accumulatedDepreciation: parseFloat(accumulated.toFixed(2)),
    netBookValue: parseFloat(netBookValue.toFixed(2)),
    monthsElapsed,
    fullyDepreciated: monthsElapsed >= lifeMonths,
  };
}

function computeLoan(asset: {
  financed: boolean;
  loanAmount: string | null;
  installmentAmount: string | null;
  totalInstallments: number | null;
  installmentsPaid: number;
}) {
  if (!asset.financed || !asset.loanAmount) {
    return { outstandingBalance: 0, loanPaidPct: 100, loanFullyPaid: true };
  }
  const loan = parseFloat(asset.loanAmount);
  const instAmt = asset.installmentAmount ? parseFloat(asset.installmentAmount) : 0;
  const paid = asset.installmentsPaid ?? 0;
  const paidAmount = instAmt * paid;
  const outstanding = Math.max(0, loan - paidAmount);
  const pct = loan > 0 ? Math.min(100, (paidAmount / loan) * 100) : 100;
  return {
    outstandingBalance: parseFloat(outstanding.toFixed(2)),
    loanPaidPct: parseFloat(pct.toFixed(1)),
    loanFullyPaid: outstanding <= 0,
  };
}

function enrich(a: any) {
  return { ...a, ...computeDepreciation(a), ...computeLoan(a) };
}

// GET /api/assets
router.get("/", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: assetsTable.id,
        truckId: assetsTable.truckId,
        plateNumber: trucksTable.plateNumber,
        name: assetsTable.name,
        description: assetsTable.description,
        purchasePrice: assetsTable.purchasePrice,
        purchaseDate: assetsTable.purchaseDate,
        usefulLifeYears: assetsTable.usefulLifeYears,
        salvageValue: assetsTable.salvageValue,
        financed: assetsTable.financed,
        lender: assetsTable.lender,
        downPayment: assetsTable.downPayment,
        loanAmount: assetsTable.loanAmount,
        installmentAmount: assetsTable.installmentAmount,
        installmentFrequency: assetsTable.installmentFrequency,
        totalInstallments: assetsTable.totalInstallments,
        installmentsPaid: assetsTable.installmentsPaid,
        createdAt: assetsTable.createdAt,
      })
      .from(assetsTable)
      .leftJoin(trucksTable, eq(assetsTable.truckId, trucksTable.id))
      .orderBy(desc(assetsTable.purchaseDate));

    res.json(rows.map(enrich));
  } catch (err) { next(err); }
});

// GET /api/assets/truck/:truckId
router.get("/truck/:truckId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.truckId);
    const rows = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.truckId, truckId))
      .orderBy(desc(assetsTable.purchaseDate));
    res.json(rows.map(enrich));
  } catch (err) { next(err); }
});

// POST /api/assets
router.post("/", async (req, res, next) => {
  try {
    const {
      truckId, name, description, purchasePrice, purchaseDate, usefulLifeYears, salvageValue,
      financed, lender, downPayment, loanAmount, installmentAmount, installmentFrequency,
      totalInstallments, installmentsPaid,
    } = req.body;

    if (!name || !purchasePrice || !purchaseDate || !usefulLifeYears) {
      return res.status(400).json({ error: "name, purchasePrice, purchaseDate and usefulLifeYears are required" });
    }

    const [row] = await db
      .insert(assetsTable)
      .values({
        truckId: truckId ? parseInt(truckId) : null,
        name,
        description: description ?? null,
        purchasePrice: String(purchasePrice),
        purchaseDate,
        usefulLifeYears: parseInt(usefulLifeYears),
        salvageValue: salvageValue ? String(salvageValue) : "0",
        financed: !!financed,
        lender: lender ?? null,
        downPayment: downPayment ? String(downPayment) : null,
        loanAmount: loanAmount ? String(loanAmount) : null,
        installmentAmount: installmentAmount ? String(installmentAmount) : null,
        installmentFrequency: installmentFrequency ?? null,
        totalInstallments: totalInstallments ? parseInt(totalInstallments) : null,
        installmentsPaid: installmentsPaid ? parseInt(installmentsPaid) : 0,
      })
      .returning();
    res.status(201).json(enrich(row));
  } catch (err) { next(err); }
});

// PATCH /api/assets/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name, description, purchasePrice, purchaseDate, usefulLifeYears, salvageValue, truckId,
      financed, lender, downPayment, loanAmount, installmentAmount, installmentFrequency,
      totalInstallments, installmentsPaid,
    } = req.body;

    const [row] = await db
      .update(assetsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(purchasePrice !== undefined && { purchasePrice: String(purchasePrice) }),
        ...(purchaseDate !== undefined && { purchaseDate }),
        ...(usefulLifeYears !== undefined && { usefulLifeYears: parseInt(usefulLifeYears) }),
        ...(salvageValue !== undefined && { salvageValue: String(salvageValue) }),
        ...(truckId !== undefined && { truckId: truckId ? parseInt(truckId) : null }),
        ...(financed !== undefined && { financed: !!financed }),
        ...(lender !== undefined && { lender }),
        ...(downPayment !== undefined && { downPayment: downPayment ? String(downPayment) : null }),
        ...(loanAmount !== undefined && { loanAmount: loanAmount ? String(loanAmount) : null }),
        ...(installmentAmount !== undefined && { installmentAmount: installmentAmount ? String(installmentAmount) : null }),
        ...(installmentFrequency !== undefined && { installmentFrequency }),
        ...(totalInstallments !== undefined && { totalInstallments: totalInstallments ? parseInt(totalInstallments) : null }),
        ...(installmentsPaid !== undefined && { installmentsPaid: parseInt(installmentsPaid) }),
      })
      .where(eq(assetsTable.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(enrich(row));
  } catch (err) { next(err); }
});

// POST /api/assets/:id/record-payment — increment installmentsPaid by 1
router.post("/:id/record-payment", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!current) return res.status(404).json({ error: "Not found" });

    const newPaid = (current.installmentsPaid ?? 0) + 1;
    const [row] = await db
      .update(assetsTable)
      .set({ installmentsPaid: newPaid })
      .where(eq(assetsTable.id, id))
      .returning();

    res.json(enrich(row));
  } catch (err) { next(err); }
});

// DELETE /api/assets/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.delete(assetsTable).where(eq(assetsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
