import { Router } from "express";
import { db } from "@workspace/db";
import {
  insuranceClaimsTable,
  trucksTable,
  tripsTable,
  companyInsurancePoliciesTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

function parse(claim: typeof insuranceClaimsTable.$inferSelect & {
  plateNumber?: string | null;
  policyType?: string | null;
  policyTypeLabel?: string | null;
  policyInsurerName?: string | null;
  policyNumber_?: string | null;
}) {
  return {
    ...claim,
    amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed as unknown as string) : null,
    amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled as unknown as string) : null,
  };
}

const POLICY_TYPE_LABEL: Record<string, string> = {
  vehicle_fleet: "Fleet Vehicle Policy",
  cargo_transit:  "Cargo / Goods-in-Transit",
  third_party:    "Third-Party Liability",
};

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        claim: insuranceClaimsTable,
        plateNumber: trucksTable.plateNumber,
        linkedPolicyType: companyInsurancePoliciesTable.policyType,
        linkedPolicyInsurer: companyInsurancePoliciesTable.insurerName,
        linkedPolicyNumber: companyInsurancePoliciesTable.policyNumber,
      })
      .from(insuranceClaimsTable)
      .leftJoin(trucksTable, eq(insuranceClaimsTable.truckId, trucksTable.id))
      .leftJoin(companyInsurancePoliciesTable, eq(insuranceClaimsTable.companyPolicyId, companyInsurancePoliciesTable.id))
      .orderBy(desc(insuranceClaimsTable.createdAt));

    res.json(rows.map(({ claim, plateNumber, linkedPolicyType, linkedPolicyInsurer, linkedPolicyNumber }) => ({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed as unknown as string) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled as unknown as string) : null,
      plateNumber,
      linkedPolicyType,
      linkedPolicyTypeLabel: linkedPolicyType ? (POLICY_TYPE_LABEL[linkedPolicyType] ?? linkedPolicyType) : null,
      linkedPolicyInsurer,
      linkedPolicyNumber,
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
      metadata: { claimType: claim.claimType, status: claim.status, companyPolicyId: claim.companyPolicyId },
    });
    res.status(201).json({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed as unknown as string) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled as unknown as string) : null,
    });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({
        claim: insuranceClaimsTable,
        plateNumber: trucksTable.plateNumber,
        linkedPolicyType: companyInsurancePoliciesTable.policyType,
        linkedPolicyInsurer: companyInsurancePoliciesTable.insurerName,
        linkedPolicyNumber: companyInsurancePoliciesTable.policyNumber,
      })
      .from(insuranceClaimsTable)
      .leftJoin(trucksTable, eq(insuranceClaimsTable.truckId, trucksTable.id))
      .leftJoin(companyInsurancePoliciesTable, eq(insuranceClaimsTable.companyPolicyId, companyInsurancePoliciesTable.id))
      .where(eq(insuranceClaimsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row.claim,
      amountClaimed: row.claim.amountClaimed ? parseFloat(row.claim.amountClaimed as unknown as string) : null,
      amountSettled: row.claim.amountSettled ? parseFloat(row.claim.amountSettled as unknown as string) : null,
      plateNumber: row.plateNumber,
      linkedPolicyType: row.linkedPolicyType,
      linkedPolicyTypeLabel: row.linkedPolicyType ? (POLICY_TYPE_LABEL[row.linkedPolicyType] ?? row.linkedPolicyType) : null,
      linkedPolicyInsurer: row.linkedPolicyInsurer,
      linkedPolicyNumber: row.linkedPolicyNumber,
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
      metadata: { status: claim.status, companyPolicyId: claim.companyPolicyId },
    });
    res.json({
      ...claim,
      amountClaimed: claim.amountClaimed ? parseFloat(claim.amountClaimed as unknown as string) : null,
      amountSettled: claim.amountSettled ? parseFloat(claim.amountSettled as unknown as string) : null,
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
