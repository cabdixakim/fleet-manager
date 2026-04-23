import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetBatch, useNominateTrucks, useGetBatchFinancials, useUpdateBatch,
  useGetTrucks, useGetDrivers, useUpdateTrip, usePatchDriver, useGetAgents,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { exportToExcel } from "@/lib/export";
import {
  Plus, Truck, ChevronLeft, Download, X, ChevronRight,
  ArrowRight, CheckCircle2, Circle, Loader2, FileText, Printer, Pencil, AlertTriangle, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BATCH_STAGE_ORDER = ["planning", "loading", "in_transit", "delivered", "invoiced"];
const BATCH_STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  loading: "Loading",
  in_transit: "In Transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
};

type TripNextResult = { status: string; label: string; needsQty?: "loaded" | "delivered" };

const LEGACY_TRIP_NEXT: Record<string, TripNextResult> = {
  nominated:       { status: "loading",        label: "Begin Loading" },
  loading:         { status: "loaded",          label: "Mark Loaded",   needsQty: "loaded" },
  loaded:          { status: "in_transit",      label: "Dispatch" },
  in_transit:      { status: "at_zambia_entry", label: "At Zambia Entry" },
  at_zambia_entry: { status: "at_drc_entry",   label: "At DRC Entry" },
  at_drc_entry:    { status: "delivered",      label: "Mark Delivered", needsQty: "delivered" },
};

