import { Router } from "express";
import { db } from "@workspace/db";
import { insuranceClaimsTable, trucksTable, tripsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const rows = await db
      .select({
        claim: insuranceClaimsTable,
        plateNumber: trucksTable.plateNumber,
      })
      .from(insuranceClaimsTable)
      .leftJoin(trucksTable, eq(insuranceClaimsTable.truckId, trucksTable.id))
      .orderBy(desc(insuranceClaimsTable.createdAt));

    res.json(rows.map(({ claim, plateNumber }) => ({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled) : null,
      plateNumber,
    })));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [claim] = await db.insert(insuranceClaimsTable).values({
      ...req.body,
      updatedAt: new Date(),
    }).returning();
    await logAudit(req, {
      action: "create", entity: "insurance_claim", entityId: claim.id,
      description: `Created ${claim.claimType} claim — ${claim.insurerName ?? "no insurer"}`,
      metadata: { claimType: claim.claimType, status: claim.status },
    });
    res.status(201).json({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled) : null,
    });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({ claim: insuranceClaimsTable, plateNumber: trucksTable.plateNumber })
      .from(insuranceClaimsTable)
      .leftJoin(trucksTable, eq(insuranceClaimsTable.truckId, trucksTable.id))
      .where(eq(insuranceClaimsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row.claim,
      amountClaimed: row.claim.amountClaimed ? parseFloat(row.claim.amountClaimed) : null,
      amountSettled: row.claim.amountSettled ? parseFloat(row.claim.amountSettled) : null,
      plateNumber: row.plateNumber,
    });
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [claim] = await db.update(insuranceClaimsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(insuranceClaimsTable.id, id))
      .returning();
    if (!claim) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update", entity: "insurance_claim", entityId: id,
      description: `Updated claim #${id} — status: ${claim.status}`,
      metadata: { status: claim.status },
    });
    res.json({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled) : null,
    });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(insuranceClaimsTable).where(eq(insuranceClaimsTable.id, id));
    await logAudit(req, { action: "delete", entity: "insurance_claim", entityId: id, description: `Deleted claim #${id}`, metadata: {} });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
