import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable, trucksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { postJournalEntry, deleteJournalEntriesForReference } from "../lib/glPosting";

const router = Router();

// ─── Depreciation helpers ─────────────────────────────────────────────────────

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function computeDepreciation(asset: {
  purchasePrice: string;
  salvageValue: string;
  usefulLifeYears: number;
  depreciationMethod: string;
  entryDate: string | null;
  entryAccumulatedDepreciation: string;
  remainingUsefulLifeMonths: number | null;
}) {
  const cost = parseFloat(asset.purchasePrice);
  const salvage = parseFloat(asset.salvageValue);
  const entryAccumDep = parseFloat(asset.entryAccumulatedDepreciation ?? "0");
  const now = new Date();

  // The "entry point" into the system — either explicit entryDate or derivable
  const entryDate = asset.entryDate ? new Date(asset.entryDate) : null;
  const monthsSinceEntry = entryDate ? Math.max(0, monthsBetween(entryDate, now)) : 0;

  // NBV at time of entry
  const nbvAtEntry = Math.max(salvage, cost - entryAccumDep);

  // Remaining life in months at time of entry
  const remainingMonthsAtEntry = asset.remainingUsefulLifeMonths ?? (asset.usefulLifeYears * 12);

  let monthlyDepreciation = 0;
  if (remainingMonthsAtEntry > 0 && nbvAtEntry > salvage) {
    if (asset.depreciationMethod === "declining_balance") {
      // Declining balance: annual rate = 1 - (salvage/cost)^(1/years), applied monthly
      const years = remainingMonthsAtEntry / 12;
      const annualRate = years > 0 && cost > salvage
        ? 1 - Math.pow(salvage > 0 ? salvage / nbvAtEntry : 0.05, 1 / years)
        : 0;
      monthlyDepreciation = (nbvAtEntry * annualRate) / 12;
    } else {
      // Straight-line: spread remaining NBV over remaining life
      monthlyDepreciation = (nbvAtEntry - salvage) / remainingMonthsAtEntry;
    }
  }

  // How many full months of depreciation have elapsed since entry
  const monthsDepreciated = Math.min(monthsSinceEntry, remainingMonthsAtEntry);
  const depSinceEntry = monthlyDepreciation * monthsDepreciated;
  const accumulatedDepreciation = parseFloat((entryAccumDep + depSinceEntry).toFixed(2));
  const netBookValue = parseFloat(Math.max(salvage, cost - accumulatedDepreciation).toFixed(2));
  const fullyDepreciated = netBookValue <= salvage;

  return {
    monthlyDepreciation: parseFloat(monthlyDepreciation.toFixed(2)),
    accumulatedDepreciation,
    netBookValue,
    monthsElapsed: monthsSinceEntry,
    remainingMonths: Math.max(0, remainingMonthsAtEntry - monthsSinceEntry),
    fullyDepreciated,
  };
}

// ─── Loan / installment helpers ───────────────────────────────────────────────

function computeLoan(asset: {
  financed: boolean;
  loanAmount: string | null;       // outstanding balance AT ENTRY
  installmentAmount: string | null;
  installmentsPaid: number;
}) {
  if (!asset.financed || !asset.loanAmount) {
    return { currentOutstanding: 0, remainingInstallments: 0, loanPaidPct: 100, loanFullyPaid: true };
  }
  const outstandingAtEntry = parseFloat(asset.loanAmount);
  const instAmt = asset.installmentAmount ? parseFloat(asset.installmentAmount) : 0;
  const paid = asset.installmentsPaid ?? 0;
  const paidSinceEntry = instAmt * paid;
  const currentOutstanding = parseFloat(Math.max(0, outstandingAtEntry - paidSinceEntry).toFixed(2));
  const remainingInstallments = instAmt > 0 ? Math.ceil(currentOutstanding / instAmt) : 0;
  const pct = outstandingAtEntry > 0 ? Math.min(100, (paidSinceEntry / outstandingAtEntry) * 100) : 100;
  return {
    currentOutstanding,
    remainingInstallments,
    loanPaidPct: parseFloat(pct.toFixed(1)),
    loanFullyPaid: currentOutstanding <= 0,
  };
}

function enrich(a: any) {
  return { ...a, ...computeDepreciation(a), ...computeLoan(a) };
}

// ─── GL posting ───────────────────────────────────────────────────────────────

