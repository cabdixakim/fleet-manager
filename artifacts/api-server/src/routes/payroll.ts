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
  companyExpensesTable,
  truckDriverAssignmentsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { REVENUE_RECOGNISED_STATUSES } from "../lib/financials";
import { blockIfClosed } from "../lib/financialPeriod";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const results = await db
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
      .leftJoin(driversTable, eq(driverPayrollTable.driverId, driversTable.id))
      .orderBy(driverPayrollTable.year, driverPayrollTable.month, driversTable.name);

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

    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(year, month, 0);
    const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    if (await blockIfClosed(res, monthStart, monthEndStr)) return;

    // Only process active drivers — standby/suspended/terminated are skipped
    const activeDrivers = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.status, "active"));

    const results = [];

    for (const driver of activeDrivers) {
      // Skip if already processed this month
      const existing = await db
        .select()
        .from(driverPayrollTable)
        .where(and(
          eq(driverPayrollTable.driverId, driver.id),
          eq(driverPayrollTable.month, month),
          eq(driverPayrollTable.year, year)
        ));
      if (existing.length > 0) continue;

      const salary = parseFloat(driver.monthlySalary);
      if (salary <= 0) continue;

      // Count trips for this driver in the month that are delivered
      const tripsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tripsTable)
        .where(and(
          eq(tripsTable.driverId, driver.id),
          inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
          sql`EXTRACT(MONTH FROM ${tripsTable.createdAt}) = ${month}`,
          sql`EXTRACT(YEAR FROM ${tripsTable.createdAt}) = ${year}`
        ));

      const tripsCount = Number(tripsResult[0]?.count ?? 0);
      const perTrip = tripsCount > 0 ? salary / tripsCount : 0;

      const [payroll] = await db
        .insert(driverPayrollTable)
        .values({ driverId: driver.id, month, year, monthlySalary: driver.monthlySalary, tripsCount })
        .returning();

      if (tripsCount > 0) {
        // Split salary across each trip and deduct from the trip's sub
        const trips = await db
          .select({ id: tripsTable.id, truckId: tripsTable.truckId, subcontractorId: tripsTable.subcontractorId })
          .from(tripsTable)
          .where(and(
            eq(tripsTable.driverId, driver.id),
            inArray(tripsTable.status, REVENUE_RECOGNISED_STATUSES),
            sql`EXTRACT(MONTH FROM ${tripsTable.createdAt}) = ${month}`,
            sql`EXTRACT(YEAR FROM ${tripsTable.createdAt}) = ${year}`
          ));

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
          } else {
            // Company-owned truck trip — book as company staff expense
            await db.insert(companyExpensesTable).values({
              category: "staff",
              description: `Driver salary (trip #${trip.id}): ${driver.name} — ${month}/${year}`,
              amount: perTrip.toFixed(2),
              currency: "USD",
              expenseDate: new Date(),
            });
          }
        }
      } else {
        // Driver is active but had no trips this month — book full salary to their sub or company
        const currentAssignment = await db
          .select({ truckId: truckDriverAssignmentsTable.truckId })
          .from(truckDriverAssignmentsTable)
          .where(and(
            eq(truckDriverAssignmentsTable.driverId, driver.id),
            isNull(truckDriverAssignmentsTable.unassignedAt)
          ))
          .limit(1);

        let bookedToSub = false;

        if (currentAssignment.length > 0) {
          const [truck] = await db
            .select({ subcontractorId: trucksTable.subcontractorId, companyOwned: trucksTable.companyOwned })
            .from(trucksTable)
            .where(eq(trucksTable.id, currentAssignment[0].truckId));

          if (truck && !truck.companyOwned && truck.subcontractorId) {
            // Book full monthly salary to the subcontractor
            await db.insert(subcontractorTransactionsTable).values({
              subcontractorId: truck.subcontractorId,
              type: "driver_salary",
              amount: salary.toFixed(2),
              tripId: null,
              driverId: driver.id,
              description: `Driver salary (no trips): ${driver.name} — ${month}/${year}`,
              transactionDate: new Date().toISOString(),
            });
            bookedToSub = true;
          }
        }

        if (!bookedToSub) {
          // Company-side driver or no truck assignment — book as company overhead
          await db.insert(companyExpensesTable).values({
            category: "staff",
            description: `Driver salary (no trips): ${driver.name} — ${month}/${year}`,
            amount: salary.toFixed(2),
            currency: "USD",
            expenseDate: new Date(),
          });
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
    await logAudit(req, {
      action: "create", entity: "payroll",
      description: `Processed payroll for ${results.length} driver(s) — ${month}/${year}`,
      metadata: { month, year, drivers: results.length },
    });

    res.status(201).json(results);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db
      .select({ driverId: driverPayrollTable.driverId, month: driverPayrollTable.month, year: driverPayrollTable.year })
      .from(driverPayrollTable)
      .where(eq(driverPayrollTable.id, id));
    await db.delete(driverPayrollTable).where(eq(driverPayrollTable.id, id));
    const { logAudit } = await import("../lib/audit");
    await logAudit(req, { action: "delete", entity: "payroll", entityId: id, description: `Deleted payroll run #${id} (${entry?.month}/${entry?.year})` });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
