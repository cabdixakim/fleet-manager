import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/me", async (req, res) => {
  const s = req.session as any;
  if (s.userId) {
    const [user] = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
    }).from(usersTable).where(eq(usersTable.id, s.userId));
    if (user && user.isActive) return res.json(user);
  }
  res.status(401).json({ error: "Not authenticated" });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logAudit(req, { action: "login_failed", entity: "auth", description: `Failed login attempt for ${email}`, metadata: { email } });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const s = req.session as any;
  s.userId = user.id;
  s.userName = user.name;
  s.userRole = user.role;

  req.session.save(async () => {
    await logAudit(req, { action: "login", entity: "auth", entityId: user.id, description: `${user.name} signed in`, metadata: { email: user.email, role: user.role } });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });
});

router.post("/logout", async (req, res) => {
  const s = req.session as any;
  const name = s.userName ?? "Unknown";
  const id = s.userId;
  await logAudit(req, { action: "logout", entity: "auth", entityId: id, description: `${name} signed out` });
  req.session.destroy(() => res.json({ success: true }));
});

export default router;
