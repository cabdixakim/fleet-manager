import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const RESET_SECRET = "optima-factory-reset-xk9-2026";

async function wipeDatabase() {
  await pool.query(`
    TRUNCATE TABLE
      agent_transactions,
      agents,
      audit_logs,
      clearances,
      client_transactions,
      company_expenses,
      company_settings,
      delivery_notes,
      driver_payroll_allocations,
      driver_payroll,
      invoices,
      periods,
      subcontractor_transactions,
      subcontractors,
      trip_amendments,
      trip_expenses,
      trips,
      truck_driver_assignments,
      batches,
      trucks,
      drivers,
      clients,
      users,
      session
    RESTART IDENTITY CASCADE
  `);
}

// GET version — visit /api/admin/factory-reset?key=<secret> in browser
router.get("/factory-reset", async (req, res) => {
  if (req.query["key"] !== RESET_SECRET) {
    res.status(403).send("Forbidden");
    return;
  }
  await wipeDatabase();
  res.send("✅ All data wiped. Refresh the app — it will show the setup wizard.");
});

router.post("/factory-reset", async (req, res) => {
  const secret = req.headers["x-reset-secret"];
  if (secret !== RESET_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await pool.query(`
    TRUNCATE TABLE
      agent_transactions,
      agents,
      audit_logs,
      clearances,
      client_transactions,
      company_expenses,
      company_settings,
      delivery_notes,
      driver_payroll_allocations,
      driver_payroll,
      invoices,
      periods,
      subcontractor_transactions,
      subcontractors,
      trip_amendments,
      trip_expenses,
      trips,
      truck_driver_assignments,
      batches,
      trucks,
      drivers,
      clients,
      users,
      session
    RESTART IDENTITY CASCADE
  `);

  res.json({ success: true, message: "All data wiped. App will show setup wizard." });
});

export default router;
