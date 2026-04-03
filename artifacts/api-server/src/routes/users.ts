import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, ne } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const PROTECTED_ROLES = ["owner", "system"];
const MANAGER_ROLES = ["owner", "admin", "system"];
const RESERVED_EMAILS = ["system@optima.internal"];

const router = Router();

async function getCallerRole(req: any): Promise<string | null> {
  const s = req.session as any;
  if (!s?.userId) return null;
  const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, s.userId));
  return u?.role ?? null;
}

router.get("/", async (req, res, next) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    }).from(usersTable)
      .where(ne(usersTable.role, "system"))
      .orderBy(usersTable.createdAt);
    res.json(users);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (!callerRole || !MANAGER_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: "Only owner, admin, or system can create users." });
    }
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password required" });
    if (RESERVED_EMAILS.includes(email?.toLowerCase())) {
      return res.status(400).json({ error: `The email address '${email}' is reserved for system use.` });
    }
    if (PROTECTED_ROLES.includes(role)) {
      return res.status(403).json({ error: `Cannot create a user with role '${role}'.` });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({
      name, email: email.toLowerCase(), passwordHash, role: role || "operations",
    }).returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isActive: usersTable.isActive, createdAt: usersTable.createdAt });
    await logAudit(req, {
      action: "create",
      entity: "user",
      entityId: user.id,
      description: `Created user ${user.name} (${user.role})`,
      metadata: { email: user.email, role: user.role, actorRole: callerRole },
    });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (!callerRole || !MANAGER_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: "Only owner, admin, or system can modify users." });
    }
    const id = parseInt(req.params.id);
    const { name, email, role, isActive, password } = req.body;
    const [before] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!before) return res.status(404).json({ error: "Not found" });

    if (PROTECTED_ROLES.includes(before.role)) {
      if (role && role !== before.role) {
        return res.status(403).json({ error: `Cannot change the role of a ${before.role} account.` });
      }
      if (isActive === false) {
        return res.status(403).json({ error: `Cannot deactivate a ${before.role} account.` });
      }
    }

    if (role && PROTECTED_ROLES.includes(role) && role !== before.role) {
      return res.status(403).json({ error: `Cannot assign role '${role}' to a user.` });
    }

    const update: any = {};
    if (name) update.name = name;
    if (email) update.email = email.toLowerCase();
    if (role && !PROTECTED_ROLES.includes(before.role)) update.role = role;
    if (isActive !== undefined && !PROTECTED_ROLES.includes(before.role)) update.isActive = isActive;
    if (password) update.passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isActive: usersTable.isActive });
    if (!user) return res.status(404).json({ error: "Not found" });
    const changes: any = {};
    if (name && name !== before.name) changes.name = { from: before.name, to: name };
    if (role && role !== before.role) changes.role = { from: before.role, to: role };
    if (isActive !== undefined && isActive !== before.isActive) changes.isActive = { from: before.isActive, to: isActive };
    if (password) changes.password = "changed";
    await logAudit(req, {
      action: "update",
      entity: "user",
      entityId: id,
      description: `Updated user ${user.name}`,
      metadata: { ...changes, actorRole: callerRole, targetRole: before.role },
    });
    res.json(user);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const callerRole = await getCallerRole(req);
    if (!callerRole || !MANAGER_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: "Only owner, admin, or system can delete users." });
    }
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "Not found" });
    if (PROTECTED_ROLES.includes(user.role)) {
      return res.status(403).json({ error: `Cannot delete a ${user.role} account.` });
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await logAudit(req, {
      action: "delete",
      entity: "user",
      entityId: id,
      description: `Deleted user ${user.name} (${user.role})`,
      metadata: { email: user.email, targetRole: user.role, actorRole: callerRole },
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
