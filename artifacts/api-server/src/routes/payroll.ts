import { Router } from "express";
import { db } from "@workspace/db";
import {
  driverPayrollTable,
  driverPayrollAllocationsTable,
  driversTable,
  tripsTable,
  subcontractorTransactionsTable,
  trucksTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { REVENUE_RECOGNISED_STATUSES } from "../lib/financials";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { month, year } = req.query;
    let query = db
      .select({
        id: driverPayrollTable.id,
        driverId: driverPayrollTable.driverId,
        driverName: driversTable.name,
        month: driverPayrollTable.month,
        year: driverPayrollTable.year,
        monthlySalary: driverPayrollTable.monthlySalary,
        tripsCount: driverPayrollTable.tripsCount,
        createdAt: driverPayrollTable.createdAt,
      })
      .from(driverPayrollTable)
      .leftJoin(driversTable, eq(driverPayrollTable.driverId, driversTable.id));

    const results = await query.orderBy(driverPayrollTable.year, driverPayrollTable.month, driversTable.name);

    const filtered = results.filter((r) => {
      if (month && r.month !== parseInt(month as string)) return false;
      if (year && r.year !== parseInt(year as string)) return false;
      return true;
    });

    res.json(
      filtered.map((r) => ({
        ...r,
        monthlySalary: parseFloat(r.monthlySalary),
        amountPerTrip: r.tripsCount > 0 ? parseFloat(r.monthlySalary) / r.tripsCount : 0,
      }))
    );
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { month, year } = req.body as { month: number; year: number };

    const activeDrivers = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.status, "active"));

    const results = [];

    for (const driver of activeDrivers) {
      const existing = await db
        .select()
        .from(driverPayrollTable)
        .where(and(eq(driverPayrollTable.driverId, driver.id), eq(driverPayrollTable.month, month), eq(driverPayrollTable.year, year)));

      if (existing.length > 0) continue;

      // Count trips for this driver in the given month/year that are delivered
      const tripsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.driverId, driver.id),
            inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
            sql`EXTRACT(MONTH FROM ${tripsTable.createdAt}) = ${month}`,
            sql`EXTRACT(YEAR FROM ${tripsTable.createdAt}) = ${year}`
          )
        );

      const tripsCount = Number(tripsResult[0]?.count ?? 0);
      const salary = parseFloat(driver.monthlySalary);
      const perTrip = tripsCount > 0 ? salary / tripsCount : 0;

      const [payroll] = await db
        .insert(driverPayrollTable)
        .values({ driverId: driver.id, month, year, monthlySalary: driver.monthlySalary, tripsCount })
        .returning();

      if (tripsCount > 0) {
        const trips = await db
          .select({
            id: tripsTable.id,
            truckId: tripsTable.truckId,
            subcontractorId: tripsTable.subcontractorId,
          })
          .from(tripsTable)
          .where(
            and(
              eq(tripsTable.driverId, driver.id),
              inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
              sql`EXTRACT(MONTH FROM ${tripsTable.createdAt}) = ${month}`,
              sql`EXTRACT(YEAR FROM ${tripsTable.createdAt}) = ${year}`
            )
          );

        for (const trip of trips) {
          await db.insert(driverPayrollAllocationsTable).values({
            payrollId: payroll.id,
            tripId: trip.id,
            amount: perTrip.toFixed(2),
          });

          if (trip.subcontractorId) {
            await db.insert(subcontractorTransactionsTable).values({
              subcontractorId: trip.subcontractorId,
              type: "driver_salary",
              amount: perTrip.toFixed(2),
              tripId: trip.id,
              driverId: driver.id,
              description: `Driver salary allocation: ${driver.name} — ${month}/${year}`,
              transactionDate: new Date().toISOString(),
            });

          }
        }
      }

      results.push({
        ...payroll,
        driverName: driver.name,
        monthlySalary: salary,
        amountPerTrip: perTrip,
      });
    }

    const { logAudit } = await import("../lib/audit");
    await logAudit(req, { action: "create", entity: "payroll", description: `Processed payroll for ${results.length} driver(s) — ${month}/${year}`, metadata: { month, year, drivers: results.length } });

    res.status(201).json(results);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select({ driverId: driverPayrollTable.driverId, month: driverPayrollTable.month, year: driverPayrollTable.year }).from(driverPayrollTable).where(eq(driverPayrollTable.id, id));
    await db.delete(driverPayrollTable).where(eq(driverPayrollTable.id, id));
    const { logAudit } = await import("../lib/audit");
    await logAudit(req, { action: "delete", entity: "payroll", entityId: id, description: `Deleted payroll run #${id} (${entry?.month}/${entry?.year})` });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
