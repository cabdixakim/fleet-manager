import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, trucksTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const drivers = await db
      .select({
        id: driversTable.id,
        name: driversTable.name,
        passportNumber: driversTable.passportNumber,
        licenseNumber: driversTable.licenseNumber,
        phone: driversTable.phone,
        status: driversTable.status,
        statusEffectiveDate: driversTable.statusEffectiveDate,
        monthlySalary: driversTable.monthlySalary,
        notes: driversTable.notes,
        createdAt: driversTable.createdAt,
      })
      .from(driversTable)
      .orderBy(driversTable.name);
    res.json(drivers.map((d) => ({ ...d, monthlySalary: parseFloat(d.monthlySalary) })));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, passportNumber, licenseNumber } = req.body;
    const missing: string[] = [];
    if (!name?.trim()) missing.push("name");
    if (!passportNumber?.trim()) missing.push("passportNumber");
    if (!licenseNumber?.trim()) missing.push("licenseNumber");
    if (missing.length) {
      return res.status(400).json({ error: "Missing required fields", missing });
    }
    const [driver] = await db.insert(driversTable).values(req.body).returning();
    await logAudit(req, { action: "create", entity: "driver", entityId: driver.id, description: `Added driver ${driver.name}`, metadata: { salary: parseFloat(driver.monthlySalary) } });
    res.status(201).json({ ...driver, monthlySalary: parseFloat(driver.monthlySalary), assignedTruckPlate: null });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [driver] = await db
      .select({
        id: driversTable.id,
        name: driversTable.name,
        passportNumber: driversTable.passportNumber,
        licenseNumber: driversTable.licenseNumber,
        phone: driversTable.phone,
        status: driversTable.status,
        statusEffectiveDate: driversTable.statusEffectiveDate,
        monthlySalary: driversTable.monthlySalary,
        assignedTruckId: driversTable.assignedTruckId,
        assignedTruckPlate: trucksTable.plateNumber,
        notes: driversTable.notes,
        createdAt: driversTable.createdAt,
      })
      .from(driversTable)
      .leftJoin(trucksTable, eq(driversTable.assignedTruckId, trucksTable.id))
      .where(eq(driversTable.id, parseInt(req.params.id)));
    if (!driver) return res.status(404).json({ error: "Not found" });
    res.json({ ...driver, monthlySalary: parseFloat(driver.monthlySalary) });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [driver] = await db.update(driversTable).set(req.body).where(eq(driversTable.id, id)).returning();
    if (!driver) return res.status(404).json({ error: "Not found" });
    await logAudit(req, { action: "update", entity: "driver", entityId: id, description: `Updated driver ${driver.name}` });
    const [truck] = driver.assignedTruckId
      ? await db.select({ plateNumber: trucksTable.plateNumber }).from(trucksTable).where(eq(trucksTable.id, driver.assignedTruckId))
      : [null];
    res.json({ ...driver, monthlySalary: parseFloat(driver.monthlySalary), assignedTruckPlate: truck?.plateNumber ?? null });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
    await db.delete(driversTable).where(eq(driversTable.id, id));
    await logAudit(req, { action: "delete", entity: "driver", entityId: id, description: `Removed driver ${driver?.name ?? id}` });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
