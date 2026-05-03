import { useState, useMemo, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";
import { useClosedPeriodConfirm } from "@/hooks/useClosedPeriodConfirm";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ArrowRight, Truck, User, Plus, Trash2, Printer, Search, FileText, Wrench, ShieldCheck } from "lucide-react";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { format } from "date-fns";
import { CorrectClosedEntryDialog, type CorrectionEntry } from "@/components/CorrectClosedEntryDialog";

const STATUS_COLOR: Record<string, string> = {
  available: "bg-green-500/10 text-green-400 border-green-500/20",
  idle: "bg-muted text-muted-foreground border-border",
  on_trip: "bg-primary/10 text-primary border-primary/20",
  maintenance: "bg-red-500/10 text-red-400 border-red-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  available: "Available", idle: "Idle", on_trip: "On Trip", maintenance: "Maintenance",
};
const TRIP_STATUS_COLOR: Record<string, string> = {
  nominated: "bg-muted text-muted-foreground",
  loading: "bg-yellow-500/10 text-yellow-400",
  loaded: "bg-blue-500/10 text-blue-400",
  in_transit: "bg-primary/10 text-primary",
  at_zambia_entry: "bg-orange-500/10 text-orange-400",
  at_drc_entry: "bg-purple-500/10 text-purple-400",
  delivered: "bg-green-500/10 text-green-400",
  completed: "bg-emerald-500/10 text-emerald-400",
  cancelled: "bg-red-500/10 text-red-400",
  amended_out: "bg-orange-500/10 text-orange-400",
};
const EXPENSE_CATEGORIES = ["maintenance", "tyres", "repairs", "fuel", "driver_salary", "other"];
const EXPENSE_LABEL: Record<string, string> = {
  maintenance: "Maintenance",
  tyres: "Tyres",
  repairs: "Repairs",
  fuel: "Fuel",
  driver_salary: "Driver Salary",
  other: "Other",
};
const expenseLabel = (cat: string) => EXPENSE_LABEL[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type TruckDetailData = {
  truck: {
    id: number; plateNumber: string; trailerPlate: string | null; subcontractorId: number | null;
    companyOwned?: boolean; subcontractorName: string | null; commissionRate: string | null; status: string; notes: string | null; createdAt: string;
    insurerName: string | null; policyNumber: string | null; coverageAmount: string | null; premiumAmount: string | null; insuranceExpiry: string | null;
  };
  driverAssignments: { id: number; driverId: number; driverName: string | null; assignedAt: string; unassignedAt: string | null }[];
  trips: {
    id: number; status: string; loadedQty: number | null; deliveredQty: number | null; product: string | null;
    createdAt: string; batchName: string | null; route: string | null; ratePerMt: number | null;
    grossRevenue: number; commission: number; tripExpenses: number; netContribution: number;
    shortQty: number | null; allowancePct: number | null; allowanceQty: number | null; chargeableShort: number | null; shortCharge: number | null; clientShortCharge: number | null;
  }[];
  otherExpenses: { id: number; costType: string; description: string | null; amount: number; currency: string; expenseDate: string }[];
  summary: { totalTrips: number; totalRevenue: number; totalCommission: number; totalTripExpenses: number; totalOtherExpenses: number; netProfit: number };
};

import { getRouteLabel } from "@/lib/routes";

function generateTruckProfileHtml(opts: {
  truck: TruckDetailData["truck"];
  currentDriver: TruckDetailData["driverAssignments"][0] | undefined;
  filteredTrips: TruckDetailData["trips"];
  filteredExpenses: TruckDetailData["otherExpenses"];
  driverAssignments: TruckDetailData["driverAssignments"];
  filteredTripRevenue: number; filteredTripCommission: number; filteredTripExp: number;
  filteredExpTotal: number; filteredMaintenanceCostUsd: number; filteredNetContribution: number;
  filteredTripShortCharge: number; filteredTripNet: number;
  printedAt: string; dateFrom: string; dateTo: string; tripStatus: string; expCategory: string;
  company: any;
}): string {
  const {
    truck, currentDriver, filteredTrips, filteredExpenses, driverAssignments,
    filteredTripRevenue, filteredTripCommission, filteredTripExp, filteredExpTotal,
    filteredMaintenanceCostUsd, filteredNetContribution, filteredTripShortCharge, filteredTripNet,
    printedAt, dateFrom, dateTo, tripStatus, expCategory, company,
  } = opts;
  const C = (v: number) => `$${v.toFixed(2)}`;
  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");

  const activeTrips = filteredTrips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

  const kpis = [
    { label: "Trips", value: filteredTrips.length.toString() },
    { label: "Gross Revenue", value: C(filteredTripRevenue) },
    { label: "Commission", value: C(filteredTripCommission) },
    { label: "Trip Expenses", value: C(filteredTripExp) },
    { label: "Other Expenses", value: C(filteredExpTotal) },
    { label: "Maintenance (USD)", value: C(filteredMaintenanceCostUsd) },
    { label: "Net Contribution", value: C(filteredNetContribution) },
  ];

  const tripRows = filteredTrips.map((t, i) => {
    const sc = t.shortCharge ?? t.clientShortCharge;
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:5px 6px;font-size:10px;white-space:nowrap;">${formatDate(t.createdAt)}</td>
      <td style="padding:5px 6px;font-size:10px;">${t.batchName ?? `#${t.id}`}</td>
      <td style="padding:5px 6px;font-size:10px;white-space:nowrap;">${getRouteLabel(t.route ?? "")}</td>
      <td style="padding:5px 6px;font-size:10px;">${t.product ?? "—"}</td>
      <td style="padding:5px 6px;font-size:10px;text-transform:capitalize;">${t.status.replace(/_/g, " ")}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;">${t.loadedQty ?? "—"}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;">${t.deliveredQty ?? "—"}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;">${sc != null && sc > 0 ? C(sc) : "—"}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;">${C(t.grossRevenue)}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;">${t.tripExpenses > 0 ? C(t.tripExpenses) : "—"}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;font-weight:700;">${C(t.netContribution)}</td>
    </tr>`;
  }).join("");

  const expRows = filteredExpenses.map((e, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:5px 8px;font-size:10px;white-space:nowrap;">${formatDate(e.expenseDate)}</td>
      <td style="padding:5px 8px;font-size:10px;">${expenseLabel(e.costType)}</td>
      <td style="padding:5px 8px;font-size:10px;color:#555;">${e.description ?? "—"}</td>
      <td style="padding:5px 8px;font-size:10px;text-align:right;font-weight:600;">${C(e.amount)}</td>
      <td style="padding:5px 8px;font-size:10px;text-align:center;">${e.currency}</td>
    </tr>`
  ).join("");

  const driverRows = driverAssignments.map((d, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:5px 8px;font-size:10px;font-weight:600;">${d.driverName ?? `Driver #${d.driverId}`}</td>
      <td style="padding:5px 8px;font-size:10px;">${format(new Date(d.assignedAt), "dd MMM yyyy")}</td>
      <td style="padding:5px 8px;font-size:10px;">${d.unassignedAt ? format(new Date(d.unassignedAt), "dd MMM yyyy") : "—"}</td>
      <td style="padding:5px 8px;font-size:10px;">${d.unassignedAt ? "Past" : "Current"}</td>
    </tr>`
  ).join("");

  return `<div style="font-family:Arial,sans-serif;color:#111;background:#fff;padding:16px 20px;max-width:960px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid #111;margin-bottom:16px;">
    <div>
      <div style="font-size:20px;font-weight:700;">${truck.plateNumber}</div>
      ${truck.trailerPlate ? `<div style="font-size:11px;color:#555;margin-top:2px;">Trailer: ${truck.trailerPlate}</div>` : ""}
      <div style="font-size:11px;color:#555;margin-top:2px;">
        ${truck.companyOwned ? "Company Fleet · No commission" : `${truck.subcontractorName ?? "—"}${truck.commissionRate ? ` · ${truck.commissionRate}% commission` : ""}`}
        · <strong>${STATUS_LABEL[truck.status] ?? truck.status}</strong>
      </div>
      ${currentDriver ? `<div style="font-size:11px;color:#555;margin-top:2px;">Driver: ${currentDriver.driverName}</div>` : ""}
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#555;">${companyName}</div>
      ${companyAddress ? `<div style="font-size:10px;color:#888;">${companyAddress}</div>` : ""}
      <div style="font-size:10px;color:#888;margin-top:2px;">Printed ${printedAt}</div>
      ${(dateFrom || dateTo) ? `<div style="font-size:10px;color:#888;">Period: ${dateFrom || "—"} to ${dateTo || "—"}</div>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:20px;">
    ${kpis.map((k) => `<div style="border:1px solid #ddd;border-radius:4px;padding:10px 8px;">
      <div style="font-size:9px;color:#888;text-transform:uppercase;margin-bottom:4px;">${k.label}</div>
      <div style="font-size:12px;font-weight:700;font-family:monospace;">${k.value}</div>
    </div>`).join("")}
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:13px;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:8px;">
      Trips (${filteredTrips.length})${tripStatus !== "all" ? ` — filter: ${tripStatus}` : ""}
    </div>
    ${filteredTrips.length === 0 ? `<p style="font-size:11px;color:#888;font-style:italic;">No trips match the current filter.</p>` : `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #aaa;background:#f9f9f9;">
          ${["Date","Batch","Route","Product","Status","Loaded (MT)","Delivered (MT)","Short Chg","Gross","Trip Exp.","Net Contrib."].map((h) =>
            `<th style="padding:6px 6px;font-size:9px;font-weight:700;text-align:${["Loaded (MT)","Delivered (MT)","Short Chg","Gross","Trip Exp.","Net Contrib."].includes(h) ? "right" : "left"};text-transform:uppercase;color:#555;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>${tripRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #aaa;background:#f0fdf4;">
          <td colspan="7" style="padding:6px 6px;font-size:10px;font-weight:700;">Totals (${activeTrips.length} active)</td>
          <td style="padding:6px 6px;font-size:10px;font-weight:700;text-align:right;">${filteredTripShortCharge > 0 ? C(filteredTripShortCharge) : "—"}</td>
          <td style="padding:6px 6px;font-size:10px;font-weight:700;text-align:right;">${C(filteredTripRevenue)}</td>
          <td style="padding:6px 6px;font-size:10px;font-weight:700;text-align:right;">${C(filteredTripExp)}</td>
          <td style="padding:6px 6px;font-size:10px;font-weight:700;text-align:right;">${C(filteredTripNet)}</td>
        </tr>
      </tfoot>
    </table>`}
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:13px;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:8px;">
      Other Expenses (${filteredExpenses.length})${expCategory !== "all" ? ` — ${expCategory}` : ""}
    </div>
    ${filteredExpenses.length === 0 ? `<p style="font-size:11px;color:#888;font-style:italic;">No other expenses recorded.</p>` : `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #aaa;background:#f9f9f9;">
          ${["Date","Category","Description","Amount","Currency"].map((h) =>
            `<th style="padding:6px 8px;font-size:9px;font-weight:700;text-align:${h === "Amount" ? "right" : h === "Currency" ? "center" : "left"};text-transform:uppercase;color:#555;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>${expRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #aaa;background:#f9f9f9;">
          <td colspan="3" style="padding:6px 8px;font-size:10px;font-weight:700;">Total</td>
          <td style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;">${C(filteredExpTotal)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`}
  </div>

  <div>
    <div style="font-size:13px;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:8px;">
      Driver History (${driverAssignments.length})
    </div>
    ${driverAssignments.length === 0 ? `<p style="font-size:11px;color:#888;font-style:italic;">No driver assignments recorded.</p>` : `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #aaa;background:#f9f9f9;">
          ${["Driver","From","To","Status"].map((h) =>
            `<th style="padding:6px 8px;font-size:9px;font-weight:700;text-align:left;text-transform:uppercase;color:#555;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>${driverRows}</tbody>
    </table>`}
  </div>
</div>`;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export default function TruckDetail() {
  const [, params] = useRoute("/fleet/:id");
  const id = parseInt(params?.id ?? "0");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canCorrect = !!user && ["accounts", "manager", "admin", "owner", "system"].includes(user.role);

  const [activeTab, setActiveTab] = useState<"trips" | "drivers" | "expenses" | "documents" | "maintenance">(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    return (["trips", "drivers", "expenses", "documents", "maintenance"] as const).includes(t as any) ? t as any : "trips";
  });

  // Maintenance state
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    type: "service",
    description: "",
    cost: "",
    currency: "USD",
    odometer: "",
    mechanic: "",
    nextServiceDate: "",
  });
  const [addingMaintenance, setAddingMaintenance] = useState(false);
  const [confirmDeleteMaintenanceId, setConfirmDeleteMaintenanceId] = useState<number | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // Link to Trip
  const [linkExpense, setLinkExpense] = useState<{ id: number; costType: string } | null>(null);
  const [linkTripId, setLinkTripId] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<number | null>(null);
  const pendingDeleteExpenseRef = useRef<CorrectionEntry | null>(null);
  const [expenseCorrectionTarget, setExpenseCorrectionTarget] = useState<CorrectionEntry | null>(null);

  const handleLinkToTrip = async () => {
    if (!linkExpense || !linkTripId) { setLinkError("Please select a trip."); return; }
    setLinking(true); setLinkError("");
    try {
      const res = await fetch(`/api/expenses/${linkExpense.id}/link-trip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tripId: parseInt(linkTripId) }),
      });
      const data = await res.json();
      if (!res.ok) { setLinkError(data.error ?? "Failed to link expense."); return; }
      setLinkExpense(null);
      qc.invalidateQueries({ queryKey: [`/api/trucks/${id}/detail`] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense linked to trip" });
    } finally { setLinking(false); }
  };
  const [expenseForm, setExpenseForm] = useState({
    costType: "maintenance", description: "", amount: "", currency: "USD",
    expenseDate: format(new Date(), "yyyy-MM-dd"), paymentMethod: "petty_cash", supplierId: "", bankAccountId: "",
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts", { credentials: "include" }).then((r) => r.json()),
  });
  const [addingExpense, setAddingExpense] = useState(false);

  // Maintenance records
  const { data: maintenanceRecords = [], refetch: refetchMaintenance } = useQuery<any[]>({
    queryKey: [`/api/maintenance/trucks/${id}`],
    queryFn: () => fetch(`/api/maintenance/trucks/${id}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
  });

  // Shared period filter (drives KPIs + both tabs)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Trip filters (tab-level, beyond the period)
  const [tripStatus, setTripStatus] = useState("all");
  const [tripSearch, setTripSearch] = useState("");

  // Trip pagination — default 10, user expands on demand
  const TRIPS_PAGE_SIZE = 10;
  const [tripsLimit, setTripsLimit] = useState(TRIPS_PAGE_SIZE);

  // Expense filters (tab-level)
  const [expCategory, setExpCategory] = useState("all");

  const { data, isLoading, isError } = useQuery<TruckDetailData>({
    queryKey: [`/api/trucks/${id}/detail`],
    queryFn: () => fetch(`/api/trucks/${id}/detail`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!id,
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: number) => {
      const res = await fetch(`/api/trucks/${id}/expenses/${expenseId}`, { method: "DELETE", credentials: "include" });
      await throwOnApiError(res);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/trucks/${id}/detail`] }); toast({ title: "Expense removed" }); },
    onError: (e: any) => {
      if (e?.status === 409 && pendingDeleteExpenseRef.current && canCorrect) {
        setExpenseCorrectionTarget(pendingDeleteExpenseRef.current);
        return;
      }
      toast({ variant: "destructive", title: "Couldn't delete expense", description: getErrorMessage(e, "Failed to delete expense") });
    },
  });

  const { confirm: confirmClosedPeriod, dialog: closedPeriodDialog } = useClosedPeriodConfirm();
  async function handleAddExpense() {
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" }); return;
    }
    if (!(await confirmClosedPeriod(expenseForm.expenseDate))) return;
    setAddingExpense(true);
    try {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...expenseForm,
          amount: parseFloat(expenseForm.amount),
          truckId: id,
          subcontractorId: data?.truck?.subcontractorId ?? null,
          tier: "truck",
          paymentMethod: expenseForm.paymentMethod,
          supplierId: expenseForm.paymentMethod === "fuel_credit" && expenseForm.supplierId ? parseInt(expenseForm.supplierId) : null,
          bankAccountId: expenseForm.paymentMethod === "bank_transfer" && expenseForm.bankAccountId ? parseInt(expenseForm.bankAccountId) : null,
        }),
      });
      await throwOnApiError(r);
      const result = await r.json();
      await qc.invalidateQueries({ queryKey: [`/api/trucks/${id}/detail`] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      setShowAddExpense(false);
      setExpenseForm({ costType: "maintenance", description: "", amount: "", currency: "USD", expenseDate: format(new Date(), "yyyy-MM-dd"), paymentMethod: "petty_cash", supplierId: "", bankAccountId: "" });
      if (result?.posting?.bumped) {
        toast({
          title: `Posted to ${result.posting.date}`,
          description: `${result.posting.closedPeriodName} is closed — original date ${result.posting.originalDate} preserved in description.`,
        });
      } else {
        toast({ title: "Expense recorded" });
      }
    } catch (e) { toast({ title: "Couldn't save expense", description: getErrorMessage(e, "Failed to save expense"), variant: "destructive" }); }
    finally { setAddingExpense(false); }
  }

  const { truck, driverAssignments, trips, otherExpenses, summary } = data ?? {
    truck: null, driverAssignments: [], trips: [], otherExpenses: [], summary: null,
  };

  const currentDriver = driverAssignments.find((d) => !d.unassignedAt);

  const filteredTrips = useMemo(() => {
    return (trips ?? []).filter((t) => {
      if (tripStatus === "active" && ["cancelled", "amended_out"].includes(t.status)) return false;
      if (tripStatus !== "all" && tripStatus !== "active" && t.status !== tripStatus) return false;
      const d = t.createdAt?.slice(0, 10) ?? "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (tripSearch) {
        const q = tripSearch.toLowerCase();
        return [t.batchName, t.route, t.product, t.status].some((f) => f?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [trips, tripStatus, dateFrom, dateTo, tripSearch]);

  const filteredExpenses = useMemo(() => {
    return (otherExpenses ?? []).filter((e) => {
      if (expCategory !== "all" && e.costType !== expCategory) return false;
      const d = e.expenseDate?.slice(0, 10) ?? "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [otherExpenses, expCategory, dateFrom, dateTo]);

  // Derived totals for filtered data — these drive both KPIs and table footers
  const filteredTripRevenue = filteredTrips.reduce((s, t) => s + t.grossRevenue, 0);
  const filteredTripCommission = filteredTrips.reduce((s, t) => s + t.commission, 0);
  const filteredTripExp = filteredTrips.reduce((s, t) => s + t.tripExpenses, 0);
  const filteredExpTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const filteredTripNet = filteredTrips.reduce((s, t) => s + t.netContribution, 0);
  // Short charge (USD) — sub penalty for sub trucks, client credit for company fleet
  const filteredTripShortCharge = filteredTrips
    .filter((t) => !["cancelled", "amended_out"].includes(t.status))
    .reduce((s, t) => s + (t.shortCharge ?? t.clientShortCharge ?? 0), 0);

  // Maintenance records filtered by the same period as expenses
  const filteredMaintenance = useMemo(() => {
    return (maintenanceRecords ?? []).filter((r: any) => {
      const d = r.date?.slice(0, 10) ?? "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [maintenanceRecords, dateFrom, dateTo]);

  // Only USD costs feed into the net contribution (other currencies shown separately)
  const filteredMaintenanceCostUsd = filteredMaintenance
    .filter((r: any) => r.currency === "USD" && r.cost)
    .reduce((s: number, r: any) => s + parseFloat(r.cost), 0);

  // Non-USD maintenance totals per currency for the KPI sub-label
  const maintenanceNonUsd = filteredMaintenance
    .filter((r: any) => r.currency !== "USD" && r.cost)
    .reduce((acc: Record<string, number>, r: any) => {
      acc[r.currency] = (acc[r.currency] ?? 0) + parseFloat(r.cost);
      return acc;
    }, {} as Record<string, number>);

  const filteredNetContribution = filteredTripNet - filteredExpTotal - filteredMaintenanceCostUsd;

  // Paginated slice — totals always come from the full filteredTrips
  const pagedTrips = filteredTrips.slice(0, tripsLimit);
  const hasMore = filteredTrips.length > tripsLimit;
  const remaining = filteredTrips.length - tripsLimit;

  const isPeriodActive = !!(dateFrom || dateTo);

  const printedAt = format(new Date(), "dd MMM yyyy, HH:mm");

  const handlePrint = () => {
    if (!truck) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const html = generateTruckProfileHtml({
      truck, currentDriver, filteredTrips, filteredExpenses, driverAssignments,
      filteredTripRevenue, filteredTripCommission, filteredTripExp, filteredExpTotal,
      filteredMaintenanceCostUsd, filteredNetContribution, filteredTripShortCharge, filteredTripNet,
      printedAt, dateFrom, dateTo, tripStatus, expCategory, company: companySettings,
    });
    w.document.write(`<!DOCTYPE html><html><head><title>${truck.plateNumber} — Truck Profile</title><style>*{box-sizing:border-box;}body{margin:0;padding:0;background:#fff;}@media print{@page{size:A4 landscape;margin:8mm;}}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 350);
  };

  if (isLoading) {
    return (
      <Layout>
        <PageHeader title="Truck Detail" />
        <PageContent><div className="text-center py-16 text-muted-foreground">Loading truck data...</div></PageContent>
      </Layout>
    );
  }
  if (isError || !data || !truck) {
    return (
      <Layout>
        <PageHeader title="Truck Not Found" />
        <PageContent><div className="text-center py-16 text-muted-foreground">This truck could not be found.</div></PageContent>
      </Layout>
    );
  }

  return (
    <Layout>
      {closedPeriodDialog}
      {/* ── Screen header ── */}
      <PageHeader
        title={truck.plateNumber}
        subtitle={truck.trailerPlate ? `Trailer: ${truck.trailerPlate}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/fleet">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Fleet
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        }
      />

      <PageContent>
        <div className="space-y-5">
          {/* Truck info strip */}
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground font-mono">{truck.plateNumber}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {truck.companyOwned ? "Company Fleet" : (truck.subcontractorName ?? "No subcontractor")}
                  {!truck.companyOwned && truck.commissionRate ? ` · ${truck.commissionRate}% commission` : ""}
                  {truck.companyOwned ? " · No commission" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", STATUS_COLOR[truck.status] ?? "bg-muted text-muted-foreground border-border")}>
                {STATUS_LABEL[truck.status] ?? truck.status}
              </span>
              {currentDriver ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" /> {currentDriver.driverName ?? "Driver"}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <User className="w-3 h-3" /> No driver assigned
                </span>
              )}
            </div>
          </div>

          {/* Insurance info card */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Insurance</span>
              </div>
              <Link href="/insurance-claims">
                <button className="text-xs text-primary hover:underline">View Claims →</button>
              </Link>
            </div>
            {truck.insurerName || truck.policyNumber ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Insurer</p>
                  <p className="font-medium">{truck.insurerName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Policy</p>
                  <p className="font-medium font-mono">{truck.policyNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Coverage</p>
                  <p className="font-medium font-mono">{truck.coverageAmount ? formatCurrency(parseFloat(truck.coverageAmount)) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expiry</p>
                  <p className={cn("font-medium font-mono",
                    truck.insuranceExpiry && truck.insuranceExpiry < new Date().toISOString().slice(0, 10) ? "text-red-400" : ""
                  )}>{truck.insuranceExpiry ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No insurance data configured. Edit this truck in the Fleet list to add policy details.</p>
            )}
          </div>

          {/* Period filter — lives above KPIs so they react instantly */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Period:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-7 text-xs w-32 border-border/60" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-7 text-xs w-32 border-border/60" />
            {isPeriodActive && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/60">
                Clear
              </button>
            )}
            {isPeriodActive && (
              <span className="text-xs text-primary font-medium">KPIs showing filtered period</span>
            )}
          </div>

          {/* KPI Cards — values react to the period filter */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: "Trips", value: filteredTrips.length.toString(), sub: isPeriodActive ? `of ${trips.length} total` : `${trips.length} recorded`, accent: undefined },
              { label: "Gross Revenue", value: formatCurrency(filteredTripRevenue), accent: "green" as const },
              { label: "Commission", value: formatCurrency(filteredTripCommission), accent: "amber" as const },
              { label: "Trip Expenses", value: formatCurrency(filteredTripExp), accent: "red" as const },
              { label: "Other Expenses", value: formatCurrency(filteredExpTotal), accent: "red" as const, sub: `${filteredExpenses.length} record${filteredExpenses.length !== 1 ? "s" : ""}` },
              {
                label: "Maintenance",
                value: filteredMaintenanceCostUsd > 0
                  ? formatCurrency(filteredMaintenanceCostUsd)
                  : Object.keys(maintenanceNonUsd).length > 0
                    ? Object.entries(maintenanceNonUsd).map(([c, v]) => `${c} ${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`).join(", ")
                    : "$0.00",
                accent: (filteredMaintenanceCostUsd > 0 || Object.keys(maintenanceNonUsd).length > 0) ? "red" as const : undefined,
                sub: `${filteredMaintenance.length} record${filteredMaintenance.length !== 1 ? "s" : ""}${Object.keys(maintenanceNonUsd).length > 0 ? " · non-USD excluded from net" : ""}`,
              },
              { label: "Net Contribution", value: formatCurrency(filteredNetContribution), accent: filteredNetContribution >= 0 ? "green" as const : "red" as const },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                <p className={cn("text-lg font-bold font-mono",
                  k.accent === "green" ? "text-green-400" : k.accent === "red" ? "text-red-400" : k.accent === "amber" ? "text-amber-400" : "text-foreground"
                )}>{k.value}</p>
                {k.sub && <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border gap-1 flex-wrap">
            {(["trips", "drivers", "expenses", "documents", "maintenance"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "trips"
                  ? `Trips (${filteredTrips.length}${filteredTrips.length !== trips.length ? `/${trips.length}` : ""})`
                  : tab === "drivers"
                  ? `Driver History (${driverAssignments.length})`
                  : tab === "expenses"
                  ? `Other Expenses (${filteredExpenses.length}${filteredExpenses.length !== otherExpenses.length ? `/${otherExpenses.length}` : ""})`
                  : tab === "documents"
                  ? <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />Documents</span>
                  : <span className="flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />Maintenance ({maintenanceRecords.length})</span>}
              </button>
            ))}
          </div>

          {/* ── Trips Tab ── */}
          {activeTab === "trips" && (
            <div className="space-y-3">
              {/* Trip filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search trips..."
                    value={tripSearch}
                    onChange={(e) => { setTripSearch(e.target.value); setTripsLimit(TRIPS_PAGE_SIZE); }}
                    className="pl-8 h-7 text-xs w-36"
                  />
                </div>
                <div className="flex gap-1 bg-secondary/40 p-0.5 rounded-md">
                  {[["all","All"],["active","Active"],["delivered","Delivered"],["completed","Completed"],["cancelled","Cancelled"]].map(([v,l]) => (
                    <Chip key={v} label={l} active={tripStatus === v} onClick={() => { setTripStatus(v); setTripsLimit(TRIPS_PAGE_SIZE); }} />
                  ))}
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{filteredTrips.length} trip{filteredTrips.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {filteredTrips.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">No trips match your filters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Batch</th>
                          <th className="px-4 py-3 text-left">Route</th>
                          <th className="px-4 py-3 text-left">Product</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Loaded</th>
                          <th className="px-4 py-3 text-right">Delivered</th>
                          <th className="px-4 py-3 text-right">Short Charge</th>
                          <th className="px-4 py-3 text-right">Gross</th>
                          <th className="px-4 py-3 text-right">Trip Exp.</th>
                          <th className="px-4 py-3 text-right">Net Contrib.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {pagedTrips.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</td>
                            <td className="px-4 py-3 text-xs">
                              <Link href={`/trips/${t.id}`} className="text-primary underline underline-offset-2 hover:text-primary/80">{t.batchName ?? `Trip #${t.id}`}</Link>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{getRouteLabel(t.route ?? "")}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{t.product ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", TRIP_STATUS_COLOR[t.status] ?? "bg-muted text-muted-foreground")}>
                                {t.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{t.loadedQty != null ? `${t.loadedQty} MT` : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{t.deliveredQty != null ? `${t.deliveredQty} MT` : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {(() => { const sc = t.shortCharge ?? t.clientShortCharge; return sc != null && sc > 0 ? <span className="text-amber-400">{formatCurrency(sc)}</span> : <span className="text-muted-foreground/40">—</span>; })()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(t.grossRevenue)}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-red-400">
                              {t.tripExpenses > 0 ? formatCurrency(t.tripExpenses) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className={cn("px-4 py-3 text-right font-mono text-xs font-semibold", t.netContribution >= 0 ? "text-green-400" : "text-red-400")}>
                              {formatCurrency(t.netContribution)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/10 font-semibold text-xs">
                          <td className="px-4 py-3" colSpan={7}>
                            Totals ({filteredTrips.filter((t) => !["cancelled","amended_out"].includes(t.status)).length} active)
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-amber-400">
                            {filteredTripShortCharge > 0 ? formatCurrency(filteredTripShortCharge) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-green-400">{formatCurrency(filteredTripRevenue)}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-400">{formatCurrency(filteredTripExp)}</td>
                          <td className={cn("px-4 py-3 text-right font-mono", filteredTripNet >= 0 ? "text-green-400" : "text-red-400")}>
                            {formatCurrency(filteredTripNet)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination bar */}
              {filteredTrips.length > TRIPS_PAGE_SIZE && (
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>
                    Showing {Math.min(tripsLimit, filteredTrips.length)} of {filteredTrips.length} trip{filteredTrips.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex gap-2">
                    {hasMore && (
                      <>
                        <button
                          onClick={() => setTripsLimit((l) => l + TRIPS_PAGE_SIZE)}
                          className="text-primary hover:underline font-medium"
                        >
                          Show {Math.min(remaining, TRIPS_PAGE_SIZE)} more
                        </button>
                        <span className="text-border">·</span>
                        <button
                          onClick={() => setTripsLimit(filteredTrips.length)}
                          className="hover:underline"
                        >
                          Show all
                        </button>
                      </>
                    )}
                    {!hasMore && tripsLimit > TRIPS_PAGE_SIZE && (
                      <button
                        onClick={() => setTripsLimit(TRIPS_PAGE_SIZE)}
                        className="hover:underline"
                      >
                        Collapse
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Driver History Tab ── */}
          {activeTab === "drivers" && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {driverAssignments.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No driver assignments recorded.</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {driverAssignments.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", d.unassignedAt ? "bg-muted" : "bg-green-500/10")}>
                        <User className={cn("w-4 h-4", d.unassignedAt ? "text-muted-foreground" : "text-green-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{d.driverName ?? `Driver #${d.driverId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          From {format(new Date(d.assignedAt), "dd MMM yyyy")}
                          {d.unassignedAt ? ` → ${format(new Date(d.unassignedAt), "dd MMM yyyy")}` : " · Current"}
                        </p>
                      </div>
                      {!d.unassignedAt && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Other Expenses Tab ── */}
          {activeTab === "expenses" && (
            <div className="space-y-3">
              {/* Expense filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 bg-secondary/40 p-0.5 rounded-md">
                  <Chip label="All" active={expCategory === "all"} onClick={() => setExpCategory("all")} />
                  {EXPENSE_CATEGORIES.map((c) => (
                    <Chip key={c} label={expenseLabel(c)} active={expCategory === c} onClick={() => setExpCategory(c)} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{filteredExpenses.length} record{filteredExpenses.length !== 1 ? "s" : ""}</span>
                <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setShowAddExpense(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Expense
                </Button>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {filteredExpenses.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">No expenses match your filters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3 text-center">Currency</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredExpenses.map((e) => (
                          <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                            <td className="px-4 py-3 text-xs">
                              <span className="bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{expenseLabel(e.costType)}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {(() => {
                                const raw = e.description ?? "";
                                const match = raw.match(/\[from trip (?:"([^"]+)"|#(\d+))\]/);
                                const label = match ? (match[1] ?? `trip #${match[2]}`) : null;
                                const cleanDesc = raw.replace(/\s*\[from trip (?:"[^"]+"|#\d+)\]/, "").trim();
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {label && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                                        from {label}
                                      </span>
                                    )}
                                    <span>{cleanDesc || "—"}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-400">{formatCurrency(e.amount)}</td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">{e.currency}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setLinkTripId(""); setLinkError(""); setLinkExpense({ id: e.id, costType: e.costType }); }}
                                  className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                                  title="Link to Trip"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { pendingDeleteExpenseRef.current = e; setConfirmDeleteExpenseId(e.id); }}
                                  className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/10 font-semibold text-xs">
                          <td className="px-4 py-3" colSpan={3}>
                            Total{filteredExpenses.length !== otherExpenses.length ? ` (filtered)` : ""}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-red-400">{formatCurrency(filteredExpTotal)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === "documents" && (
            <div className="py-2">
              <DocumentsPanel
                entityType="truck"
                entityId={truck.id}
                entityName={truck.plateNumber}
              />
            </div>
          )}

          {/* ── Maintenance Tab ── */}
          {activeTab === "maintenance" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{maintenanceRecords.length} record{maintenanceRecords.length !== 1 ? "s" : ""}</p>
                <Button size="sm" onClick={() => setShowAddMaintenance(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Log Service
                </Button>
              </div>

              {maintenanceRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 border border-dashed border-border rounded-xl">
                  <Wrench className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No maintenance records yet.</p>
                  <Button size="sm" variant="outline" onClick={() => setShowAddMaintenance(true)}>
                    <Plus className="w-4 h-4 mr-1.5" /> Log first service
                  </Button>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Mechanic</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Cost</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {maintenanceRecords.map((r: any, i: number) => (
                        <tr key={r.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "bg-card" : "bg-muted/10")}>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">{r.date}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", {
                              "bg-blue-500/10 text-blue-500": r.type === "service",
                              "bg-red-500/10 text-red-500": r.type === "repair",
                              "bg-purple-500/10 text-purple-500": r.type === "inspection",
                              "bg-amber-500/10 text-amber-500": r.type === "tyre_change",
                              "bg-muted text-muted-foreground": r.type === "other",
                            })}>
                              {r.type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">{r.description}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{r.mechanic ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-right whitespace-nowrap">
                            {r.cost ? `${r.currency} ${parseFloat(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setConfirmDeleteMaintenanceId(r.id)}
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </PageContent>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Non-Trip Expense — {truck.plateNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={expenseForm.costType} onValueChange={(v) => setExpenseForm({ ...expenseForm, costType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{expenseLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={expenseForm.currency} onValueChange={(v) => setExpenseForm({ ...expenseForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "ZMW", "CDF", "ZAR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Expense Date</Label>
              <Input type="date" value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="e.g. Tyre replacement front axle"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select value={expenseForm.paymentMethod} onValueChange={(v) => setExpenseForm({ ...expenseForm, paymentMethod: v, supplierId: "", bankAccountId: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="petty_cash">Petty Cash</SelectItem>
                  <SelectItem value="fuel_credit">Fuel Credit (Supplier)</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {expenseForm.paymentMethod === "fuel_credit" && (
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <Select value={expenseForm.supplierId} onValueChange={(v) => setExpenseForm({ ...expenseForm, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {expenseForm.paymentMethod === "bank_transfer" && (bankAccounts as any[]).filter((b: any) => b.isActive).length > 0 && (
              <div className="space-y-1.5">
                <Label>Bank Account</Label>
                <Select value={expenseForm.bankAccountId} onValueChange={(v) => setExpenseForm({ ...expenseForm, bankAccountId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select bank (optional)" /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts as any[]).filter((b: any) => b.isActive).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.bankName ? ` — ${b.bankName}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} disabled={addingExpense}>{addingExpense ? "Saving..." : "Save Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Link to Trip dialog */}
      <Dialog open={!!linkExpense} onOpenChange={(o) => { if (!linking && !o) setLinkExpense(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Expense to Trip</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              This expense will be promoted from truck-level to trip-level and included in that trip's cost breakdown.
            </p>
            <div className="space-y-1.5">
              <Label>Select Trip</Label>
              <Select value={linkTripId} onValueChange={setLinkTripId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a trip..." />
                </SelectTrigger>
                <SelectContent>
                  {(trips ?? []).filter((t: any) => t.status !== "cancelled").length === 0
                    ? <SelectItem value="none" disabled>No eligible trips for this truck</SelectItem>
                    : (trips ?? []).filter((t: any) => t.status !== "cancelled").map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.batchName ?? `Trip #${t.id}`}
                          <span className="text-muted-foreground ml-1 text-xs">({t.status})</span>
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
            {linkError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{linkError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkExpense(null)} disabled={linking}>Cancel</Button>
            <Button onClick={handleLinkToTrip} disabled={linking || !linkTripId}>
              {linking ? "Linking..." : "Link to Trip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CorrectClosedEntryDialog
        open={expenseCorrectionTarget !== null}
        entry={expenseCorrectionTarget}
        correctUrl={expenseCorrectionTarget ? `/api/expenses/${expenseCorrectionTarget.id}/correct` : ""}
        costTypeOptions={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: expenseLabel(c) }))}
        onClose={() => setExpenseCorrectionTarget(null)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: [`/api/trucks/${id}/detail`] });
          qc.invalidateQueries({ queryKey: ["/api/expenses"] });
        }}
      />

      <AlertDialog open={confirmDeleteExpenseId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteExpenseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The expense record will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (confirmDeleteExpenseId !== null) { deleteExpense.mutate(confirmDeleteExpenseId); setConfirmDeleteExpenseId(null); } }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Maintenance Dialog ── */}
      <Dialog open={showAddMaintenance} onOpenChange={setShowAddMaintenance}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Maintenance — {truck.plateNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={maintenanceForm.date} onChange={(e) => setMaintenanceForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={maintenanceForm.type} onValueChange={(v) => setMaintenanceForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="tyre_change">Tyre Change</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Input value={maintenanceForm.description} onChange={(e) => setMaintenanceForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Oil change, brake pads replaced…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cost</Label>
                <Input type="number" min="0" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((f) => ({ ...f, cost: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={maintenanceForm.currency} onValueChange={(v) => setMaintenanceForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ZMW">ZMW</SelectItem>
                    <SelectItem value="CDF">CDF</SelectItem>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Odometer (km)</Label>
                <Input type="number" min="0" value={maintenanceForm.odometer} onChange={(e) => setMaintenanceForm((f) => ({ ...f, odometer: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <Label>Mechanic / Garage</Label>
                <Input value={maintenanceForm.mechanic} onChange={(e) => setMaintenanceForm((f) => ({ ...f, mechanic: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Next Service Date</Label>
              <Input type="date" value={maintenanceForm.nextServiceDate} onChange={(e) => setMaintenanceForm((f) => ({ ...f, nextServiceDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMaintenance(false)}>Cancel</Button>
            <Button
              disabled={addingMaintenance}
              onClick={async () => {
                if (!maintenanceForm.date || !maintenanceForm.type || !maintenanceForm.description) {
                  toast({ title: "Date, type and description are required", variant: "destructive" }); return;
                }
                setAddingMaintenance(true);
                try {
                  const res = await fetch(`/api/maintenance/trucks/${id}`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      date: maintenanceForm.date,
                      type: maintenanceForm.type,
                      description: maintenanceForm.description,
                      cost: maintenanceForm.cost ? parseFloat(maintenanceForm.cost) : null,
                      currency: maintenanceForm.currency,
                      odometer: maintenanceForm.odometer ? parseInt(maintenanceForm.odometer) : null,
                      mechanic: maintenanceForm.mechanic || null,
                      nextServiceDate: maintenanceForm.nextServiceDate || null,
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to save");
                  await refetchMaintenance();
                  setShowAddMaintenance(false);
                  setMaintenanceForm({ date: format(new Date(), "yyyy-MM-dd"), type: "service", description: "", cost: "", currency: "USD", odometer: "", mechanic: "", nextServiceDate: "" });
                  toast({ title: "Maintenance logged" });
                } catch {
                  toast({ title: "Error saving record", variant: "destructive" });
                } finally {
                  setAddingMaintenance(false);
                }
              }}
            >
              {addingMaintenance ? "Saving…" : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Maintenance ── */}
      <AlertDialog open={confirmDeleteMaintenanceId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteMaintenanceId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this maintenance record?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (confirmDeleteMaintenanceId === null) return;
                await fetch(`/api/maintenance/${confirmDeleteMaintenanceId}`, { method: "DELETE", credentials: "include" });
                await refetchMaintenance();
                setConfirmDeleteMaintenanceId(null);
                toast({ title: "Record removed" });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
