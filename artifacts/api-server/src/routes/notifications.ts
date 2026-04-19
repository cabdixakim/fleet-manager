import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

const router = Router();

// GET /api/notifications — last 50 for current user
router.get("/", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// GET /api/notifications/unread-count
router.get("/unread-count", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const [row] = await db
      .select({ count: count() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
    res.json({ count: Number(row?.count ?? 0) });
  } catch (e) {
    res.status(500).json({ error: "Failed to count notifications" });
  }
});

// PUT /api/notifications/:id/read
router.put("/:id/read", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, parseInt(req.params.id)), eq(notificationsTable.userId, userId)));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark notification read" });
  }
});

// PUT /api/notifications/read-all
router.put("/read-all", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark all read" });
  }
});

export default router;
