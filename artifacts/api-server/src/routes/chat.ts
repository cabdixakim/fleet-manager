import { Router } from "express";
import { db } from "@workspace/db";
import { chatChannelsTable, chatMessagesTable, usersTable, tripsTable } from "@workspace/db/schema";
import { eq, desc, and, lt, sql } from "drizzle-orm";

const router = Router();

// Channel → which roles may access it (undefined = all roles)
const CHANNEL_ROLES: Record<string, string[]> = {
  general:    ["owner", "admin", "manager", "accounts", "operations"],
  operations: ["owner", "admin", "manager", "operations"],
  accounts:   ["owner", "admin", "manager", "accounts"],
};

// ── Ensure default team channels exist ──────────────────────────────────────
async function ensureDefaultChannels() {
  const defaults = [
    { name: "General",    slug: "general",    type: "team" },
    { name: "Operations", slug: "operations", type: "team" },
    { name: "Accounts",   slug: "accounts",   type: "team" },
  ];
  for (const ch of defaults) {
    const existing = await db
      .select({ id: chatChannelsTable.id })
      .from(chatChannelsTable)
      .where(eq(chatChannelsTable.slug, ch.slug))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(chatChannelsTable).values(ch);
    }
  }
}
ensureDefaultChannels().catch(console.error);

// ── Auto-delete messages older than 7 days ───────────────────────────────────
async function purgeOldMessages() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(chatMessagesTable).where(lt(chatMessagesTable.createdAt, cutoff));
}
purgeOldMessages().catch(console.error);
// Run cleanup every hour
setInterval(() => purgeOldMessages().catch(console.error), 60 * 60 * 1000);

// ── Helper: get current user's role ─────────────────────────────────────────
async function getUserRole(req: any): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return u?.role ?? null;
}

// ── GET /api/chat/channels ───────────────────────────────────────────────────
router.get("/channels", async (req, res, next) => {
  try {
    const role = await getUserRole(req);
    if (!role) return res.status(401).json({ error: "Not authenticated" });

    const all = await db
      .select()
      .from(chatChannelsTable)
      .orderBy(chatChannelsTable.type, chatChannelsTable.name);

    // Filter team channels by role; trip channels are open to all
    const visible = all.filter((ch) => {
      if (ch.type !== "team") return true;
      const allowed = CHANNEL_ROLES[ch.slug];
      if (!allowed) return true;
      return allowed.includes(role);
    });

    res.json(visible);
  } catch (e) { next(e); }
});

// ── GET /api/chat/channels/trip/:tripId — get or create trip channel ─────────
router.get("/channels/trip/:tripId", async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.tripId);
    const existing = await db
      .select()
      .from(chatChannelsTable)
      .where(and(eq(chatChannelsTable.type, "trip"), eq(chatChannelsTable.tripId, tripId)))
      .limit(1);
    if (existing.length > 0) return res.json(existing[0]);

    // Auto-create channel for this trip
    const trip = await db.select({ loadRef: tripsTable.loadRef }).from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
    const name = trip[0]?.loadRef ? `Trip: ${trip[0].loadRef}` : `Trip #${tripId}`;
    const [channel] = await db.insert(chatChannelsTable).values({
      name,
      slug: `trip-${tripId}`,
      type: "trip",
      tripId,
    }).returning();
    res.json(channel);
  } catch (e) { next(e); }
});

// ── GET /api/chat/channels/:id/messages ─────────────────────────────────────
router.get("/channels/:id/messages", async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 100;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        body: chatMessagesTable.body,
        createdAt: chatMessagesTable.createdAt,
        userId: chatMessagesTable.userId,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.userId, usersTable.id))
      .where(and(
        eq(chatMessagesTable.channelId, channelId),
        sql`${chatMessagesTable.createdAt} >= ${cutoff}`,
      ))
      .orderBy(chatMessagesTable.createdAt)
      .limit(limit);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── POST /api/chat/channels/:id/messages ────────────────────────────────────
router.post("/channels/:id/messages", async (req, res, next) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "Message body is required" });

    const [msg] = await db.insert(chatMessagesTable).values({
      channelId,
      userId,
      body: body.trim(),
    }).returning();

    // Fetch with user info to return
    const [full] = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        body: chatMessagesTable.body,
        createdAt: chatMessagesTable.createdAt,
        userId: chatMessagesTable.userId,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.userId, usersTable.id))
      .where(eq(chatMessagesTable.id, msg.id));

    res.status(201).json(full);
  } catch (e) { next(e); }
});

// ── DELETE /api/chat/messages/:id — disabled ─────────────────────────────────
router.delete("/messages/:id", (_req, res) => {
  res.status(403).json({ error: "Message deletion is disabled. Messages are removed automatically after 7 days." });
});

export default router;
