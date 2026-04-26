import { Router } from "express";
import { db } from "@workspace/db";
import { companySettingsTable } from "@workspace/db/schema";
import { logAudit } from "../lib/audit";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const [settings] = await db.select().from(companySettingsTable).limit(1);
    if (!settings) {
      const [created] = await db.insert(companySettingsTable).values({}).returning();
      return res.json(created);
    }
    res.json(settings);
  } catch (e) { next(e); }
});

router.put("/", async (req, res, next) => {
  try {
    const existing = await db.select().from(companySettingsTable).limit(1);
    console.log("[DEBUG] PUT /api/company-settings req.body:", req.body);
    if (existing.length === 0) {
      const [created] = await db.insert(companySettingsTable).values({
        ...req.body,
        updatedAt: new Date(),
      }).returning();
      console.log("[DEBUG] Created new company settings:", created);
      return res.json(created);
    }
    const prev = existing[0];
    const changedFields = Object.keys(req.body).filter((key) => {
      if (key === "updatedAt" || key === "id") return false;
      return String((prev as any)[key] ?? "") !== String(req.body[key] ?? "");
    });
    const [updated] = await db.update(companySettingsTable)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(companySettingsTable.id, existing[0].id))
      .returning();
    console.log("[DEBUG] Updated company settings:", updated);
    await logAudit(req, {
      action: "update",
      entity: "settings",
      description: changedFields.length > 0
        ? `Updated company settings — changed: ${changedFields.join(", ")}`
        : `Saved company settings (no changes)`,
      metadata: changedFields.length > 0 ? { fields: changedFields } : {},
    });
    res.json(updated);
  } catch (e) {
    console.error("[ERROR] PUT /api/company-settings:", e);
    next(e);
  }
});

export default router;
