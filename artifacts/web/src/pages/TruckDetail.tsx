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
import { ArrowLeft, ArrowRight, Truck, User, Plus, Trash2, Printer, Search } from "lucide-react";
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
  };
  driverAssignments: { id: number; driverId: number; driverName: string | null; assignedAt: string; unassignedAt: string | null }[];
  trips: {
    id: number; status: string; loadedQty: number | null; deliveredQty: number | null; product: string | null;
    createdAt: string; batchName: string | null; route: string | null; ratePerMt: number | null;
    grossRevenue: number; commission: number; tripExpenses: number; netContribution: number;
  }[];
  otherExpenses: { id: number; costType: string; description: string | null; amount: number; currency: string; expenseDate: string }[];
  summary: { totalTrips: number; totalRevenue: number; totalCommission: number; totalTripExpenses: number; totalOtherExpenses: number; netProfit: number };
};

import { getRouteLabel } from "@/lib/routes";

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

  const [activeTab, setActiveTab] = useState<"trips" | "drivers" | "expenses">("trips");
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
    expenseDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [addingExpense, setAddingExpense] = useState(false);

  // Shared period filter (drives KPIs + both tabs)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Trip filters (tab-level, beyond the period)
  const [tripStatus, setTripStatus] = useState("all");
  const [tripSearch, setTripSearch] = useState("");

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
      if (e?.status === 409 && pendingDeleteExpenseRef.current) {
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
        }),
      });
      await throwOnApiError(r);
      const result = await r.json();
      await qc.invalidateQueries({ queryKey: [`/api/trucks/${id}/detail`] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      setShowAddExpense(false);
      setExpenseForm({ costType: "maintenance", description: "", amount: "", currency: "USD", expenseDate: format(new Date(), "yyyy-MM-dd") });
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
  const filteredNetContribution = filteredTripNet - filteredExpTotal;

  const isPeriodActive = !!(dateFrom || dateTo);

  const printedAt = format(new Date(), "dd MMM yyyy, HH:mm");

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
          <div className="flex items-center gap-2 print:hidden">
            <Link href="/fleet">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Fleet
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        }
      />

      <PageContent>
        {/* ═══════════════════════════════════════════════════
            PRINT DOCUMENT — hidden on screen, shown when printing
            ═══════════════════════════════════════════════════ */}
        <div className="hidden print:block text-black bg-white">
          {/* Print header */}
          <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-black">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{truck.plateNumber}</h1>
              {truck.trailerPlate && <p className="text-sm text-gray-600">Trailer: {truck.trailerPlate}</p>}
              <p className="text-sm text-gray-600 mt-1">
                {truck.companyOwned ? "Company Fleet" : (truck.subcontractorName ?? "No subcontractor")}
                {!truck.companyOwned && truck.commissionRate ? ` · ${truck.commissionRate}% commission` : ""}
                {truck.companyOwned ? " · No commission" : ""}
                {" · "}
                <span className="font-semibold">{STATUS_LABEL[truck.status] ?? truck.status}</span>
              </p>
              {currentDriver && (
                <p className="text-sm text-gray-600">Driver: {currentDriver.driverName}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Printed {printedAt}</p>
              {(dateFrom || dateTo) && (
                <p className="text-xs text-gray-500 mt-1">
                  Period: {dateFrom || "—"} to {dateTo || "—"}
                </p>
              )}
            </div>
          </div>

          {/* Print KPI summary */}
          <div className="grid grid-cols-6 gap-3 mb-8">
            {[
              { label: "Trips", value: filteredTrips.length.toString() },
              { label: "Gross Revenue", value: formatCurrency(filteredTripRevenue) },
              { label: "Commission", value: formatCurrency(filteredTripCommission) },
              { label: "Trip Expenses", value: formatCurrency(filteredTripExp) },
              { label: "Other Expenses", value: formatCurrency(filteredExpTotal) },
              { label: "Net Contribution", value: formatCurrency(filteredNetContribution) },
            ].map((k) => (
              <div key={k.label} className="border border-gray-300 rounded p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-sm font-bold mt-0.5 font-mono">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Print trips table */}
          <section className="mb-8">
            <h2 className="text-base font-bold mb-3 border-b border-gray-300 pb-1">
              Trips ({filteredTrips.length})
              {tripStatus !== "all" && <span className="font-normal text-gray-500 text-sm ml-2">— filter: {tripStatus}</span>}
            </h2>
            {filteredTrips.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No trips match the current filter.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-400">
                    {["Date", "Batch", "Route", "Product", "Status", "Loaded (MT)", "Delivered (MT)", "Gross", "Trip Exp.", "Net Contrib."].map((h) => (
                      <th key={h} className="py-1.5 pr-3 text-left font-semibold text-gray-700 last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((t, i) => (
                    <tr key={t.id} className={cn("border-b border-gray-200", i % 2 === 1 && "bg-gray-50")}
                        style={{ pageBreakInside: "avoid" }}>
                      <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                      <td className="py-1.5 pr-3">{t.batchName ?? `#${t.id}`}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{getRouteLabel(t.route ?? "")}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{t.product ?? "—"}</td>
                      <td className="py-1.5 pr-3 capitalize">{t.status.replace(/_/g, " ")}</td>
                      <td className="py-1.5 pr-3 font-mono">{t.loadedQty != null ? t.loadedQty : "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">{t.deliveredQty != null ? t.deliveredQty : "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">{formatCurrency(t.grossRevenue)}</td>
                      <td className="py-1.5 pr-3 font-mono">{t.tripExpenses > 0 ? formatCurrency(t.tripExpenses) : "—"}</td>
                      <td className="py-1.5 font-mono font-semibold text-right">{formatCurrency(t.netContribution)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400 font-bold">
                    <td className="py-2 pr-3" colSpan={7}>Totals ({filteredTrips.filter((t) => !["cancelled","amended_out"].includes(t.status)).length} active)</td>
                    <td className="py-2 pr-3 font-mono">{formatCurrency(filteredTripRevenue)}</td>
                    <td className="py-2 pr-3 font-mono">{formatCurrency(filteredTripExp)}</td>
                    <td className="py-2 font-mono text-right">{formatCurrency(filteredTripNet)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          {/* Print other expenses table — page break before if needed */}
          <section className="mb-8" style={{ pageBreakBefore: filteredTrips.length > 12 ? "always" : "auto" }}>
            <h2 className="text-base font-bold mb-3 border-b border-gray-300 pb-1">
              Other Expenses ({filteredExpenses.length})
              {expCategory !== "all" && <span className="font-normal text-gray-500 text-sm ml-2">— {expCategory}</span>}
            </h2>
            {filteredExpenses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No other expenses recorded.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-400">
                    {["Date", "Category", "Description", "Amount", "Currency"].map((h) => (
                      <th key={h} className="py-1.5 pr-3 text-left font-semibold text-gray-700 last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e, i) => (
                    <tr key={e.id} className={cn("border-b border-gray-200", i % 2 === 1 && "bg-gray-50")}
                        style={{ pageBreakInside: "avoid" }}>
                      <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                      <td className="py-1.5 pr-3">{expenseLabel(e.costType)}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{e.description ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-mono font-semibold">{formatCurrency(e.amount)}</td>
                      <td className="py-1.5 font-mono text-right">{e.currency}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400 font-bold">
                    <td className="py-2 pr-3" colSpan={3}>Total</td>
                    <td className="py-2 pr-3 font-mono">{formatCurrency(filteredExpTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          {/* Print driver history */}
          <section style={{ pageBreakInside: "avoid" }}>
            <h2 className="text-base font-bold mb-3 border-b border-gray-300 pb-1">
              Driver History ({driverAssignments.length})
            </h2>
            {driverAssignments.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No driver assignments recorded.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-400">
                    {["Driver", "From", "To", "Status"].map((h) => (
                      <th key={h} className="py-1.5 pr-3 text-left font-semibold text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverAssignments.map((d, i) => (
                    <tr key={d.id} className={cn("border-b border-gray-200", i % 2 === 1 && "bg-gray-50")}>
                      <td className="py-1.5 pr-3 font-medium">{d.driverName ?? `Driver #${d.driverId}`}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{format(new Date(d.assignedAt), "dd MMM yyyy")}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{d.unassignedAt ? format(new Date(d.unassignedAt), "dd MMM yyyy") : "—"}</td>
                      <td className="py-1.5">{d.unassignedAt ? "Past" : "Current"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* ═══════════════════════════════════════════════════
            SCREEN VIEW — hidden when printing
            ═══════════════════════════════════════════════════ */}
        <div className="space-y-5 max-w-5xl print:hidden">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Trips", value: filteredTrips.length.toString(), sub: isPeriodActive ? `of ${trips.length} total` : `${trips.length} recorded`, accent: undefined },
              { label: "Gross Revenue", value: formatCurrency(filteredTripRevenue), accent: "green" as const },
              { label: "Commission", value: formatCurrency(filteredTripCommission), accent: "amber" as const },
              { label: "Trip Expenses", value: formatCurrency(filteredTripExp), accent: "red" as const },
              { label: "Other Expenses", value: formatCurrency(filteredExpTotal), accent: "red" as const, sub: `${filteredExpenses.length} record${filteredExpenses.length !== 1 ? "s" : ""}` },
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
          <div className="flex border-b border-border gap-1">
            {(["trips", "drivers", "expenses"] as const).map((tab) => (
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
                  : `Other Expenses (${filteredExpenses.length}${filteredExpenses.length !== otherExpenses.length ? `/${otherExpenses.length}` : ""})`}
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
                    onChange={(e) => setTripSearch(e.target.value)}
                    className="pl-8 h-7 text-xs w-36"
                  />
                </div>
                <div className="flex gap-1 bg-secondary/40 p-0.5 rounded-md">
                  {[["all","All"],["active","Active"],["delivered","Delivered"],["completed","Completed"],["cancelled","Cancelled"]].map(([v,l]) => (
                    <Chip key={v} label={l} active={tripStatus === v} onClick={() => setTripStatus(v)} />
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
                          <th className="px-4 py-3 text-right">Gross</th>
                          <th className="px-4 py-3 text-right">Trip Exp.</th>
                          <th className="px-4 py-3 text-right">Net Contrib.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredTrips.map((t) => (
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
    </Layout>
  );
}