/**
 * Post the asset acquisition journal entry.
 *
 * NEW purchase (no prior history — entryAccumulatedDepreciation = 0):
 *   DR 1500/1600 — full purchase price
 *   CR 1002 Bank — down payment (or full price if cash)
 *   CR 2300 Hire Purchase Payable — outstanding balance at entry (if financed)
 *
 * MIGRATION (asset already existed — entryAccumulatedDepreciation > 0):
 *   DR 1500/1600 — full purchase price
 *   CR 1501 Accum. Depreciation — accumulated depreciation to date
 *   CR 2300 Hire Purchase Payable — outstanding balance today (if financed)
 *   CR 3000 Opening Balance Equity — balancing figure (cash already paid out historically)
 */
async function postAssetAcquisition(asset: {
  id: number;
  name: string;
  purchasePrice: string;
  purchaseDate: string;
  truckId: number | null;
  financed: boolean;
  downPayment: string | null;
  loanAmount: string | null;
  entryAccumulatedDepreciation: string;
}) {
  const cost = parseFloat(asset.purchasePrice);
  const assetGlCode = asset.truckId ? "1500" : "1600"; // Trucks & Vehicles vs Other Fixed Assets
  const entryAccumDep = parseFloat(asset.entryAccumulatedDepreciation ?? "0");
  const outstanding = asset.financed && asset.loanAmount ? parseFloat(asset.loanAmount) : 0;
  const isMigration = entryAccumDep > 0;

  const entryDate = new Date(asset.purchaseDate);
  const refType = "asset_acquisition";
  const refId = asset.id;

  if (isMigration) {
    // Opening balance entry for migrating business
    const cashAlreadyPaid = cost - entryAccumDep - outstanding;
    const lines: any[] = [
      { accountCode: assetGlCode, debit: cost, description: asset.name },
    ];
    if (entryAccumDep > 0) {
      lines.push({ accountCode: "1501", credit: entryAccumDep, description: `Accum. dep — ${asset.name}` });
    }
    if (outstanding > 0) {
      lines.push({ accountCode: "2300", credit: outstanding, description: `Hire purchase payable — ${asset.name}` });
    }
    if (cashAlreadyPaid > 0.01) {
      lines.push({ accountCode: "3000", credit: cashAlreadyPaid, description: `Opening balance equity — ${asset.name}` });
    }
    await postJournalEntry({ description: `Asset migration: ${asset.name}`, entryDate, referenceType: refType, referenceId: refId, lines });
  } else {
    // Fresh purchase
    const downPay = asset.downPayment ? parseFloat(asset.downPayment) : (asset.financed ? 0 : cost);
    const lines: any[] = [
      { accountCode: assetGlCode, debit: cost, description: asset.name },
      { accountCode: "1002", credit: downPay, description: asset.financed ? `Down payment — ${asset.name}` : `Purchase — ${asset.name}` },
    ];
    if (outstanding > 0) {
      lines.push({ accountCode: "2300", credit: outstanding, description: `Hire purchase payable — ${asset.name}` });
    }
    await postJournalEntry({ description: `Asset purchase: ${asset.name}`, entryDate, referenceType: refType, referenceId: refId, lines });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

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
        depreciationMethod: assetsTable.depreciationMethod,
        entryDate: assetsTable.entryDate,
        entryAccumulatedDepreciation: assetsTable.entryAccumulatedDepreciation,
        remainingUsefulLifeMonths: assetsTable.remainingUsefulLifeMonths,
        financed: assetsTable.financed,
        lender: assetsTable.lender,
        downPayment: assetsTable.downPayment,
        loanAmount: assetsTable.loanAmount,
        installmentAmount: assetsTable.installmentAmount,
        installmentFrequency: assetsTable.installmentFrequency,
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
      depreciationMethod, entryDate, entryAccumulatedDepreciation, remainingUsefulLifeMonths,
      financed, lender, downPayment, loanAmount, installmentAmount, installmentFrequency,
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
        depreciationMethod: depreciationMethod ?? "straight_line",
        entryDate: entryDate ?? purchaseDate,
        entryAccumulatedDepreciation: entryAccumulatedDepreciation ? String(entryAccumulatedDepreciation) : "0",
        remainingUsefulLifeMonths: remainingUsefulLifeMonths ? parseInt(remainingUsefulLifeMonths) : null,
        financed: !!financed,
        lender: lender ?? null,
        downPayment: downPayment ? String(downPayment) : null,
        loanAmount: loanAmount ? String(loanAmount) : null,
        installmentAmount: installmentAmount ? String(installmentAmount) : null,
        installmentFrequency: installmentFrequency ?? null,
        installmentsPaid: 0,
      })
      .returning();

    // Post GL journal entry (fire and forget — never fails the main save)
    postAssetAcquisition({
      id: row.id,
      name: row.name,
      purchasePrice: row.purchasePrice,
      purchaseDate: row.purchaseDate,
      truckId: row.truckId,
      financed: row.financed,
      downPayment: row.downPayment,
      loanAmount: row.loanAmount,
      entryAccumulatedDepreciation: row.entryAccumulatedDepreciation,
    }).catch(() => {});

    res.status(201).json(enrich(row));
  } catch (err) { next(err); }
});

