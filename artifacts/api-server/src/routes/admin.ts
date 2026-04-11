import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const RESET_SECRET = "optima-factory-reset-xk9-2026";

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
