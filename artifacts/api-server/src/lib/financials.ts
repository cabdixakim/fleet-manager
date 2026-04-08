import { db } from "@workspace/db";
import {
  tripsTable,
  tripExpensesTable,
  driverPayrollAllocationsTable,
  subcontractorsTable,
  trucksTable,
  clientsTable,
  batchesTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

// Statuses where revenue is recognised and counted towards sub payable
export const REVENUE_RECOGNISED_STATUSES = ["delivered", "completed", "invoiced", "amended_out"];

export type TripFinancials = {
  agentFeePerMt: number | null;
  agentFeeTotal: number | null;
  grossRevenue: number | null;
  commission: number | null;
  /** Commission rate as a percentage (e.g. 5 for 5%). */
  commissionRatePct: number | null;
  /**
   * 'commission' — sub is paid gross minus a commission percentage.
   * 'rate_differential' — sub is given the job at a lower rate; the spread is the company margin.
   */
  billingModel: "commission" | "rate_differential";
  /** Effective sub rate per MT used in rate_differential model (from trip override or sub default). */
  subRatePerMt: number | null;
  /** Sub's record-level default rate per MT (null if not set). Useful for displaying placeholders. */
  subDefaultRatePerMt: number | null;
  shortQty: number | null;
  allowancePct: number | null;
  allowanceQty: number | null;
  chargeableShort: number | null;
  /** Short penalty deducted from subcontractor (at sub's short rate). */
  shortCharge: number | null;
  /** The per-unit sub short charge rate applied (USD/MT). */
  subShortChargeRate: number | null;
  /**
   * Short credit owed back to the client (at the client's own short rate).
   * This reduces the net revenue the company keeps.
   * The spread (shortCharge − clientShortCharge) is additional company income.
   */
  clientShortCharge: number | null;
  /** The per-unit client short charge rate applied (USD/MT) — may include trip-level override. */
  clientShortChargeRate: number | null;
  /** Client short charge rate from the client record, before any trip-level override. Used as placeholder in edit UI. */
  baseClientShortChargeRate: number | null;
  /** Sub short charge rate from the sub record, before any trip-level override. Used as placeholder in edit UI. */
  baseSubShortChargeRate: number | null;
  tripExpensesTotal: number;
  driverSalaryAllocation: number;
  netPayable: number | null;
  /** True when trip is not yet delivered — revenue is held; only expenses are deducted. */
  isRevenueHeld: boolean;
  /** The projected gross revenue regardless of hold status (for display purposes). */
  projectedGross: number | null;
  /** Current trip status */
  tripStatus: string;
};

export interface TripFinancialsOverrides {
  overrideDeliveredQty?: number;
  overrideRate?: number;
  /** Override the loaded qty (affects short qty calculation) */
  overrideLoadedQty?: number;
  /** Override the client short charge rate per MT */
  overrideClientShortRate?: number;
}

export async function calculateTripFinancials(tripId: number, overrides?: TripFinancialsOverrides): Promise<TripFinancials> {
  const [trip] = await db
    .select({
      id: tripsTable.id,
      status: tripsTable.status,
      loadedQty: tripsTable.loadedQty,
      deliveredQty: tripsTable.deliveredQty,
      product: tripsTable.product,
      batchId: tripsTable.batchId,
      truckId: tripsTable.truckId,
      incidentReplacementTruckId: tripsTable.incidentReplacementTruckId,
      incidentRevenueOwner: tripsTable.incidentRevenueOwner,
      subRatePerMt: tripsTable.subRatePerMt,
      clientShortRateOverride: tripsTable.clientShortRateOverride,
      subShortRateOverride: tripsTable.subShortRateOverride,
      commissionRateSnapshot: tripsTable.commissionRateSnapshot,
      defaultSubRateSnapshot: tripsTable.defaultSubRateSnapshot,
      subShortRateSnapshot: tripsTable.subShortRateSnapshot,
      clientShortRateSnapshot: tripsTable.clientShortRateSnapshot,
    })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));

  if (!trip) throw new Error("Trip not found");

  const expensesResult = await db
    .select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(tripExpensesTable)
    .where(eq(tripExpensesTable.tripId, tripId));

  const allocationsResult = await db
    .select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(driverPayrollAllocationsTable)
    .where(eq(driverPayrollAllocationsTable.tripId, tripId));

  const tripExpensesTotal = parseFloat(expensesResult[0]?.total ?? "0");
  const driverSalaryAllocation = parseFloat(allocationsResult[0]?.total ?? "0");

  // Determine which truck's subcontractor owns the revenue
  // If incidentRevenueOwner = 'replacement' and there's a replacement truck, use that truck
  const revenueOwner = trip.incidentRevenueOwner;
  const revenueTruckId =
    revenueOwner === "replacement" && trip.incidentReplacementTruckId
      ? trip.incidentReplacementTruckId
      : trip.truckId;

  const [batch] = await db
    .select({ ratePerMt: batchesTable.ratePerMt, clientId: batchesTable.clientId, agentFeePerMt: batchesTable.agentFeePerMt })
    .from(batchesTable)
    .where(eq(batchesTable.id, trip.batchId));

  const isRevenueHeld = !REVENUE_RECOGNISED_STATUSES.includes(trip.status);
  const tripStatus = trip.status;

  const NONE: Omit<TripFinancials, "tripExpensesTotal" | "driverSalaryAllocation" | "isRevenueHeld" | "projectedGross" | "tripStatus"> = {
    agentFeePerMt: null, agentFeeTotal: null,
    grossRevenue: null, commission: null, commissionRatePct: null, billingModel: "commission", subRatePerMt: null, subDefaultRatePerMt: null,
    shortQty: null, allowancePct: null, allowanceQty: null, chargeableShort: null,
    shortCharge: null, subShortChargeRate: null, clientShortCharge: null, clientShortChargeRate: null,
    baseClientShortChargeRate: null, baseSubShortChargeRate: null, netPayable: null,
  };

  if (!batch) {
    return { ...NONE, tripExpensesTotal, driverSalaryAllocation, netPayable: isRevenueHeld ? -(tripExpensesTotal + driverSalaryAllocation) : null, isRevenueHeld, projectedGross: null, tripStatus };
  }

  const [truck] = await db
    .select({ subcontractorId: trucksTable.subcontractorId })
    .from(trucksTable)
    .where(eq(trucksTable.id, revenueTruckId));

  const ratePerMt = overrides?.overrideRate ?? parseFloat(batch.ratePerMt ?? "0");

  // Trip-level sub rate override
  const tripSubRatePerMt = trip.subRatePerMt != null ? parseFloat(trip.subRatePerMt) : null;

  if (!truck?.subcontractorId) {
    const billingModel: "commission" | "rate_differential" = tripSubRatePerMt != null ? "rate_differential" : "commission";
    if (trip.loadedQty == null) {
      return { ...NONE, billingModel, subRatePerMt: tripSubRatePerMt, tripExpensesTotal, driverSalaryAllocation, netPayable: isRevenueHeld ? -(tripExpensesTotal + driverSalaryAllocation) : null, isRevenueHeld, projectedGross: null, tripStatus };
    }
    const loadedQty = parseFloat(trip.loadedQty);
    const projectedGross = loadedQty * ratePerMt;
    if (isRevenueHeld) {
      return { ...NONE, billingModel, subRatePerMt: tripSubRatePerMt, tripExpensesTotal, driverSalaryAllocation, netPayable: -(tripExpensesTotal + driverSalaryAllocation), isRevenueHeld: true, projectedGross, tripStatus };
    }
    const netPayable = projectedGross - tripExpensesTotal - driverSalaryAllocation;
    return { ...NONE, billingModel, subRatePerMt: tripSubRatePerMt, grossRevenue: projectedGross, commission: 0, commissionRatePct: 0, tripExpensesTotal, driverSalaryAllocation, netPayable, isRevenueHeld: false, projectedGross, tripStatus };
  }

  const [sub] = await db
    .select({
      commissionRate: subcontractorsTable.commissionRate,
      defaultSubRatePerMt: subcontractorsTable.defaultSubRatePerMt,
      agoShortChargeRate: subcontractorsTable.agoShortChargeRate,
      pmsShortChargeRate: subcontractorsTable.pmsShortChargeRate,
    })
    .from(subcontractorsTable)
    .where(eq(subcontractorsTable.id, truck.subcontractorId));

  // Commission rate: prefer snapshot (stamped at nomination) → live from sub (legacy trips)
  const commissionRate = trip.commissionRateSnapshot != null
    ? parseFloat(trip.commissionRateSnapshot) / 100
    : parseFloat(sub?.commissionRate ?? "0") / 100;

  // Sub default rate/MT: cascade → trip explicit override → snapshot → live from sub
  const subDefaultRatePerMt = trip.defaultSubRateSnapshot != null
    ? parseFloat(trip.defaultSubRateSnapshot)
    : (sub?.defaultSubRatePerMt != null ? parseFloat(sub.defaultSubRatePerMt) : null);
  const effectiveSubRatePerMt = tripSubRatePerMt ?? subDefaultRatePerMt;
  const billingModel: "commission" | "rate_differential" = effectiveSubRatePerMt != null ? "rate_differential" : "commission";

  let subShortChargeRate = 0;
  let clientShortChargeRate = 0;
  const allowancePct = trip.product === "AGO" ? 0.3 : 0.5;

  // Sub short rate: prefer snapshot → live from sub
  const subShortRate = trip.subShortRateSnapshot != null
    ? parseFloat(trip.subShortRateSnapshot)
    : parseFloat(trip.product === "AGO" ? (sub?.agoShortChargeRate ?? "0") : (sub?.pmsShortChargeRate ?? "0"));

  if (batch.clientId) {
    const [client] = await db
      .select({ agoShortChargeRate: clientsTable.agoShortChargeRate, pmsShortChargeRate: clientsTable.pmsShortChargeRate })
      .from(clientsTable)
      .where(eq(clientsTable.id, batch.clientId));
    if (client) {
      // Client short rate: prefer snapshot → live from client
      clientShortChargeRate = trip.clientShortRateSnapshot != null
        ? parseFloat(trip.clientShortRateSnapshot)
        : parseFloat(trip.product === "AGO" ? (client.agoShortChargeRate ?? "0") : (client.pmsShortChargeRate ?? "0"));
      // Sub rate takes priority; fall back to client rate if sub hasn't set their own
      subShortChargeRate = subShortRate > 0 ? subShortRate : clientShortChargeRate;
    }
  } else {
    subShortChargeRate = subShortRate;
    clientShortChargeRate = 0;
  }

  // Capture base rates (from client/sub records) before applying any trip-level overrides.
  // These are used as placeholder hints in the trip edit UI so the user can see what the default is.
  const baseClientShortChargeRate = clientShortChargeRate;
  const baseSubShortChargeRate = subShortChargeRate;

  // Per-trip short rate overrides take absolute priority over client/sub defaults
  if (trip.clientShortRateOverride != null) clientShortChargeRate = parseFloat(trip.clientShortRateOverride);
  if (trip.subShortRateOverride != null) subShortChargeRate = parseFloat(trip.subShortRateOverride);
  // Amendment-level overrides take final priority (passed from amend invoice flow)
  if (overrides?.overrideClientShortRate != null) clientShortChargeRate = overrides.overrideClientShortRate;

  if (trip.loadedQty == null && overrides?.overrideLoadedQty == null) {
    return {
      ...NONE, billingModel, subRatePerMt: effectiveSubRatePerMt, subDefaultRatePerMt,
      allowancePct, subShortChargeRate, clientShortChargeRate, baseClientShortChargeRate, baseSubShortChargeRate,
      tripExpensesTotal, driverSalaryAllocation,
      netPayable: isRevenueHeld ? -(tripExpensesTotal + driverSalaryAllocation) : null,
      isRevenueHeld, projectedGross: null, tripStatus,
    };
  }

  const loadedQty = overrides?.overrideLoadedQty ?? parseFloat(trip.loadedQty!);
  const projectedGross = loadedQty * ratePerMt;

  if (isRevenueHeld) {
    return {
      ...NONE, billingModel, subRatePerMt: effectiveSubRatePerMt, subDefaultRatePerMt,
      allowancePct, subShortChargeRate, clientShortChargeRate, baseClientShortChargeRate, baseSubShortChargeRate,
      tripExpensesTotal, driverSalaryAllocation,
      netPayable: -(tripExpensesTotal + driverSalaryAllocation),
      isRevenueHeld: true, projectedGross, tripStatus,
    };
  }

  // Revenue recognised — full calculation
  const grossRevenue = projectedGross;
  const agentFeePerMtValue = batch.agentFeePerMt != null ? parseFloat(batch.agentFeePerMt) : 0;
  const agentFeeTotal = loadedQty * agentFeePerMtValue;
  const effectiveBase = grossRevenue - agentFeeTotal;

  let shortQty: number | null = null;
  let allowanceQty: number | null = null;
  let chargeableShort: number | null = null;
  let shortCharge: number | null = null;
  let clientShortCharge: number | null = null;

  const effectiveDeliveredQty = overrides?.overrideDeliveredQty ?? (trip.deliveredQty != null ? parseFloat(trip.deliveredQty) : null);
  if (effectiveDeliveredQty != null) {
    shortQty = Math.max(0, loadedQty - effectiveDeliveredQty);
    allowanceQty = loadedQty * (allowancePct / 100);
    chargeableShort = Math.max(0, shortQty - allowanceQty);
    shortCharge = chargeableShort * subShortChargeRate;
    clientShortCharge = chargeableShort * clientShortChargeRate;
  }

  const effectiveSubShortCharge = shortCharge ?? 0;

  // Billing model: rate_differential uses effectiveSubRatePerMt (trip override OR sub default)
  let commission: number;
  let commissionRatePct: number;
  let netPayable: number;

  if (billingModel === "rate_differential" && effectiveSubRatePerMt != null) {
    const subGross = loadedQty * effectiveSubRatePerMt;
    commission = effectiveBase - subGross; // company keeps the spread after agent fee
    commissionRatePct = grossRevenue > 0 ? (commission / grossRevenue) * 100 : 0;
    netPayable = subGross - effectiveSubShortCharge - tripExpensesTotal - driverSalaryAllocation;
  } else {
    commission = effectiveBase * commissionRate;
    commissionRatePct = commissionRate * 100;
    netPayable = effectiveBase - commission - effectiveSubShortCharge - tripExpensesTotal - driverSalaryAllocation;
  }

  return {
    agentFeePerMt: agentFeePerMtValue > 0 ? agentFeePerMtValue : null,
    agentFeeTotal: agentFeeTotal > 0 ? agentFeeTotal : null,
    grossRevenue, commission, commissionRatePct, billingModel, subRatePerMt: effectiveSubRatePerMt, subDefaultRatePerMt,
    shortQty, allowancePct, allowanceQty, chargeableShort,
    shortCharge, subShortChargeRate, clientShortCharge, clientShortChargeRate,
    baseClientShortChargeRate, baseSubShortChargeRate,
    tripExpensesTotal, driverSalaryAllocation, netPayable,
    isRevenueHeld: false, projectedGross, tripStatus,
  };
}

