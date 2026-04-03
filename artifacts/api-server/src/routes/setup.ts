import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, companySettingsTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";
import { randomBytes } from "crypto";

const router = Router();

const SYSTEM_EMAIL = "system@optima.internal";

function generateSystemPassword(): string {
  return randomBytes(16).toString("base64url").slice(0, 20);
}

router.get("/status", async (req, res, next) => {
  try {
    const [{ value }] = await db.select({ value: count() }).from(usersTable);
    res.json({ needsSetup: value === 0 });
  } catch (e) { next(e); }
});

router.post("/complete", async (req, res, next) => {
  try {
    const [{ value }] = await db.select({ value: count() }).from(usersTable);
    if (value > 0) return res.status(403).json({ error: "System is already set up" });

    const { company, admin } = req.body;
    if (!company?.name || !admin?.name || !admin?.email || !admin?.password) {
      return res.status(400).json({ error: "Company name, owner name, email and password are required" });
    }

    if (admin.email.toLowerCase() === SYSTEM_EMAIL) {
      return res.status(400).json({ error: `The email address '${SYSTEM_EMAIL}' is reserved for system use. Please use a different email.` });
    }

    const ownerPasswordHash = await bcrypt.hash(admin.password, 12);
    const systemPassword = generateSystemPassword();
    const systemPasswordHash = await bcrypt.hash(systemPassword, 12);

    await db.transaction(async (tx) => {
      await tx.insert(companySettingsTable).values({
        name: company.name,
        address: company.address ?? null,
        email: company.email ?? null,
        phone: company.phone ?? null,
        currency: company.currency ?? "USD",
        taxId: company.taxId ?? null,
        website: company.website ?? null,
        logoUrl: company.logoUrl ?? null,
      }).onConflictDoUpdate({
        target: companySettingsTable.id,
        set: {
          name: company.name,
          address: company.address ?? null,
          email: company.email ?? null,
          phone: company.phone ?? null,
          currency: company.currency ?? "USD",
        },
      });

      await tx.insert(usersTable).values({
        name: admin.name,
        email: admin.email.toLowerCase(),
        passwordHash: ownerPasswordHash,
        role: "owner",
        isActive: true,
      });

      await tx.insert(usersTable).values({
        name: "System",
        email: SYSTEM_EMAIL,
        passwordHash: systemPasswordHash,
        role: "system",
        isActive: true,
      });
    });

    res.json({ success: true, systemPassword });
  } catch (e) { next(e); }
});

export default router;
