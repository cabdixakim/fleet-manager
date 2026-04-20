import { Router } from "express";
import { db } from "@workspace/db";
import { lanesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const lanes = await db
      .select()
      .from(lanesTable)
      .where(eq(lanesTable.isActive, true))
      .orderBy(asc(lanesTable.sortOrder), asc(lanesTable.label));
    res.json(lanes);
  } catch (e) { next(e); }
});

router.get("/all", async (_req, res, next) => {
  try {
    const lanes = await db
      .select()
      .from(lanesTable)
      .orderBy(asc(lanesTable.sortOrder), asc(lanesTable.label));
    res.json(lanes);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { label, short, chart, sortOrder } = req.body;
    if (!label?.trim() || !short?.trim() || !chart?.trim()) {
      return res.status(400).json({ error: "label, short and chart are required" });
    }
    const value = label.trim()
      .toLowerCase()
      .replace(/\s*[→\->]+\s*/g, "_to_")
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const existing = await db.select().from(lanesTable).where(eq(lanesTable.value, value));
    if (existing.length > 0) {
      return res.status(409).json({ error: "A route with this name already exists." });
    }
    const [lane] = await db.insert(lanesTable).values({
      value,
      label: label.trim(),
      short: short.trim(),
      chart: chart.trim(),
      sortOrder: sortOrder ?? 0,
      isActive: true,
    }).returning();
    res.status(201).json(lane);
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { label, short, chart, sortOrder, isActive } = req.body;
    const update: Partial<typeof lanesTable.$inferInsert> = {};
    if (label !== undefined) update.label = label;
    if (short !== undefined) update.short = short;
    if (chart !== undefined) update.chart = chart;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;
    if (isActive !== undefined) update.isActive = isActive;
    const [lane] = await db.update(lanesTable).set(update).where(eq(lanesTable.id, id)).returning();
    if (!lane) return res.status(404).json({ error: "Route not found" });
    res.json(lane);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(lanesTable).set({ isActive: false }).where(eq(lanesTable.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