/**
 * Looks up the current rates for a given truck + product + batch and returns
 * the values that should be snapshotted onto the trip at nomination time.
 * Call this after inserting or amending a trip's truck assignment and persist
 * the result back to the trip row.
 */
export async function snapTripRates(truckId: number, product: string, batchId: number): Promise<{
  commissionRateSnapshot: string | null;
  defaultSubRateSnapshot: string | null;
  subShortRateSnapshot: string | null;
  clientShortRateSnapshot: string | null;
}> {
  const [truck] = await db
    .select({ subcontractorId: trucksTable.subcontractorId })
    .from(trucksTable)
    .where(eq(trucksTable.id, truckId));

  let commissionRateSnapshot: string | null = null;
  let defaultSubRateSnapshot: string | null = null;
  let subShortRateSnapshot: string | null = null;

  if (truck?.subcontractorId) {
    const [sub] = await db
      .select({
        commissionRate: subcontractorsTable.commissionRate,
        defaultSubRatePerMt: subcontractorsTable.defaultSubRatePerMt,
        agoShortChargeRate: subcontractorsTable.agoShortChargeRate,
        pmsShortChargeRate: subcontractorsTable.pmsShortChargeRate,
      })
      .from(subcontractorsTable)
      .where(eq(subcontractorsTable.id, truck.subcontractorId));

    if (sub) {
      commissionRateSnapshot = sub.commissionRate ?? null;
      defaultSubRateSnapshot = sub.defaultSubRatePerMt ?? null;
      subShortRateSnapshot = (product === "AGO" ? sub.agoShortChargeRate : sub.pmsShortChargeRate) ?? null;
    }
  }

  const [batch] = await db
    .select({ clientId: batchesTable.clientId })
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId));

  let clientShortRateSnapshot: string | null = null;
  if (batch?.clientId) {
    const [client] = await db
      .select({ agoShortChargeRate: clientsTable.agoShortChargeRate, pmsShortChargeRate: clientsTable.pmsShortChargeRate })
      .from(clientsTable)
      .where(eq(clientsTable.id, batch.clientId));
    clientShortRateSnapshot = (client ? (product === "AGO" ? client.agoShortChargeRate : client.pmsShortChargeRate) : null) ?? null;
  }

  return { commissionRateSnapshot, defaultSubRateSnapshot, subShortRateSnapshot, clientShortRateSnapshot };
}