function getTripNext(trip: any): TripNextResult | undefined {
  const cps: Array<{ seq: number; name: string }> = trip.tripCheckpoints ?? [];
  if (cps.length === 0) return LEGACY_TRIP_NEXT[trip.status];
  const order = [
    "nominated", "loading", "loaded", "in_transit",
    ...cps.map((c) => `at_checkpoint_${c.seq}`),
    "delivered",
  ];
  const idx = order.indexOf(trip.status);
  // If current status isn't in dynamic order (e.g. legacy at_zambia_entry on a trip that now has checkpoints),
  // fall back to legacy map so the trip can still be advanced
  if (idx === -1) return LEGACY_TRIP_NEXT[trip.status];
  if (idx >= order.length - 1) return undefined;
  const nextStatus = order[idx + 1];
  // Map standard transitions that need qty prompt
  if (nextStatus === "loaded") return { status: "loaded", label: "Mark Loaded", needsQty: "loaded" };
  if (nextStatus === "delivered") return { status: "delivered", label: "Mark Delivered", needsQty: "delivered" };
  // Dynamic checkpoint labels
  if (nextStatus.startsWith("at_checkpoint_")) {
    const seq = parseInt(nextStatus.split("_").pop()!);
    const cp = cps.find((c) => c.seq === seq);
    return { status: nextStatus, label: `At ${cp?.name ?? `Checkpoint ${seq}`}` };
  }
  const labels: Record<string, string> = { loading: "Begin Loading", in_transit: "Dispatch" };
  return { status: nextStatus, label: labels[nextStatus] ?? nextStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}

function getTripStatusLabel(trip: any): string {
  const cps: Array<{ seq: number; name: string }> = trip.tripCheckpoints ?? [];
  const s: string = trip.status;
  const match = s.match(/^at_checkpoint_(\d+)$/);
  if (match && cps.length > 0) {
    const seq = parseInt(match[1]);
    const cp = cps.find((c) => c.seq === seq);
    return `At ${cp?.name ?? `Checkpoint ${seq}`}`;
  }
  const STATIC: Record<string, string> = {
    nominated: "Nominated", loading: "Loading", loaded: "Loaded", in_transit: "In Transit",
    at_zambia_entry: "At Zambia", at_drc_entry: "At DRC",
    delivered: "Delivered", cancelled: "Cancelled", amended_out: "Amended Out",
  };
  return STATIC[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TRIP_STATUS_LABEL: Record<string, string> = {
  nominated: "Nominated", loading: "Loading", loaded: "Loaded", in_transit: "In Transit",
  at_zambia_entry: "At Zambia", at_drc_entry: "At DRC",
  delivered: "Delivered", cancelled: "Cancelled", amended_out: "Amended Out",
};

const BATCH_ADVANCE: Record<string, { status: string; label: string; description: string }> = {
  planning:   { status: "loading",    label: "Begin Loading Operations", description: "All trucks are nominated. Start loading cargo." },
  loading:    { status: "in_transit", label: "Dispatch Convoy",          description: "All trucks loaded. Mark batch as dispatched and in transit." },
  in_transit: { status: "delivered",  label: "Mark All Delivered",       description: "All trucks have arrived at destination." },
  delivered:  { status: "invoiced",   label: "Mark as Invoiced",         description: "Create and send invoice to the client." },
};

const TRIP_STATUS_COLOR: Record<string, string> = {
  nominated: "bg-muted-foreground/20 text-muted-foreground",
  loading: "bg-yellow-500/20 text-yellow-400",
  loaded: "bg-blue-500/20 text-blue-400",
  in_transit: "bg-primary/20 text-primary",
  at_zambia_entry: "bg-orange-500/20 text-orange-400",
  at_drc_entry: "bg-purple-500/20 text-purple-400",
  delivered: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
  amended_out: "bg-destructive/20 text-destructive",
};

import { getRouteLabel } from "@/lib/routes";

const PRINT_PAGE_SIZE = { landscape: "A4 landscape", portrait: "A4 portrait" };

function openPrintWindow(html: string, title: string, orientation: "landscape" | "portrait" = "landscape") {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>*{box-sizing:border-box;}body{margin:0;padding:0;background:#fff;}@media print{@page{size:${PRINT_PAGE_SIZE[orientation]};margin:8mm;}}</style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (_) {} }, 350);
}

function generateBatchClientHtml(batch: any, financials: any, company: any): string {
  const trips: any[] = batch.trips ?? [];
  const breakdown: any[] = financials?.tripBreakdown ?? [];
  const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

  const rows = activeTrips.map((t) => {
    const fin = breakdown.find((fb) => fb.tripId === t.id) ?? {};
    const loaded = parseFloat(t.loadedQty ?? 0);
    const delivered = parseFloat(t.deliveredQty ?? 0);
    const shortQty = Math.max(0, loaded - delivered);
    const gross = parseFloat(fin.grossRevenue ?? 0);
    const shortCharge = parseFloat(fin.shortCharge ?? 0);
    const net = gross - shortCharge;
    return { truckPlate: t.truckPlate, product: t.product ?? "-", loaded, delivered, shortQty, gross, shortCharge, net };
  });

  const totals = rows.reduce(
    (acc, r) => ({ loaded: acc.loaded + r.loaded, delivered: acc.delivered + r.delivered, shortQty: acc.shortQty + r.shortQty, gross: acc.gross + r.gross, shortCharge: acc.shortCharge + r.shortCharge, net: acc.net + r.net }),
    { loaded: 0, delivered: 0, shortQty: 0, gross: 0, shortCharge: 0, net: 0 }
  );

  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const routeLabel = getRouteLabel(batch.route ?? "");
  const rate = parseFloat(batch.ratePerMt ?? 0);
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`;

  const rowsHtml = rows.map((r, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 10px;font-size:11px;font-weight:600;">${r.truckPlate}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:center;font-weight:700;color:${r.product === "AGO" ? "#2563eb" : "#d97706"};">${r.product}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${r.loaded > 0 ? r.loaded.toFixed(3) : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${r.delivered > 0 ? r.delivered.toFixed(3) : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;color:${r.shortQty > 0 ? "#dc2626" : "#6b7280"};">${r.shortQty > 0 ? r.shortQty.toFixed(3) : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${r.gross > 0 ? `$${r.gross.toFixed(2)}` : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;color:#dc2626;">${r.shortCharge > 0 ? `$${r.shortCharge.toFixed(2)}` : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;font-weight:700;color:#059669;">${r.net > 0 ? `$${r.net.toFixed(2)}` : "—"}</td>
    </tr>`
  ).join("");

  const html = `
<div style="font-family:Arial,sans-serif;color:#111827;background:#fff;width:100%;max-width:780px;margin:0 auto;">
  <div style="background:#0f172a;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoHtml}
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;">${companyName}</div>
        ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="color:#94a3b8;font-size:10px;">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#f1f5f9;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Freight Completion Note</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${datePrinted}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:2px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Client</div>
      <div style="font-size:13px;font-weight:700;">${batch.clientName ?? "—"}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Batch Reference</div>
      <div style="font-size:13px;font-weight:700;">${batch.name ?? `Batch #${batch.id}`}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Route</div>
      <div style="font-size:12px;font-weight:600;">${routeLabel}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Rate / MT</div>
      <div style="font-size:13px;font-weight:700;">$${rate.toFixed(2)}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:0;">
    <thead>
      <tr style="background:#1e293b;">
        ${["Truck", "Product", "Loaded (MT)", "Delivered (MT)", "Short (MT)", "Gross ($)", "Short Chg ($)", "Net ($)"].map((h) =>
          `<th style="padding:8px 10px;text-align:${["Truck","Product"].includes(h) ? "left" : "right"};font-size:9px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;">${h}</th>`
        ).join("")}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">No delivered trips found.</td></tr>`}
    </tbody>
    <tfoot>
      <tr style="background:#f0fdf4;border-top:2px solid #059669;">
        <td colspan="2" style="padding:8px 10px;font-size:11px;font-weight:700;">TOTAL</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;">${totals.loaded > 0 ? totals.loaded.toFixed(3) : "—"}</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;">${totals.delivered > 0 ? totals.delivered.toFixed(3) : "—"}</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#dc2626;">${totals.shortQty > 0 ? totals.shortQty.toFixed(3) : "—"}</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;">$${totals.gross.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#dc2626;">${totals.shortCharge > 0 ? `$${totals.shortCharge.toFixed(2)}` : "—"}</td>
        <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;color:#059669;">$${totals.net.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#166534;letter-spacing:0.05em;">Total Net Payable by Client</div>
    <div style="font-size:22px;font-weight:700;color:#059669;">$${totals.net.toFixed(2)}</div>
  </div>

  <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 8px;">
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Authorised by (${companyName})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Acknowledged by (${batch.clientName ?? "Client"})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
  </div>

  <div style="margin-top:16px;padding:10px 16px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;">
    Generated by ${companyName} · ${datePrinted} · This document is a freight completion summary only and is not a tax invoice.
  </div>
</div>`;
  return html;
}

function generateBatchSubHtml(batch: any, financials: any, company: any): string {
  const trips: any[] = batch.trips ?? [];
  const breakdown: any[] = financials?.tripBreakdown ?? [];
  const subAdvances: Record<number, number> = financials?.subAdvances ?? {};
  const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const routeLabel = getRouteLabel(batch.route ?? "");
  const initials2 = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml2 = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials2}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials2}</div>`;

  // Group trips by subcontractorName + subcontractorId
  const subMap: Record<string, { name: string; subId: number; rows: any[] }> = {};
  for (const t of activeTrips) {
    const fin = breakdown.find((fb: any) => fb.tripId === t.id) ?? {};
    const subName = t.subcontractorName ?? "Unknown Subcontractor";
    if (!subMap[subName]) subMap[subName] = { name: subName, subId: t.subcontractorId ?? 0, rows: [] };
    const loaded = parseFloat(t.loadedQty ?? 0);
    const delivered = parseFloat(t.deliveredQty ?? 0);
    const shortQty = Math.max(0, loaded - delivered);
    const grossRevenue = parseFloat(fin.grossRevenue ?? 0);
    const commission = parseFloat(fin.commission ?? 0);
    const shortCharge = parseFloat(fin.shortCharge ?? 0);
    const expenses = parseFloat(fin.tripExpensesTotal ?? 0);
    const driverSalary = parseFloat(fin.driverSalaryAllocation ?? 0);
    const netPayable = parseFloat(fin.netPayable ?? grossRevenue - commission - shortCharge - expenses - driverSalary);
    // Sub's gross earning = gross revenue minus company's commission (before sub-level deductions)
    const subGross = grossRevenue - commission;
    subMap[subName].rows.push({ truckPlate: t.truckPlate, product: t.product ?? "—", loaded, delivered, shortQty, grossRevenue, commission, subGross, shortCharge, expenses, driverSalary, netPayable });
  }

  const subs = Object.values(subMap);

  const headers = ["Truck", "Product", "Loaded (MT)", "Delivered (MT)", "Short (MT)", "Commission", "Short Chg", "Expenses", "Driver Sal.", "Net Payable"];

  const subSections = subs.map((sub, si) => {
    const totals = sub.rows.reduce((a, r) => ({
      loaded: a.loaded + r.loaded, delivered: a.delivered + r.delivered, shortQty: a.shortQty + r.shortQty,
      grossRevenue: a.grossRevenue + r.grossRevenue, commission: a.commission + r.commission, subGross: a.subGross + r.subGross,
      shortCharge: a.shortCharge + r.shortCharge,
      expenses: a.expenses + r.expenses, driverSalary: a.driverSalary + r.driverSalary, netPayable: a.netPayable + r.netPayable,
    }), { loaded: 0, delivered: 0, shortQty: 0, grossRevenue: 0, commission: 0, subGross: 0, shortCharge: 0, expenses: 0, driverSalary: 0, netPayable: 0 });

    const advanceGiven = subAdvances[sub.subId] ?? 0;
    const balanceDue = totals.netPayable - advanceGiven;

    const rowsHtml = sub.rows.map((r, i) =>
      `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
        <td style="padding:6px 8px;font-size:10.5px;font-weight:600;">${r.truckPlate}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:center;font-weight:700;color:${r.product === "AGO" ? "#2563eb" : "#d97706"};">${r.product}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;">${r.loaded > 0 ? r.loaded.toFixed(3) : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;">${r.delivered > 0 ? r.delivered.toFixed(3) : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;color:${r.shortQty > 0 ? "#dc2626" : "#6b7280"};">${r.shortQty > 0 ? r.shortQty.toFixed(3) : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;">${r.commission > 0 ? `$${r.commission.toFixed(2)}` : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;color:#dc2626;">${r.shortCharge > 0 ? `-$${r.shortCharge.toFixed(2)}` : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;color:#d97706;">${r.expenses > 0 ? `-$${r.expenses.toFixed(2)}` : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;color:#7c3aed;">${r.driverSalary > 0 ? `-$${r.driverSalary.toFixed(2)}` : "—"}</td>
        <td style="padding:6px 8px;font-size:10.5px;text-align:right;font-weight:700;color:${r.netPayable >= 0 ? "#059669" : "#dc2626"};">${r.netPayable >= 0 ? `$${r.netPayable.toFixed(2)}` : `-$${Math.abs(r.netPayable).toFixed(2)}`}</td>
      </tr>`
    ).join("");

    // Settlement summary box
    // Summary from the sub's perspective: Gross Revenue → sub gross → deductions → net → advance → balance
    const summaryRows = [
      { label: "Gross Revenue (Client Rate × MT)", value: `$${totals.grossRevenue.toFixed(2)}`, color: "#374151", bold: false },
      { label: `Less: Company Commission (${totals.commission > 0 ? ((totals.commission / totals.grossRevenue) * 100).toFixed(1) + "%" : "—"})`, value: `-$${totals.commission.toFixed(2)}`, color: "#6b7280", bold: false },
      { label: "Sub Gross Earnings", value: `$${totals.subGross.toFixed(2)}`, color: "#059669", bold: true, borderTop: true },
      ...(totals.shortCharge > 0 ? [{ label: "Less: Short Delivery Charge", value: `-$${totals.shortCharge.toFixed(2)}`, color: "#dc2626", bold: false }] : []),
      ...(totals.expenses > 0 ? [{ label: "Less: Trip Expenses", value: `-$${totals.expenses.toFixed(2)}`, color: "#d97706", bold: false }] : []),
      ...(totals.driverSalary > 0 ? [{ label: "Less: Driver Salary Allocation", value: `-$${totals.driverSalary.toFixed(2)}`, color: "#7c3aed", bold: false }] : []),
      { label: "Net Payable", value: `$${totals.netPayable.toFixed(2)}`, color: "#059669", bold: true, borderTop: true },
      ...(advanceGiven > 0 ? [{ label: "Less: Advance Given", value: `-$${advanceGiven.toFixed(2)}`, color: "#dc2626", bold: false }] : []),
      ...(advanceGiven > 0 ? [{ label: "Balance Due", value: `$${balanceDue.toFixed(2)}`, color: balanceDue >= 0 ? "#059669" : "#dc2626", bold: true, borderTop: true }] : []),
    ];

    const summaryHtml = summaryRows.map((row: any) =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 14px;${row.borderTop ? "border-top:1.5px solid #e5e7eb;margin-top:2px;" : ""}">
        <span style="font-size:11px;color:#374151;${row.bold ? "font-weight:700;" : ""}">${row.label}</span>
        <span style="font-size:${row.bold ? "13" : "11"}px;font-weight:${row.bold ? "700" : "500"};color:${row.color};font-family:monospace;">${row.value}</span>
      </div>`
    ).join("");

    return `
  <div style="${si > 0 ? "page-break-before:always;padding-top:16px;" : ""}">
    <div style="background:#1e293b;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#f1f5f9;font-size:13px;font-weight:700;">${sub.name}</div>
      <div style="color:#94a3b8;font-size:10px;">${sub.rows.length} trip${sub.rows.length !== 1 ? "s" : ""} · Batch ${batch.name ?? batch.id}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#334155;">
          ${headers.map((h) =>
            `<th style="padding:5px 8px;text-align:${["Truck","Product"].includes(h) ? "left" : "right"};font-size:8.5px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.04em;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;border-top:2px solid #334155;">
          <td colspan="2" style="padding:6px 8px;font-size:10.5px;font-weight:700;">TOTALS</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;">${totals.loaded > 0 ? totals.loaded.toFixed(3) : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;">${totals.delivered > 0 ? totals.delivered.toFixed(3) : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;color:#dc2626;">${totals.shortQty > 0 ? totals.shortQty.toFixed(3) : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;">$${totals.commission.toFixed(2)}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;color:#dc2626;">${totals.shortCharge > 0 ? `-$${totals.shortCharge.toFixed(2)}` : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;color:#d97706;">${totals.expenses > 0 ? `-$${totals.expenses.toFixed(2)}` : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:10.5px;font-weight:700;color:#7c3aed;">${totals.driverSalary > 0 ? `-$${totals.driverSalary.toFixed(2)}` : "—"}</td>
          <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:700;color:${totals.netPayable >= 0 ? "#059669" : "#dc2626"};">$${totals.netPayable.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:6px 0 8px;">
      <div style="padding:4px 14px 6px;font-size:9px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.06em;">Settlement Summary</div>
      ${summaryHtml}
    </div>
  </div>`;
  }).join("");

  return `
<div style="font-family:Arial,sans-serif;color:#111827;background:#fff;width:100%;max-width:900px;margin:0 auto;">
  <div style="background:#0f172a;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoHtml2}
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;">${companyName}</div>
        ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="color:#94a3b8;font-size:10px;">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#f1f5f9;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Subcontractor Settlement Note</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${datePrinted}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Batch Reference</div>
      <div style="font-size:13px;font-weight:700;">${batch.name ?? `Batch #${batch.id}`}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Route</div>
      <div style="font-size:12px;font-weight:600;">${routeLabel}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Subcontractors</div>
      <div style="font-size:13px;font-weight:700;">${subs.length}</div>
    </div>
  </div>

  <div style="padding:16px 0;">
    ${subSections || `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">No active trips found.</div>`}
  </div>

  <div style="margin-top:8px;padding:10px 16px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;">
    Generated by ${companyName} · ${datePrinted} · This document is a subcontractor settlement note only and is not a tax invoice.
  </div>
</div>`;
}

export default function BatchDetail() {
  const [, params] = useRoute("/batches/:id");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id ?? "0");
  const qc = useQueryClient();

  const { data: batch, isLoading } = useGetBatch(id);
  const { data: financials, isLoading: finLoading } = useGetBatchFinancials(id);
  const { data: trucks = [] } = useGetTrucks();
  const { data: drivers = [] } = useGetDrivers();
  const { data: agents = [] } = useGetAgents();
  const { data: company } = useQuery({
    queryKey: ["/api/company-settings"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
  });
  const { mutateAsync: nominate, isPending: nominating } = useNominateTrucks();
  const { mutateAsync: updateBatch, isPending: advancingBatch } = useUpdateBatch();
  const { mutateAsync: updateTrip, isPending: updatingTrip } = useUpdateTrip();
  const { mutateAsync: patchDriverMutate, isPending: savingDriver } = usePatchDriver();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"trips" | "financials">("trips");
  const [showNominate, setShowNominate] = useState(false);
  const [nominations, setNominations] = useState([{ truckId: "", driverId: "", product: "AGO", capacity: "" }]);

  const [qtyDialog, setQtyDialog] = useState<{ tripId: number; type: "loaded" | "delivered"; plate: string } | null>(null);
  const [qty, setQty] = useState("");
  const [cancelDialog, setCancelDialog] = useState<{ tripId: number; plate: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editDriverDialog, setEditDriverDialog] = useState<{ driverId: number; name: string; passportNumber: string; licenseNumber: string; phone: string } | null>(null);

  const [tripRatesDialog, setTripRatesDialog] = useState<{ trip: any; subRatePerMt: string; clientShortRate: string; subShortRate: string } | null>(null);
  const [savingRates, setSavingRates] = useState(false);

  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [selectedTripIds, setSelectedTripIds] = useState<number[]>([]);
  const [raisingInvoice, setRaisingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [advanceBatchError, setAdvanceBatchError] = useState("");
  const [batchInvoices, setBatchInvoices] = useState<{ id: number; invoiceNumber: string; grossRevenue: number }[]>([]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/batches/${id}`] });
    qc.invalidateQueries({ queryKey: [`/api/batches/${id}/financials`] });
    fetchBatchInvoices();
  };

  const fetchBatchInvoices = () => {
    fetch(`/api/batches/${id}/invoices`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setBatchInvoices(data))
      .catch(() => {});
  };

  const openTripRates = (trip: any) => {
    setTripRatesDialog({
      trip,
      subRatePerMt: trip.subRatePerMt != null ? String(trip.subRatePerMt) : "",
      clientShortRate: trip.clientShortRateOverride != null ? String(trip.clientShortRateOverride) : "",
      subShortRate: trip.subShortRateOverride != null ? String(trip.subShortRateOverride) : "",
    });
  };

  const handleSaveRates = async () => {
    if (!tripRatesDialog) return;
    setSavingRates(true);
    try {
      await fetch(`/api/trips/${tripRatesDialog.trip.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subRatePerMt: tripRatesDialog.subRatePerMt ? parseFloat(tripRatesDialog.subRatePerMt) : null,
          clientShortRateOverride: tripRatesDialog.clientShortRate ? parseFloat(tripRatesDialog.clientShortRate) : null,
          subShortRateOverride: tripRatesDialog.subShortRate ? parseFloat(tripRatesDialog.subShortRate) : null,
        }),
      });
      setTripRatesDialog(null);
      invalidate();
    } finally {
      setSavingRates(false);
    }
  };

  // Load invoices for this batch on mount
  useEffect(() => { fetchBatchInvoices(); }, [id]);

  const addNomination = () => setNominations([...nominations, { truckId: "", driverId: "", product: nominations[0]?.product ?? "AGO", capacity: "" }]);
  const removeNomination = (i: number) => setNominations(nominations.filter((_, idx) => idx !== i));
  const updateNomination = (i: number, field: string, value: string) => {
    // When product changes on row 0, cascade to all rows (since the batch is single-product)
    if (field === "product") {
      setNominations(nominations.map((n) => ({ ...n, product: value })));
    } else {
      setNominations(nominations.map((n, idx) => (idx === i ? { ...n, [field]: value } : n)));
    }
  };

  const handleNominate = async () => {
    const valid = nominations.filter((n) => n.truckId && n.capacity);
    if (!valid.length) return;
    // batchProduct is the product already locked for this batch (from existing trips).
    // Always use it when present so the form state default of "AGO" never sneaks through.
    const resolvedProduct = batchProduct;
    try {
      await nominate({
        id,
        data: {
          nominations: valid.map((n) => ({
            truckId: parseInt(n.truckId),
            driverId: n.driverId ? parseInt(n.driverId) : undefined,
            product: (resolvedProduct ?? n.product) as "AGO" | "PMS",
            capacity: parseFloat(n.capacity),
          })),
        },
      });
      invalidate();
      setShowNominate(false);
      setNominations([{ truckId: "", driverId: "", product: resolvedProduct ?? "AGO", capacity: "" }]);
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Nomination failed. Please try again.";
      toast({ variant: "destructive", title: "Cannot nominate", description: msg });
    }
  };

  const advanceTripStatus = async (tripId: number, status: string, extraData?: Record<string, unknown>) => {
    try {
      await updateTrip({ id: tripId, data: { status: status as any, ...extraData } });
      invalidate();
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.blocked && err?.data?.clearanceId) {
        sessionStorage.setItem(
          `pendingAdvance_${id}`,
          JSON.stringify({ tripId, status, extraData: extraData ?? {} }),
        );
        navigate(`/clearances?clearanceId=${err.data.clearanceId}&returnTo=/batches/${id}`);
      }
    }
  };

  useEffect(() => {
    if (!id) return;
    const key = `pendingAdvance_${id}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return;
    sessionStorage.removeItem(key);
    try {
      const { tripId, status, extraData } = JSON.parse(stored);
      updateTrip({ id: tripId, data: { status: status as any, ...extraData } })
        .then(() => invalidate())
        .catch(() => {});
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleTripAdvance = (trip: any) => {
    const next = getTripNext(trip);
    if (!next) return;
    if (next.needsQty) {
      setQty("");
      setQtyDialog({ tripId: trip.id, type: next.needsQty, plate: trip.truckPlate });
    } else {
      advanceTripStatus(trip.id, next.status);
    }
  };

  const handleQtyConfirm = async () => {
    if (!qtyDialog) return;
    const data = qtyDialog.type === "loaded"
      ? { loadedQty: parseFloat(qty) }
      : { deliveredQty: parseFloat(qty) };
    const nextStatus = qtyDialog.type === "loaded" ? "loaded" : "delivered";
    await advanceTripStatus(qtyDialog.tripId, nextStatus, data);
    setQtyDialog(null);
    setQty("");
  };

  const handleSaveDriver = async () => {
    if (!editDriverDialog) return;
    try {
      await patchDriverMutate({
        id: editDriverDialog.driverId,
        data: {
          passportNumber: editDriverDialog.passportNumber || null,
          licenseNumber: editDriverDialog.licenseNumber || null,
          phone: editDriverDialog.phone || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/drivers"] });
      invalidate();
      setEditDriverDialog(null);
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Could not save driver details.";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleCancel = async () => {
    if (!cancelDialog) return;
    await advanceTripStatus(cancelDialog.tripId, "cancelled", { cancellationReason: cancelReason });
    setCancelDialog(null);
    setCancelReason("");
  };

  const handleAdvanceBatch = async () => {
    const next = BATCH_ADVANCE[batch!.status];
    if (!next || next.status === "invoiced") return;
    setAdvanceBatchError("");
    try {
      await updateBatch({ id, data: { status: next.status as any } });
      invalidate();
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? "Could not advance batch status.";
      setAdvanceBatchError(msg);
    }
  };

  const openInvoiceDialog = () => {
    // Only pre-select trips that have revenue AND are not already stamped to an invoice
    const deliveredTripIds = (financials?.tripBreakdown ?? [])
      .filter((t: any) => (t.grossRevenue ?? 0) > 0 && !t.invoiceId)
      .map((t: any) => t.tripId);
    setSelectedTripIds(deliveredTripIds);
    setInvoiceRef("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceDueDate("");
    setInvoiceError("");
    setShowInvoiceDialog(true);
  };

  const handleRaiseInvoice = async () => {
    setInvoiceError("");
    if (selectedTripIds.length === 0) {
      setInvoiceError("Select at least one trip to invoice.");
      return;
    }
    try {
      setRaisingInvoice(true);
      const res = await fetch(`/api/batches/${id}/raise-invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceReference: invoiceRef || undefined,
          invoiceDate: invoiceDate || undefined,
          dueDate: invoiceDueDate || undefined,
          tripIds: selectedTripIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to raise invoice");
      setShowInvoiceDialog(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      if (data.invoiceId) navigate(`/invoices/${data.invoiceId}`);
    } catch (e: any) {
      setInvoiceError(e.message);
    } finally {
      setRaisingInvoice(false);
    }
  };

  const handlePrintClientDoc = () => {
    if (!batch || !financials) return;
    openPrintWindow(generateBatchClientHtml(batch, financials, company), `${batch.name ?? "Batch"} — Freight Completion Note`, "landscape");
  };

  const handlePrintSubNotes = () => {
    if (!batch || !financials) return;
    openPrintWindow(generateBatchSubHtml(batch, financials, company), `${batch.name ?? "Batch"} — Subcontractor Settlement Notes`, "landscape");
  };

  const handleExport = () => {
    if (!batch?.trips) return;
    exportToExcel(
      batch.trips.map((t) => ({
        "Truck": t.truckPlate,
        "Trailer": t.trailerPlate ?? "",
        "Driver": t.driverName ?? "",
        "Subcontractor": t.subcontractorName,
        "Product": t.product,
        "Capacity": t.capacity,
        "Loaded Qty": t.loadedQty ?? "",
        "Delivered Qty": t.deliveredQty ?? "",
        "Status": t.status,
      })),
      `batch-${batch.name}-trips`
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <PageContent>
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
        </PageContent>
      </Layout>
    );
  }

  if (!batch) return null;

  const activeTrips = batch.trips?.filter((t: any) => !["cancelled", "amended_out"].includes(t.status)) ?? [];
  const cancelledTrips = batch.trips?.filter((t: any) => ["cancelled", "amended_out"].includes(t.status)) ?? [];
  // Truck IDs already actively nominated on this batch — used to block duplicates in the nominate dialog
  const nominatedTruckIds = new Set<string>(activeTrips.map((t: any) => String(t.truckId)));
  // Product already established for this batch (first active trip wins) — all new nominations must match
  const batchProduct: string | null = activeTrips.length > 0 ? (activeTrips[0] as any).product ?? null : null;
  const currentStageIndex = BATCH_STAGE_ORDER.indexOf(batch.status);
  const batchAdvance = BATCH_ADVANCE[batch.status];
  const hasTrips = (batch.trips?.length ?? 0) > 0;

  return (
    <Layout>
      <PageHeader
        title={batch.name || `Batch #${id}`}
        subtitle={[
          batch.clientName,
          getRouteLabel(batch.route ?? ""),
          `${formatCurrency(batch.ratePerMt)}/MT`,
          batch.agentId
            ? `via ${(agents as any[]).find((a: any) => a.id === batch.agentId)?.name ?? "Broker"} (${formatCurrency(batch.agentFeePerMt)}/MT fee)`
            : null,
        ].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate("/batches")}>
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Printer className="w-4 h-4 mr-2" />Print / Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handlePrintClientDoc} disabled={!financials}>
                  <Printer className="w-4 h-4 mr-2" />Client Note
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handlePrintSubNotes} disabled={!financials}>
                  <Printer className="w-4 h-4 mr-2" />Sub Settlement Notes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleExport}>
                  <Download className="w-4 h-4 mr-2" />Export to Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => { setNominations([{ truckId: "", driverId: "", product: batchProduct ?? "AGO", capacity: "" }]); setShowNominate(true); }}>
              <Plus className="w-4 h-4 mr-2" />Add Trucks
            </Button>
          </>
        }
      />

      <PageContent>
        {/* ── Workflow Progress Bar ── */}
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between">
            {BATCH_STAGE_ORDER.map((stage, i) => {
              const isDone = i < currentStageIndex;
              const isCurrent = i === currentStageIndex;
              const isUpcoming = i > currentStageIndex;
              return (
                <div key={stage} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      isDone ? "bg-primary border-primary text-white" :
                      isCurrent ? "bg-primary/20 border-primary text-primary" :
                      "bg-secondary border-border text-muted-foreground"
                    }`}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${isCurrent ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                      {BATCH_STAGE_LABELS[stage]}
                    </span>
                  </div>
                  {i < BATCH_STAGE_ORDER.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-4 rounded-full ${i < currentStageIndex ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Invoiced Banner ── */}
        {batch.status === "invoiced" && batchInvoices.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4 mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-green-400">Invoice Raised</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {batchInvoices.map((inv) => inv.invoiceNumber).join(", ")} · {formatCurrency(batchInvoices.reduce((s, i) => s + i.grossRevenue, 0))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {batchInvoices.map((inv) => (
                <Button key={inv.id} size="sm" variant="outline" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <FileText className="w-4 h-4 mr-1.5" />
                  View Invoice
                </Button>
              ))}
              <Button size="sm" onClick={openInvoiceDialog} disabled={finLoading} variant="ghost" className="text-muted-foreground">
                + Raise Another
              </Button>
            </div>
          </div>
        )}

        {/* ── Action Banner ── */}
        {batchAdvance && hasTrips && batch.status !== "invoiced" && batch.status !== "cancelled" && (
          <div className="mb-5">
            <div className="bg-primary/10 border border-primary/30 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary">Next Step: {batchAdvance.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{batchAdvance.description}</p>
              </div>
              {batchAdvance.status === "invoiced" ? (
                <Button onClick={openInvoiceDialog} disabled={finLoading} className="shrink-0">
                  <FileText className="w-4 h-4 mr-2" />
                  Raise Invoice
                </Button>
              ) : (
                <Button onClick={handleAdvanceBatch} disabled={advancingBatch} className="shrink-0">
                  {advancingBatch ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                  {batchAdvance.label}
                </Button>
              )}
            </div>
            {advanceBatchError && (
              <p className="text-xs text-muted-foreground mt-1.5 px-1 leading-relaxed">
                ⚠ {advanceBatchError}
              </p>
            )}
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Trucks</p>
            <p className="text-2xl font-bold text-foreground mt-1">{activeTrips.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Loaded</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(activeTrips.reduce((s: number, t: any) => s + (parseFloat(t.loadedQty) || 0), 0))} MT</p>
          </div>
          {financials && (
            <>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Gross Revenue</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(financials.grossRevenue)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Our Commission</p>
                <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(financials.totalCommission)}</p>
              </div>
            </>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-5 bg-secondary/50 p-1 rounded-lg w-fit">
          {[{ id: "trips", label: "Trip Board" }, { id: "financials", label: "Financials" }].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Trip Board ── */}
        {activeTab === "trips" && (
          <div className="space-y-3">
            {!batch.trips?.length ? (
              <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
                <Truck className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No trucks nominated yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Add trucks to this batch to start the operation</p>
                <Button size="sm" onClick={() => { setNominations([{ truckId: "", driverId: "", product: batchProduct ?? "AGO", capacity: "" }]); setShowNominate(true); }}>
                  <Plus className="w-4 h-4 mr-2" />Nominate Trucks
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {[...activeTrips, ...cancelledTrips].map((trip: any) => {
                  const next = getTripNext(trip);
                  const isCancelled = ["cancelled", "amended_out"].includes(trip.status);
                  return (
                    <div
                      key={trip.id}
                      className={`bg-card border rounded-xl px-5 py-4 flex items-center gap-4 transition-colors ${
                        isCancelled ? "border-border/40 opacity-60" : "border-border hover:border-border/80"
                      }`}
                    >
                      {/* Truck info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/trips/${trip.id}`)}
                            className="font-semibold text-foreground hover:text-primary transition-colors"
                          >
                            {trip.truckPlate}
                          </button>
                          {trip.trailerPlate && (
                            <span className="text-xs text-muted-foreground">/ {trip.trailerPlate}</span>
                          )}
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${trip.product === "AGO" ? "bg-primary/15 text-primary" : "bg-yellow-500/15 text-yellow-400"}`}>
                            {trip.product}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1.5">
                            {trip.driverName ?? "No driver"}
                            {trip.driverId && !isCancelled && batch.status === "planning" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const drv = drivers.find((d) => d.id === trip.driverId);
                                  setEditDriverDialog({ driverId: trip.driverId, name: trip.driverName ?? "", passportNumber: trip.driverPassport ?? "", licenseNumber: trip.driverLicense ?? "", phone: drv?.phone ?? "" });
                                }}
                                className="text-muted-foreground/60 hover:text-primary transition-colors"
                                title="Edit driver documents"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                          {trip.driverId && <><span>·</span><span className={`font-mono ${trip.driverPassport ? "" : "text-amber-400"}`}>{trip.driverPassport ? `PP: ${trip.driverPassport}` : "No passport"}</span></>}
                          {trip.driverId && <><span>·</span><span className={`font-mono ${trip.driverLicense ? "" : "text-amber-400"}`}>{trip.driverLicense ? `Lic: ${trip.driverLicense}` : "No licence"}</span></>}
                          <span>·</span>
                          <span>{trip.subcontractorName}</span>
                          <span>·</span>
                          <span>Cap: {formatNumber(trip.capacity)} MT</span>
                          {trip.loadedQty && <><span>·</span><span>Loaded: {formatNumber(trip.loadedQty)} MT</span></>}
                          {trip.deliveredQty && <><span>·</span><span>Delivered: {formatNumber(trip.deliveredQty)} MT</span></>}
                          {(trip.subRatePerMt != null || trip.clientShortRateOverride != null || trip.subShortRateOverride != null) && (
                            <><span>·</span><span className="text-amber-400 font-semibold">rates overridden</span></>
                          )}
                        </div>
                      </div>

                      {/* Status pill */}
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${trip.status.startsWith("at_checkpoint_") ? "bg-orange-500/20 text-orange-400" : TRIP_STATUS_COLOR[trip.status] ?? "bg-muted text-muted-foreground"}`}>
                        {getTripStatusLabel(trip)}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {next && !isCancelled && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTripAdvance(trip)}
                            disabled={updatingTrip}
                            className="text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                          >
                            {next.label}
                            <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        )}
                        {!isCancelled && ["nominated", "loading"].includes(trip.status) && (
                          <button
                            onClick={() => { setCancelReason(""); setCancelDialog({ tripId: trip.id, plate: trip.truckPlate }); }}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                            title="Cancel trip"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {!isCancelled && (
                          <button
                            onClick={() => openTripRates(trip)}
                            className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                            title="Override rates for this trip"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/trips/${trip.id}`)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                          title="View trip detail"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Financials Tab ── */}
        {activeTab === "financials" && (
          <div className="space-y-6">
            {finLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading financials...</div>
            ) : !financials ? (
              <div className="text-center py-12 text-muted-foreground">No financial data available yet</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Gross Revenue", value: formatCurrency(financials.grossRevenue), color: "text-foreground" },
                    { label: "Commission (Our Cut)", value: formatCurrency(financials.totalCommission), color: "text-primary" },
                    { label: "Short Charges", value: formatCurrency(financials.totalShortCharges), color: "text-destructive" },
                    { label: "Trip Expenses", value: formatCurrency(financials.totalTripExpenses), color: "text-yellow-400" },
                    { label: "Driver Salaries", value: formatCurrency(financials.totalDriverSalaries), color: "text-purple-400" },
                    { label: "Net Payable to Subs", value: formatCurrency(financials.totalNetPayable), color: "text-green-400" },
                  ].map((item) => (
                    <div key={item.label} className="bg-card border border-border rounded-xl p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Trip-by-Trip Breakdown</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        {["Truck", "Product", "Gross Revenue", "Commission", "Short Charge", "Expenses", "Driver Salary", "Net Payable"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {financials.tripBreakdown?.map((t: any) => (
                        <tr key={t.tripId} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                          <td className="px-4 py-3 font-medium">{t.truckPlate}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-primary">{t.product}</td>
                          <td className="px-4 py-3 text-muted-foreground">{t.grossRevenue != null ? formatCurrency(t.grossRevenue) : "-"}</td>
                          <td className="px-4 py-3 text-primary">{t.commission != null ? formatCurrency(t.commission) : "-"}</td>
                          <td className="px-4 py-3 text-destructive">{t.shortCharge != null ? formatCurrency(t.shortCharge) : "-"}</td>
                          <td className="px-4 py-3 text-yellow-400">{formatCurrency(t.tripExpensesTotal)}</td>
                          <td className="px-4 py-3 text-purple-400">{formatCurrency(t.driverSalaryAllocation)}</td>
                          <td className="px-4 py-3 font-semibold text-green-400">{t.netPayable != null ? formatCurrency(t.netPayable) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </PageContent>

      {/* ── Nominate Trucks Modal ── */}
      <Dialog open={showNominate} onOpenChange={setShowNominate}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nominate Trucks to Batch</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {nominations.map((n, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 items-start p-3 bg-secondary/30 rounded-lg">
                <div>
                  <Label className="text-xs">Truck *</Label>
                  <Select value={n.truckId} onValueChange={(v) => updateNomination(i, "truckId", v)}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select truck" /></SelectTrigger>
                    <SelectContent>
                      {trucks.filter((t: any) => t.status === "available" || t.status === "idle").map((t: any) => {
                        const alreadyOnBatch = nominatedTruckIds.has(String(t.id));
                        const selectedElsewhere = nominations.some((nom, j) => j !== i && nom.truckId === String(t.id));
                        const blocked = alreadyOnBatch || selectedElsewhere;
                        return (
                          <SelectItem key={t.id} value={String(t.id)} disabled={blocked}>
                            <span className={blocked ? "text-muted-foreground" : ""}>
                              {t.plateNumber}
                              {alreadyOnBatch && " — already on batch"}
                              {!alreadyOnBatch && selectedElsewhere && " — selected above"}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Driver</Label>
                  <Select value={n.driverId} onValueChange={(v) => updateNomination(i, "driverId", v)}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select driver" /></SelectTrigger>
                    <SelectContent>
                      {drivers.filter((d) => d.status === "active").map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          <span className="flex items-center gap-2">
                            <span>{d.name}</span>
                            {(!d.passportNumber || !d.licenseNumber) && (
                              <span className="text-amber-400 text-xs">⚠</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {n.driverId && (() => {
                    const drv = drivers.find((d) => d.id === parseInt(n.driverId));
                    if (!drv) return null;
                    return (
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {drv.passportNumber
                          ? <span className="font-mono">PP: {drv.passportNumber}</span>
                          : <span className="text-amber-400">No passport</span>}
                        <span>·</span>
                        {drv.licenseNumber
                          ? <span className="font-mono">Lic: {drv.licenseNumber}</span>
                          : <span className="text-amber-400">No licence</span>}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label className="text-xs">
                    Product *
                    {batchProduct && <span className="ml-1 text-muted-foreground font-normal">(locked)</span>}
                  </Label>
                  <Select
                    value={batchProduct ?? n.product}
                    onValueChange={(v) => updateNomination(i, "product", v)}
                    disabled={!!batchProduct || i > 0}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AGO">AGO</SelectItem>
                      <SelectItem value="PMS">PMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Capacity (MT) *</Label>
                  <Input
                    type="number"
                    value={n.capacity}
                    onChange={(e) => updateNomination(i, "capacity", e.target.value)}
                    className="mt-1 h-8 text-xs"
                    placeholder="0.000"
                  />
                </div>
                <button
                  onClick={() => removeNomination(i)}
                  className="text-destructive hover:text-destructive/80 transition-colors pb-1"
                  disabled={nominations.length === 1}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={addNomination} className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add another truck
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNominate(false)}>Cancel</Button>
            <Button onClick={handleNominate} disabled={nominating}>
              {nominating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              {nominating ? "Nominating..." : `Nominate ${nominations.filter((n) => n.truckId).length || ""} Truck${nominations.filter((n) => n.truckId).length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quantity Input Dialog ── */}
      <Dialog open={!!qtyDialog} onOpenChange={(o) => { if (!o) setQtyDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {qtyDialog?.type === "loaded" ? "Enter Loaded Quantity" : "Enter Delivered Quantity"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground mb-3">Truck: <span className="font-semibold text-foreground">{qtyDialog?.plate}</span></p>
            <Label>{qtyDialog?.type === "loaded" ? "Loaded Quantity (MT)" : "Delivered Quantity (MT)"}</Label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1"
              placeholder="0.000"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQtyDialog(null)}>Cancel</Button>
            <Button onClick={handleQtyConfirm} disabled={!qty || isNaN(parseFloat(qty))}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Trip Dialog ── */}
      <Dialog open={!!cancelDialog} onOpenChange={(o) => { if (!o) setCancelDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancel Trip</DialogTitle></DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground mb-3">Cancelling truck: <span className="font-semibold text-foreground">{cancelDialog?.plate}</span></p>
            <Label>Reason (optional)</Label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1"
              placeholder="e.g. Mechanical failure"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>Keep Trip</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Raise Invoice Dialog ── */}
      <Dialog open={showInvoiceDialog} onOpenChange={(o) => { if (!o) setShowInvoiceDialog(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Raise Invoice — {batch?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Lock warning */}
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Once raised, this batch is locked as <strong>Invoiced</strong> and cannot be reverted while the invoice is active. To redo an invoice, cancel it first — this will unlock the batch and clear the trip stamps.</span>
            </div>
            {/* Invoice details */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Invoice Reference <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="mt-1"
                  placeholder="Auto: INV-0001"
                />
              </div>
              <div>
                <Label className="text-xs">Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Trip selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select Trips to Invoice</Label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedTripIds((financials?.tripBreakdown ?? []).filter((t: any) => (t.grossRevenue ?? 0) > 0 && !t.invoiceId).map((t: any) => t.tripId))}
                    className="text-primary hover:underline"
                  >All</button>
                  <span className="text-muted-foreground">·</span>
                  <button type="button" onClick={() => setSelectedTripIds([])} className="text-muted-foreground hover:underline">None</button>
                </div>
              </div>
              <div className="space-y-1 max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {(financials?.tripBreakdown ?? [])
                  .filter((t: any) => (t.grossRevenue ?? 0) > 0)
                  .map((t: any) => {
                    const alreadyInvoiced = !!t.invoiceId;
                    const checked = selectedTripIds.includes(t.tripId);
                    return (
                      <label
                        key={t.tripId}
                        className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${alreadyInvoiced ? "opacity-50 cursor-not-allowed bg-muted/30" : checked ? "bg-primary/5 cursor-pointer" : "hover:bg-muted/40 cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyInvoiced}
                          onChange={(e) => {
                            if (alreadyInvoiced) return;
                            setSelectedTripIds(e.target.checked
                              ? [...selectedTripIds, t.tripId]
                              : selectedTripIds.filter((x) => x !== t.tripId)
                            );
                          }}
                          className="rounded accent-primary"
                        />
                        <span className="flex-1 text-sm font-medium text-foreground">{t.truckPlate}</span>
                        <span className="text-xs text-muted-foreground">{t.product}</span>
                        {alreadyInvoiced && <span className="text-xs text-amber-600 font-medium">Invoiced</span>}
                        <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(t.grossRevenue)}</span>
                      </label>
                    );
                  })}
                {(financials?.tripBreakdown ?? []).filter((t: any) => (t.grossRevenue ?? 0) > 0).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No delivered trips with revenue found.</p>
                )}
              </div>
            </div>

            {/* Total */}
            {selectedTripIds.length > 0 && (() => {
              const total = (financials?.tripBreakdown ?? [])
                .filter((t: any) => selectedTripIds.includes(t.tripId))
                .reduce((s: number, t: any) => s + (t.grossRevenue ?? 0), 0);
              return (
                <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/30 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">
                    Invoice Total <span className="text-muted-foreground">({selectedTripIds.length} trip{selectedTripIds.length !== 1 ? "s" : ""})</span>
                  </span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
                </div>
              );
            })()}

            {invoiceError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{invoiceError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>Cancel</Button>
            <Button onClick={handleRaiseInvoice} disabled={raisingInvoice || selectedTripIds.length === 0}>
              {raisingInvoice ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              {raisingInvoice ? "Raising..." : `Raise Invoice`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Driver Dialog (batch planning context) */}
      <Dialog open={!!editDriverDialog} onOpenChange={() => setEditDriverDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Driver Documents — {editDriverDialog?.name}</DialogTitle></DialogHeader>
          {editDriverDialog && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">Update cross-border document details for this driver. Changes save directly to the driver record.</p>
              <div>
                <Label>Passport Number</Label>
                <Input
                  value={editDriverDialog.passportNumber}
                  onChange={(e) => setEditDriverDialog({ ...editDriverDialog, passportNumber: e.target.value })}
                  className="mt-1 font-mono"
                  placeholder="e.g. A12345678"
                />
              </div>
              <div>
                <Label>License Number</Label>
                <Input
                  value={editDriverDialog.licenseNumber}
                  onChange={(e) => setEditDriverDialog({ ...editDriverDialog, licenseNumber: e.target.value })}
                  className="mt-1 font-mono"
                  placeholder="e.g. TZ-1234567"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={editDriverDialog.phone}
                  onChange={(e) => setEditDriverDialog({ ...editDriverDialog, phone: e.target.value })}
                  className="mt-1"
                  placeholder="+255 7xx xxx xxx"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDriverDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveDriver} disabled={savingDriver}>{savingDriver ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Trip Rate Overrides Dialog ── */}
      <Dialog open={!!tripRatesDialog} onOpenChange={(o) => { if (!o) setTripRatesDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rate Overrides — {tripRatesDialog?.trip.truckPlate}</DialogTitle>
          </DialogHeader>
          {tripRatesDialog && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Batch rate: <span className="font-semibold text-foreground">{formatCurrency(batch?.ratePerMt)}/MT</span>
                {batch?.agentId && (
                  <> · Broker fee: <span className="font-semibold text-foreground">{formatCurrency(batch?.agentFeePerMt)}/MT</span></>
                )}
              </div>
              <div>
                <Label className="text-xs">Sub Rate/MT (USD)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={tripRatesDialog.subRatePerMt}
                  onChange={(e) => setTripRatesDialog({ ...tripRatesDialog, subRatePerMt: e.target.value })}
                  placeholder="Default from sub profile"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Client Short Rate/MT</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={tripRatesDialog.clientShortRate}
                    onChange={(e) => setTripRatesDialog({ ...tripRatesDialog, clientShortRate: e.target.value })}
                    placeholder="Default"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Sub Short Rate/MT</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={tripRatesDialog.subShortRate}
                    onChange={(e) => setTripRatesDialog({ ...tripRatesDialog, subShortRate: e.target.value })}
                    placeholder="Default"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTripRatesDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveRates} disabled={savingRates}>{savingRates ? "Saving..." : "Save Overrides"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
