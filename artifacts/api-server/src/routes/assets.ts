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

// GET /api/assets — all assets with depreciation computed
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
        createdAt: assetsTable.createdAt,
      })
      .from(assetsTable)
      .leftJoin(trucksTable, eq(assetsTable.truckId, trucksTable.id))
      .orderBy(desc(assetsTable.purchaseDate));

    const result = rows.map((a) => ({
      ...a,
      ...computeDepreciation(a as any),
    }));
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/assets/truck/:truckId — assets for one truck
router.get("/truck/:truckId", async (req, res, next) => {
  try {
    const truckId = parseInt(req.params.truckId);
    const rows = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.truckId, truckId))
      .orderBy(desc(assetsTable.purchaseDate));
    const result = rows.map((a) => ({ ...a, ...computeDepreciation(a as any) }));
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/assets
router.post("/", async (req, res, next) => {
  try {
    const { truckId, name, description, purchasePrice, purchaseDate, usefulLifeYears, salvageValue } = req.body;
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
      })
      .returning();
    res.status(201).json({ ...row, ...computeDepreciation(row as any) });
  } catch (err) { next(err); }
});

// PATCH /api/assets/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, purchasePrice, purchaseDate, usefulLifeYears, salvageValue, truckId } = req.body;
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
      })
      .where(eq(assetsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ ...row, ...computeDepreciation(row as any) });
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
