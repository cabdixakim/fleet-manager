import { Router } from "express";
import { db } from "@workspace/db";
import { companyInsurancePoliciesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

const POLICY_TYPE_LABEL: Record<string, string> = {
  vehicle_fleet: "Fleet Vehicle Policy",
  cargo_transit:  "Cargo / Goods-in-Transit",
  third_party:    "Third-Party Liability",
};

router.get("/", async (_req, res, next) => {
  try {
    const policies = await db
      .select()
      .from(companyInsurancePoliciesTable)
      .orderBy(desc(companyInsurancePoliciesTable.createdAt));
    res.json(policies.map((p) => ({
      ...p,
      coverageAmount: p.coverageAmount ? parseFloat(p.coverageAmount) : null,
      premiumAmount:  p.premiumAmount  ? parseFloat(p.premiumAmount)  : null,
      perLoadLimit:   p.perLoadLimit   ? parseFloat(p.perLoadLimit)   : null,
      policyTypeLabel: POLICY_TYPE_LABEL[p.policyType] ?? p.policyType,
    })));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const [policy] = await db
      .insert(companyInsurancePoliciesTable)
      .values({ ...req.body, updatedAt: new Date() })
      .returning();
    await logAudit(req, {
      action: "create",
      entity: "company_insurance_policy",
      entityId: policy.id,
      description: `Created ${POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType} — ${policy.insurerName} / ${policy.policyNumber}`,
      metadata: { policyType: policy.policyType },
    });
    res.status(201).json({
      ...policy,
      coverageAmount: policy.coverageAmount ? parseFloat(policy.coverageAmount) : null,
      premiumAmount:  policy.premiumAmount  ? parseFloat(policy.premiumAmount)  : null,
      perLoadLimit:   policy.perLoadLimit   ? parseFloat(policy.perLoadLimit)   : null,
      policyTypeLabel: POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType,
    });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [policy] = await db
      .select()
      .from(companyInsurancePoliciesTable)
      .where(eq(companyInsurancePoliciesTable.id, id));
    if (!policy) return res.status(404).json({ error: "Not found" });
    res.json({
      ...policy,
      coverageAmount: policy.coverageAmount ? parseFloat(policy.coverageAmount) : null,
      premiumAmount:  policy.premiumAmount  ? parseFloat(policy.premiumAmount)  : null,
      perLoadLimit:   policy.perLoadLimit   ? parseFloat(policy.perLoadLimit)   : null,
      policyTypeLabel: POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType,
    });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [policy] = await db
      .update(companyInsurancePoliciesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companyInsurancePoliciesTable.id, id))
      .returning();
    if (!policy) return res.status(404).json({ error: "Not found" });
    await logAudit(req, {
      action: "update",
      entity: "company_insurance_policy",
      entityId: id,
      description: `Updated ${POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType} — ${policy.insurerName} / ${policy.policyNumber}`,
      metadata: { policyType: policy.policyType },
    });
    res.json({
      ...policy,
      coverageAmount: policy.coverageAmount ? parseFloat(policy.coverageAmount) : null,
      premiumAmount:  policy.premiumAmount  ? parseFloat(policy.premiumAmount)  : null,
      perLoadLimit:   policy.perLoadLimit   ? parseFloat(policy.perLoadLimit)   : null,
      policyTypeLabel: POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType,
    });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [policy] = await db
      .select()
      .from(companyInsurancePoliciesTable)
      .where(eq(companyInsurancePoliciesTable.id, id));
    if (!policy) return res.status(404).json({ error: "Not found" });
    await db.delete(companyInsurancePoliciesTable).where(eq(companyInsurancePoliciesTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "company_insurance_policy",
      entityId: id,
      description: `Deleted ${POLICY_TYPE_LABEL[policy.policyType] ?? policy.policyType} — ${policy.insurerName} / ${policy.policyNumber}`,
      metadata: {},
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
