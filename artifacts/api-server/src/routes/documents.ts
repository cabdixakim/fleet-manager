import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, trucksTable, driversTable } from "@workspace/db/schema";
import { eq, and, lte, gte, inArray, desc, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

// Only truck and driver docs are enriched with entity names.
// Company docs (entityId = null) just show "Company".
async function enrichWithEntityNames(docs: any[]) {
  if (docs.length === 0) return docs;
  const truckIds = docs.filter((d) => d.entityType === "truck" && d.entityId).map((d) => d.entityId);
  const driverIds = docs.filter((d) => d.entityType === "driver" && d.entityId).map((d) => d.entityId);
  const truckMap: Record<number, string> = {};
  const driverMap: Record<number, string> = {};
  if (truckIds.length > 0) {
    const rows = await db.select({ id: trucksTable.id, plateNumber: trucksTable.plateNumber }).from(trucksTable).where(inArray(trucksTable.id, truckIds));
    rows.forEach((r) => { truckMap[r.id] = r.plateNumber; });
  }
  if (driverIds.length > 0) {
    const rows = await db.select({ id: driversTable.id, name: driversTable.name }).from(driversTable).where(inArray(driversTable.id, driverIds));
    rows.forEach((r) => { driverMap[r.id] = r.name; });
  }
  return docs.map((d) => ({
    ...d,
    entityName:
      d.entityType === "truck"    ? (truckMap[d.entityId] ?? null) :
      d.entityType === "driver"   ? (driverMap[d.entityId] ?? null) :
      d.entityType === "company"  ? "Company" : null,
  }));
}

async function tryDeleteStorageFile(fileUrl: string | null) {
  if (!fileUrl) return;
  try {
    const svc = new ObjectStorageService();
    const file = await svc.getObjectEntityFile(fileUrl);
    await file.delete();
  } catch (e) {
    if (!(e instanceof ObjectNotFoundError)) {
      console.warn("[documents] Could not delete storage file:", fileUrl, e);
    }
  }
}

const VAULT_ENTITY_TYPES = ["truck", "driver", "company"];

const router = Router();

// GET /api/documents?entityType=truck&entityId=1
// The vault only returns truck / driver / company docs — never trip or batch.
router.get("/", async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    const conditions: any[] = [];
    if (entityType) {
      conditions.push(eq(documentsTable.entityType, entityType as string));
    } else {
      conditions.push(inArray(documentsTable.entityType, VAULT_ENTITY_TYPES));
    }
    if (entityId) conditions.push(eq(documentsTable.entityId, parseInt(entityId as string)));
    const docs = await db
      .select()
      .from(documentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documentsTable.createdAt));
    res.json(await enrichWithEntityNames(docs));
  } catch (e) { next(e); }
});

// GET /api/documents/expiring — truck/driver/company docs expiring within N days (default 45)
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
          inArray(documentsTable.entityType, VAULT_ENTITY_TYPES),
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
      .where(
        and(
          inArray(documentsTable.entityType, VAULT_ENTITY_TYPES),
          lte(documentsTable.expiryDate, today),
        )
      )
      .orderBy(documentsTable.expiryDate);
    res.json(await enrichWithEntityNames(docs));
  } catch (e) { next(e); }
});

// POST /api/documents
router.post("/", async (req, res, next) => {
  try {
    const { entityType, entityId, docType, docLabel, issueDate, expiryDate, fileUrl, fileName, notes } = req.body;
    if (!entityType || !docType || !docLabel) {
      return res.status(400).json({ error: "entityType, docType, and docLabel are required" });
    }
    if (entityType !== "company" && !entityId) {
      return res.status(400).json({ error: "entityId is required for truck and driver documents" });
    }
    const [doc] = await db.insert(documentsTable).values({
      entityType,
      entityId: entityType === "company" ? null : parseInt(entityId),
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
      description: `Document added: ${docLabel} for ${entityType}${entityId ? ` #${entityId}` : ""}`,
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// PUT /api/documents/:id
router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { docLabel, issueDate, expiryDate, fileUrl, fileName, notes } = req.body;
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (fileUrl && existing.fileUrl && fileUrl !== existing.fileUrl) {
      await tryDeleteStorageFile(existing.fileUrl);
    }
    const [doc] = await db
      .update(documentsTable)
      .set({
        docLabel,
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
        fileUrl: fileUrl !== undefined ? (fileUrl || null) : existing.fileUrl,
        fileName: fileName !== undefined ? (fileName || null) : existing.fileName,
        notes: notes !== undefined ? (notes || null) : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, id))
      .returning();
    if (!doc) return res.status(404).json({ error: "Not found" });
    await logAudit(req, { action: "update", entity: "document", entityId: id, description: `Document updated: ${docLabel}` });
    res.json(doc);
  } catch (e) { next(e); }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    await logAudit(req, { action: "delete", entity: "document", entityId: id, description: `Document deleted #${id}` });
    if (doc?.fileUrl) await tryDeleteStorageFile(doc.fileUrl);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
