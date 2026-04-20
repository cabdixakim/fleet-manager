import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, trucksTable, driversTable, tripsTable, batchesTable } from "@workspace/db/schema";
import { eq, and, lte, gte, inArray, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";

async function enrichWithEntityNames(docs: any[]) {
  if (docs.length === 0) return docs;
  const truckIds = docs.filter((d) => d.entityType === "truck").map((d) => d.entityId);
  const driverIds = docs.filter((d) => d.entityType === "driver").map((d) => d.entityId);
  const tripIds = docs.filter((d) => d.entityType === "trip").map((d) => d.entityId);
  const batchIds = docs.filter((d) => d.entityType === "batch").map((d) => d.entityId);
  const truckMap: Record<number, string> = {};
  const driverMap: Record<number, string> = {};
  const tripMap: Record<number, string> = {};
  const batchMap: Record<number, string> = {};
  if (truckIds.length > 0) {
    const rows = await db.select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber }).from(trucksTable).where(inArray(trucksTable.id, truckIds));
    rows.forEach((r) => { truckMap[r.id] = r.plateNumber; });
  }
  if (driverIds.length > 0) {
    const rows = await db.select({ id: driversTable.id, name: driversTable.name }).from(driversTable).where(inArray(driversTable.id, driverIds));
    rows.forEach((r) => { driverMap[r.id] = r.name; });
  }
  if (tripIds.length > 0) {
    const rows = await db.select({ id: tripsTable.id, product: tripsTable.product, createdAt: tripsTable.createdAt }).from(tripsTable).where(inArray(tripsTable.id, tripIds));
    rows.forEach((r) => { tripMap[r.id] = `Trip #${r.id} — ${r.product ?? ""}`.trim(); });
  }
  if (batchIds.length > 0) {
    const rows = await db.select({ id: batchesTable.id, name: batchesTable.name }).from(batchesTable).where(inArray(batchesTable.id, batchIds));
    rows.forEach((r) => { batchMap[r.id] = r.name ?? `Batch #${r.id}`; });
  }
  return docs.map((d) => ({
    ...d,
    entityName:
      d.entityType === "truck"    ? (truckMap[d.entityId] ?? null) :
      d.entityType === "driver"   ? (driverMap[d.entityId] ?? null) :
      d.entityType === "trip"     ? (tripMap[d.entityId] ?? null) :
      d.entityType === "batch"    ? (batchMap[d.entityId] ?? null) :
      d.entityType === "general"  ? "General" : null,
  }));
}

const router = Router();

// GET /api/documents?entityType=truck&entityId=1
router.get("/", async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    const conditions = [];
    if (entityType) conditions.push(eq(documentsTable.entityType, entityType as string));
    if (entityId)   conditions.push(eq(documentsTable.entityId, parseInt(entityId as string)));
    const docs = await db
      .select()
      .from(documentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documentsTable.createdAt));
    res.json(await enrichWithEntityNames(docs));
  } catch (e) { next(e); }
});

// GET /api/documents/expiring — docs expiring within N days (default 45)
router.get("/expiring", async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 45;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
    const docs = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          lte(documentsTable.expiryDate, future),
          gte(documentsTable.expiryDate, today),
        )
      )
      .orderBy(documentsTable.expiryDate);
    res.json(await enrichWithEntityNames(docs));
  } catch (e) { next(e); }
});

// GET /api/documents/expired
router.get("/expired", async (req, res, next) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const docs = await db
      .select()
      .from(documentsTable)
      .where(lte(documentsTable.expiryDate, today))
      .orderBy(documentsTable.expiryDate);
    res.json(await enrichWithEntityNames(docs));
  } catch (e) { next(e); }
});

// POST /api/documents
router.post("/", async (req, res, next) => {
  try {
    const { entityType, entityId, docType, docLabel, issueDate, expiryDate, fileUrl, fileName, notes } = req.body;
    if (!entityType || !entityId || !docType || !docLabel) {
      return res.status(400).json({ error: "entityType, entityId, docType, and docLabel are required" });
    }
    const [doc] = await db.insert(documentsTable).values({
      entityType,
      entityId: parseInt(entityId),
      docType,
      docLabel,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      notes: notes || null,
    }).returning();
    await logAudit(req, {
      action: "create",
      entity: "document",
      entityId: doc.id,
      description: `Document added: ${docLabel} for ${entityType} #${entityId}`,
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// PUT /api/documents/:id
router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { docLabel, issueDate, expiryDate, fileUrl, fileName, notes } = req.body;
    const [doc] = await db
      .update(documentsTable)
      .set({ docLabel, issueDate: issueDate || null, expiryDate: expiryDate || null, fileUrl: fileUrl || null, fileName: fileName || null, notes: notes || null, updatedAt: new Date() })
      .where(eq(documentsTable.id, id))
      .returning();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) { next(e); }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    await logAudit(req, { action: "delete", entity: "document", entityId: id, description: `Document deleted #${id}` });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
