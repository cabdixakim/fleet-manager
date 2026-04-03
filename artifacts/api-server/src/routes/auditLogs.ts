import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { desc, and, eq, gte, lte, sql, ilike, or } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { entity, action, userId, from, to, search, limit = "50", offset = "0" } = req.query;

    const conditions: any[] = [];
    if (entity) conditions.push(eq(auditLogsTable.entity, entity as string));
    if (action) conditions.push(eq(auditLogsTable.action, action as string));
    if (userId) conditions.push(eq(auditLogsTable.userId, parseInt(userId as string)));
    if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from as string)));
    if (to) {
      // Include all events up to the end of the "to" day
      const toDate = new Date(to as string);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogsTable.createdAt, toDate));
    }
    if (search) {
      const q = `%${(search as string).toLowerCase()}%`;
      conditions.push(
        or(
          ilike(auditLogsTable.description, q),
          ilike(auditLogsTable.userName, q),
          ilike(auditLogsTable.entity, q),
          ilike(auditLogsTable.entityId, q),
        ),
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(auditLogsTable)
      .where(where);

    const logs = await db
      .select()
      .from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({ logs, total: Number(total) });
  } catch (e) { next(e); }
});

export default router;
