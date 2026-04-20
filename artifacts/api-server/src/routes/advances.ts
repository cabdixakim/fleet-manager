import { Router } from "express";
import { db } from "@workspace/db";
import { driverAdvancesTable, driversTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/advances?driverId=X
router.get("/", async (req, res, next) => {
  try {
    const { driverId, status } = req.query;
    const rows = await db
      .select({
        id: driverAdvancesTable.id,
        driverId: driverAdvancesTable.driverId,
        driverName: driversTable.name,
        amount: driverAdvancesTable.amount,
        date: driverAdvancesTable.date,
        description: driverAdvancesTable.description,
        status: driverAdvancesTable.status,
        payrollId: driverAdvancesTable.payrollId,
        createdAt: driverAdvancesTable.createdAt,
      })
      .from(driverAdvancesTable)
      .leftJoin(driversTable, eq(driverAdvancesTable.driverId, driversTable.id))
      .orderBy(driverAdvancesTable.date);

    const filtered = rows.filter((r) => {
      if (driverId && r.driverId !== parseInt(driverId as string)) return false;
      if (status && r.status !== status) return false;
      return true;
    });

    res.json(filtered.map((r) => ({ ...r, amount: parseFloat(r.amount) })));
  } catch (e) { next(e); }
});

// POST /api/advances
router.post("/", async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { driverId, amount, date, description } = req.body;
    if (!driverId || !amount || !date) {
      return res.status(400).json({ error: "driverId, amount, and date are required" });
    }

    const driver = await db.select().from(driversTable).where(eq(driversTable.id, parseInt(driverId))).then((r) => r[0]);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const [advance] = await db
      .insert(driverAdvancesTable)
      .values({
        driverId: parseInt(driverId),
        amount: parseFloat(amount).toFixed(2),
        date,
        description: description?.trim() || null,
        status: "pending",
      })
      .returning();

    res.status(201).json({ ...advance, amount: parseFloat(advance.amount) });
  } catch (e) { next(e); }
});

// DELETE /api/advances/:id — only allowed if still pending
router.delete("/:id", async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const id = parseInt(req.params.id);
    const [advance] = await db
      .select()
      .from(driverAdvancesTable)
      .where(eq(driverAdvancesTable.id, id));

    if (!advance) return res.status(404).json({ error: "Advance not found" });
    if (advance.status === "deducted") {
      return res.status(400).json({ error: "Cannot delete an advance that has already been deducted from payroll" });
    }

    await db.delete(driverAdvancesTable).where(eq(driverAdvancesTable.id, id));
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