// POST /api/assets/:id/record-payment — record one installment payment
router.post("/:id/record-payment", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!current) return res.status(404).json({ error: "Not found" });

    const loanComputed = computeLoan(current);
    if (loanComputed.loanFullyPaid) {
      return res.status(400).json({ error: "Loan already fully paid" });
    }

    const newPaid = (current.installmentsPaid ?? 0) + 1;
    const instAmt = current.installmentAmount ? parseFloat(current.installmentAmount) : 0;

    const [row] = await db
      .update(assetsTable)
      .set({ installmentsPaid: newPaid })
      .where(eq(assetsTable.id, id))
      .returning();

    // GL: DR 2300 Hire Purchase Payable / CR 1002 Bank
    if (instAmt > 0) {
      postJournalEntry({
        description: `Installment payment — ${current.name} (#${newPaid})`,
        entryDate: new Date(),
        referenceType: `asset_payment_${id}`,
        referenceId: newPaid,
        lines: [
          { accountCode: "2300", debit: instAmt, description: current.lender ?? "Hire purchase payment" },
          { accountCode: "1002", credit: instAmt },
        ],
      }).catch(() => {});
    }

    res.json(enrich(row));
  } catch (err) { next(err); }
});

// POST /api/assets/:id/post-depreciation — post current month's depreciation to GL
router.post("/:id/post-depreciation", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!asset) return res.status(404).json({ error: "Not found" });

    const dep = computeDepreciation(asset);
    if (dep.fullyDepreciated || dep.monthlyDepreciation <= 0) {
      return res.status(400).json({ error: "Asset is fully depreciated" });
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const refType = `asset_depreciation_${id}`;

    await postJournalEntry({
      description: `Depreciation — ${asset.name} (${monthKey})`,
      entryDate: now,
      referenceType: refType,
      referenceId: parseInt(monthKey.replace("-", "")),
      lines: [
        { accountCode: "6100", debit: dep.monthlyDepreciation, description: asset.name },
        { accountCode: "1501", credit: dep.monthlyDepreciation, description: asset.name },
      ],
    });

    res.json({ ok: true, amount: dep.monthlyDepreciation, month: monthKey });
  } catch (err) { next(err); }
});

// POST /api/assets/post-depreciation-all — post depreciation for ALL assets this month
router.post("/post-depreciation-all", async (req, res, next) => {
  try {
    const assets = await db.select().from(assetsTable);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let posted = 0;
    let skipped = 0;

    for (const asset of assets) {
      const dep = computeDepreciation(asset);
      if (dep.fullyDepreciated || dep.monthlyDepreciation <= 0) { skipped++; continue; }
      const refType = `asset_depreciation_${asset.id}`;
      const refId = parseInt(monthKey.replace("-", ""));
      // postJournalEntry deduplicates by referenceType+referenceId so double-posting is safe
      await postJournalEntry({
        description: `Depreciation — ${asset.name} (${monthKey})`,
        entryDate: now,
        referenceType: refType,
        referenceId: refId,
        lines: [
          { accountCode: "6100", debit: dep.monthlyDepreciation, description: asset.name },
          { accountCode: "1501", credit: dep.monthlyDepreciation, description: asset.name },
        ],
      });
      posted++;
    }

    res.json({ ok: true, posted, skipped, month: monthKey });
  } catch (err) { next(err); }
});

// DELETE /api/assets/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await deleteJournalEntriesForReference("asset_acquisition", id);
    await db.delete(assetsTable).where(eq(assetsTable.id, id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
