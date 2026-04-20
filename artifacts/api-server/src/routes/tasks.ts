import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, notificationsTable, usersTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const RECORD_LABELS: Record<string, string> = {
  trip: "Trip",
  invoice: "Invoice",
  clearance: "Clearance",
  expense: "Expense",
  batch: "Batch",
  supplier: "Supplier",
};

// GET /api/tasks/mine — all tasks assigned to the current user
router.get("/mine", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tasks = await db
      .select({
        id: tasksTable.id,
        note: tasksTable.note,
        status: tasksTable.status,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
        createdAt: tasksTable.createdAt,
        completedAt: tasksTable.completedAt,
        recordType: tasksTable.recordType,
        recordId: tasksTable.recordId,
        assignedBy: { id: usersTable.id, name: usersTable.name, role: usersTable.role },
      })
      .from(tasksTable)
      .innerJoin(usersTable, eq(tasksTable.assignedBy, usersTable.id))
      .where(eq(tasksTable.assignedTo, userId))
      .orderBy(desc(tasksTable.createdAt));

    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// GET /api/tasks/record/:type/:id — tasks for a specific record
router.get("/record/:type/:id", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { type, id } = req.params;
    const tasks = await db
      .select({
        id: tasksTable.id,
        note: tasksTable.note,
        status: tasksTable.status,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
        createdAt: tasksTable.createdAt,
        completedAt: tasksTable.completedAt,
        assignedBy: { id: usersTable.id, name: usersTable.name, role: usersTable.role },
      })
      .from(tasksTable)
      .innerJoin(usersTable, eq(tasksTable.assignedBy, usersTable.id))
      .where(and(eq(tasksTable.recordType, type), eq(tasksTable.recordId, parseInt(id))))
      .orderBy(desc(tasksTable.createdAt));

    const tasksWithAssignees = await Promise.all(
      tasks.map(async (t) => {
        const fullTask = await db.select().from(tasksTable).where(eq(tasksTable.id, t.id)).then(r => r[0]);
        const assignee = await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
          .from(usersTable).where(eq(usersTable.id, fullTask.assignedTo)).then(r => r[0]);
        return { ...t, assignedTo: assignee };
      })
    );

    res.json(tasksWithAssignees);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// POST /api/tasks — create a task and notify assignee
router.post("/", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { recordType, recordId, assignedTo, note, recordLabel, priority, dueDate } = req.body;
  if (!assignedTo || !note?.trim()) return res.status(400).json({ error: "assignedTo and note are required" });

  try {
    const assigner = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    const assignee = await db.select().from(usersTable).where(eq(usersTable.id, Number(assignedTo))).then(r => r[0]);
    if (!assignee) return res.status(404).json({ error: "Assignee not found" });

    const [task] = await db.insert(tasksTable).values({
      recordType: recordType || null,
      recordId: recordId ? parseInt(recordId) : null,
      assignedBy: userId,
      assignedTo: Number(assignedTo),
      note: note.trim(),
      status: "open",
      priority: priority || "normal",
      dueDate: dueDate || null,
    }).returning();

    const contextLabel = recordType
      ? `${RECORD_LABELS[recordType] || recordType}${recordLabel ? ` — ${recordLabel}` : ""}`
      : "General";

    await db.insert(notificationsTable).values({
      userId: Number(assignedTo),
      type: "task_assigned",
      title: `Task from ${assigner?.name ?? "Someone"}`,
      body: `${note.trim()}${recordType ? ` · ${contextLabel}` : ""}${dueDate ? ` · Due ${dueDate}` : ""}`,
      link: recordType && recordId ? `/${recordType}s/${recordId}` : null,
      metadata: { taskId: task.id, recordType, recordId, assignedBy: userId },
    });

    res.json(task);
  } catch (e) {
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:id/complete — mark task done, notify assigner
router.put("/:id/complete", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const task = await db.select().from(tasksTable).where(eq(tasksTable.id, parseInt(req.params.id))).then(r => r[0]);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await db.update(tasksTable).set({ status: "done", completedAt: new Date() }).where(eq(tasksTable.id, task.id));

    const completer = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);

    if (task.assignedBy !== userId) {
      await db.insert(notificationsTable).values({
        userId: task.assignedBy,
        type: "task_completed",
        title: `Task completed by ${completer?.name ?? "Someone"}`,
        body: task.note ?? "",
        link: task.recordType && task.recordId ? `/${task.recordType}s/${task.recordId}` : null,
        metadata: { taskId: task.id, recordType: task.recordType, recordId: task.recordId },
      });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// PUT /api/tasks/:id/reopen
router.put("/:id/reopen", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await db.update(tasksTable).set({ status: "open", completedAt: null }).where(eq(tasksTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reopen task" });
  }
});

export default router;
