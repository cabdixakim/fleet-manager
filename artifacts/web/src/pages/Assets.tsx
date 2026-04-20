import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Plus, Trash2, TrendingDown, Package, DollarSign, BarChart2,
  CreditCard, CheckCircle2, CalendarClock, RefreshCw, Search, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

interface AssetRow {
  id: number; truckId: number | null; plateNumber: string | null;
  name: string; description: string | null;
  purchasePrice: string; purchaseDate: string;
  usefulLifeYears: number; salvageValue: string;
  depreciationMethod: string; entryDate: string | null;
  entryAccumulatedDepreciation: string; remainingUsefulLifeMonths: number | null;
  financed: boolean; lender: string | null; downPayment: string | null;
  loanAmount: string | null; installmentAmount: string | null;
  installmentFrequency: string | null; installmentsPaid: number;
  monthlyDepreciation: number; accumulatedDepreciation: number;
  netBookValue: number; monthsElapsed: number; remainingMonths: number;
  fullyDepreciated: boolean; currentOutstanding: number;
  remainingInstallments: number; loanPaidPct: number; loanFullyPaid: boolean;
  createdAt: string;
}

interface Truck { id: number; plateNumber: string; }

const TODAY = format(new Date(), "yyyy-MM-dd");
const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", "bi-annual": "Bi-Annual", annual: "Annual",
};

const EMPTY_FORM = {
  name: "", description: "", truckId: "", purchasePrice: "", purchaseDate: TODAY,
  usefulLifeYears: "5", salvageValue: "0", depreciationMethod: "straight_line",
  isMigration: false, entryAccumulatedDepreciation: "", remainingUsefulLifeMonths: "",
  financed: false, lender: "", downPayment: "", loanAmount: "",
  installmentAmount: "", installmentFrequency: "monthly",
};

type FilterTab = "all" | "financed" | "depreciated";

export default function Assets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<AssetRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [postingDep, setPostingDep] = useState(false);
  const [postingAll, setPostingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const { data: assets = [], isLoading } = useQuery<AssetRow[]>({
    queryKey: ["/api/assets"],
    queryFn: () => fetch("/api/assets", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: trucks = [] } = useQuery<Truck[]>({
    queryKey: ["/api/trucks"],
    queryFn: () => fetch("/api/trucks", { credentials: "include" }).then((r) => r.json()),
  });

  const totalCost  = assets.reduce((s, a) => s + parseFloat(a.purchasePrice), 0);
  const totalAccum = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalNBV   = assets.reduce((s, a) => s + a.netBookValue, 0);
  const totalLoan  = assets.filter((a) => a.financed).reduce((s, a) => s + a.currentOutstanding, 0);
  const monthlyDep = assets.reduce((s, a) => s + (a.fullyDepreciated ? 0 : a.monthlyDepreciation), 0);

  const filtered = useMemo(() => {
    let list = assets;
    if (tab === "financed")   list = list.filter((a) => a.financed && !a.loanFullyPaid);
    if (tab === "depreciated") list = list.filter((a) => a.fullyDepreciated);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.plateNumber ?? "").toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, tab, search]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name || !form.purchasePrice || !form.purchaseDate || !form.usefulLifeYears) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        name: form.name, description: form.description || null,
        truckId: form.truckId || null,
        purchasePrice: parseFloat(form.purchasePrice),
        purchaseDate: form.purchaseDate,
        usefulLifeYears: parseInt(form.usefulLifeYears),
        salvageValue: parseFloat(form.salvageValue || "0"),
        depreciationMethod: form.depreciationMethod,
        entryDate: TODAY,
        entryAccumulatedDepreciation: form.isMigration && form.entryAccumulatedDepreciation
          ? parseFloat(form.entryAccumulatedDepreciation) : 0,
        remainingUsefulLifeMonths: form.isMigration && form.remainingUsefulLifeMonths
          ? parseInt(form.remainingUsefulLifeMonths) : null,
        financed: form.financed,
      };
      if (form.financed) {
        body.lender = form.lender || null;
        body.downPayment = form.downPayment ? parseFloat(form.downPayment) : null;
        body.loanAmount = form.loanAmount ? parseFloat(form.loanAmount) : null;
        body.installmentAmount = form.installmentAmount ? parseFloat(form.installmentAmount) : null;
        body.installmentFrequency = form.installmentFrequency || null;
      }
      const res = await fetch("/api/assets", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset registered" });
      setShowAdd(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    await fetch(`/api/assets/${selected.id}`, { method: "DELETE", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["/api/assets"] });
    setSelected(null);
    setConfirmDelete(false);
    toast({ title: "Asset removed" });
  }

  async function handleRecordPayment() {
    if (!selected) return;
    setRecordingPayment(true);
    try {
      const res = await fetch(`/api/assets/${selected.id}/record-payment`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      // refresh selected
      const updated = await fetch("/api/assets", { credentials: "include" }).then((r) => r.json());
      setSelected(updated.find((a: AssetRow) => a.id === selected.id) ?? null);
      toast({ title: "Payment recorded" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handlePostDepreciation() {
    if (!selected) return;
    setPostingDep(true);
    try {
      const res = await fetch(`/api/assets/${selected.id}/post-depreciation`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      const updated = await fetch("/api/assets", { credentials: "include" }).then((r) => r.json());
      setSelected(updated.find((a: AssetRow) => a.id === selected.id) ?? null);
      toast({ title: "Depreciation posted", description: `${formatCurrency(data.amount)} for ${data.month}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setPostingDep(false);
    }
  }

  async function handlePostAllDepreciation() {
    setPostingAll(true);
    try {
      const res = await fetch("/api/assets/post-depreciation-all", { method: "POST", credentials: "include" });
      const data = await res.json();
      toast({ title: "Depreciation posted", description: `${data.posted} asset(s) for ${data.month}. ${data.skipped} skipped.` });
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setPostingAll(false);
    }
  }

  const formRemainingInstallments =
    form.financed && form.loanAmount && form.installmentAmount
      ? Math.ceil(parseFloat(form.loanAmount) / parseFloat(form.installmentAmount))
      : null;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",         label: "All",              count: assets.length },
    { key: "financed",    label: "Hire Purchase",    count: assets.filter((a) => a.financed && !a.loanFullyPaid).length },
    { key: "depreciated", label: "Fully Depreciated", count: assets.filter((a) => a.fullyDepreciated).length },
  ];

  return (
    <Layout>
      <PageHeader
        title="Asset Register"
        subtitle="Fixed assets, depreciation and hire purchase tracking"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handlePostAllDepreciation} disabled={postingAll}>
              <CalendarClock className="w-4 h-4 mr-1.5" />
              {postingAll ? "Posting…" : "Post This Month's Depreciation"}
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Asset
            </Button>
          </div>
        }
      />
      <PageContent>
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Total Cost",       value: formatCurrency(totalCost),  icon: Package,     color: "text-blue-500" },
            { label: "Accumulated Dep.", value: formatCurrency(totalAccum), icon: TrendingDown, color: "text-red-500" },
            { label: "Net Book Value",   value: formatCurrency(totalNBV),   icon: BarChart2,   color: "text-emerald-500" },
            { label: "Monthly Dep.",     value: formatCurrency(monthlyDep), icon: DollarSign,  color: "text-amber-500" },
            { label: "Outstanding Loans",value: formatCurrency(totalLoan),  icon: CreditCard,  color: totalLoan > 0 ? "text-rose-500" : "text-muted-foreground" },
          ].map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <c.icon className={cn("w-4 h-4", c.color)} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Search + filter tabs */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                  tab === t.key
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  tab === t.key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                )}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Package className="w-8 h-8 opacity-20" />
            <p className="text-sm">{assets.length === 0 ? "No assets registered yet." : "No assets match your search."}</p>
            {assets.length === 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Add your first asset
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Book Value</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Monthly Dep.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Loan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const cost = parseFloat(a.purchasePrice);
                  const depPct = cost > 0 ? Math.min(100, (a.accumulatedDepreciation / cost) * 100) : 0;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{a.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {a.plateNumber && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{a.plateNumber}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{a.purchaseDate}</span>
                        </div>
                        {/* Mini dep bar */}
                        <div className="mt-1.5 h-1 w-24 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", a.fullyDepreciated ? "bg-muted-foreground" : "bg-primary/60")}
                            style={{ width: `${depPct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">{formatCurrency(cost)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("font-semibold", a.fullyDepreciated ? "text-muted-foreground" : "text-emerald-500")}>
                          {formatCurrency(a.netBookValue)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                        {a.fullyDepreciated ? "—" : formatCurrency(a.monthlyDepreciation)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {a.financed ? (
                          a.loanFullyPaid
                            ? <span className="text-xs text-emerald-500">Paid off</span>
                            : <span className="text-xs text-rose-500">{formatCurrency(a.currentOutstanding)} left</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {a.fullyDepreciated ? (
                          <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Fully depreciated</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{a.remainingMonths}mo left</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>

      {/* ── Asset Detail Panel ── */}
      {selected && (() => {
        const cost = parseFloat(selected.purchasePrice);
        const depPct = cost > 0 ? Math.min(100, (selected.accumulatedDepreciation / cost) * 100) : 0;
        const outstandingAtEntry = selected.loanAmount ? parseFloat(selected.loanAmount) : 0;
        return (
          <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selected.name}
                  {selected.plateNumber && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">{selected.plateNumber}</span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1">
                {selected.description && (
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                )}
                <div className="text-xs text-muted-foreground">
                  Purchased {selected.purchaseDate}
                  {selected.entryDate && selected.entryDate !== selected.purchaseDate ? ` · Entered ${selected.entryDate}` : ""}
                  {" · "}{selected.depreciationMethod === "declining_balance" ? "Declining Balance" : "Straight-Line"}
                </div>

                {/* Depreciation section */}
                <div className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Depreciation</p>
                    {!selected.fullyDepreciated && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handlePostDepreciation} disabled={postingDep}>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        {postingDep ? "Posting…" : "Post This Month"}
                      </Button>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", selected.fullyDepreciated ? "bg-muted-foreground" : "bg-primary")}
                      style={{ width: `${depPct}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Cost",          value: formatCurrency(cost) },
                      { label: "Accumulated",   value: formatCurrency(selected.accumulatedDepreciation) },
                      { label: "Net Book Value",value: formatCurrency(selected.netBookValue), em: true },
                      { label: "Monthly",       value: selected.fullyDepreciated ? "—" : formatCurrency(selected.monthlyDepreciation) },
                      { label: "Remaining Life",value: selected.fullyDepreciated ? "Fully depreciated" : `${selected.remainingMonths} months` },
                      { label: "Useful Life",   value: `${selected.usefulLifeYears} years` },
                    ].map((f) => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                        <p className={cn("text-sm font-semibold", f.em ? "text-emerald-500" : "text-foreground")}>{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hire purchase section */}
                {selected.financed && outstandingAtEntry > 0 && (
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Hire Purchase{selected.lender ? ` — ${selected.lender}` : ""}
                      </p>
                      {!selected.loanFullyPaid && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRecordPayment} disabled={recordingPayment}>
                          {recordingPayment ? "Recording…" : "+ Record Payment"}
                        </Button>
                      )}
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", selected.loanFullyPaid ? "bg-emerald-500" : "bg-rose-500")}
                        style={{ width: `${selected.loanPaidPct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Balance at Entry",  value: formatCurrency(outstandingAtEntry) },
                        { label: "Outstanding Now",   value: selected.loanFullyPaid ? "Paid off" : formatCurrency(selected.currentOutstanding), rose: !selected.loanFullyPaid },
                        { label: "Payments Made",     value: `${selected.installmentsPaid} recorded` },
                        { label: `Remaining (${FREQ_LABEL[selected.installmentFrequency ?? ""] ?? "—"})`,
                          value: selected.loanFullyPaid ? "—" : `${selected.remainingInstallments} × ${selected.installmentAmount ? formatCurrency(parseFloat(selected.installmentAmount)) : "—"}` },
                      ].map((f) => (
                        <div key={f.label}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                          <p className={cn("text-sm font-semibold", f.rose ? "text-rose-500" : "text-foreground")}>{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-row justify-between items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Remove Asset
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Confirm Delete ── */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Remove Asset</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Remove <strong>{selected?.name}</strong>? This will reverse the GL entries and cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Asset Dialog ── */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Register Asset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">

            <div className="space-y-3">
              <div>
                <Label>Asset Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Isuzu Tanker — ZM 1234 AB" className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional notes" className="mt-1" />
              </div>
              <div>
                <Label>Link to Truck</Label>
                <Select value={form.truckId || "none"} onValueChange={(v) => set("truckId", v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select truck…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(trucks as Truck[]).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Purchase & Depreciation</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Price (USD) *</Label>
                  <Input type="number" min="0" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} placeholder="0.00" className="mt-1" />
                </div>
                <div>
                  <Label>Salvage Value (USD)</Label>
                  <Input type="number" min="0" value={form.salvageValue} onChange={(e) => set("salvageValue", e.target.value)} placeholder="0.00" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Date *</Label>
                  <Input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Useful Life (years) *</Label>
                  <Input type="number" min="1" max="50" value={form.usefulLifeYears} onChange={(e) => set("usefulLifeYears", e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Depreciation Method</Label>
                <Select value={form.depreciationMethod} onValueChange={(v) => set("depreciationMethod", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight-Line</SelectItem>
                    <SelectItem value="declining_balance">Declining Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={form.isMigration} onChange={(e) => set("isMigration", e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Asset was already in use before today</p>
                  <p className="text-xs text-muted-foreground">Enter accumulated depreciation and remaining life already on record</p>
                </div>
              </label>

              {form.isMigration && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
                  <div>
                    <Label>Accumulated Depreciation (USD)</Label>
                    <Input type="number" min="0" value={form.entryAccumulatedDepreciation} onChange={(e) => set("entryAccumulatedDepreciation", e.target.value)} placeholder="0.00" className="mt-1" />
                  </div>
                  <div>
                    <Label>Remaining Useful Life (months)</Label>
                    <Input type="number" min="1" value={form.remainingUsefulLifeMonths} onChange={(e) => set("remainingUsefulLifeMonths", e.target.value)} placeholder="e.g. 36" className="mt-1" />
                  </div>
                </div>
              )}
            </div>

            <div className="border border-border rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.financed} onChange={(e) => set("financed", e.target.checked)} className="w-4 h-4 accent-primary" />
                <p className="text-sm font-medium text-foreground">Hire Purchase / Financed</p>
              </label>
              {form.financed && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Seller / Financier</Label>
                      <Input value={form.lender} onChange={(e) => set("lender", e.target.value)} placeholder="e.g. Toyota Zambia" className="mt-1" />
                    </div>
                    <div>
                      <Label>Down Payment (USD)</Label>
                      <Input type="number" min="0" value={form.downPayment} onChange={(e) => set("downPayment", e.target.value)} placeholder="0.00" className="mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Outstanding Balance at Entry (USD)</Label>
                      <Input type="number" min="0" value={form.loanAmount} onChange={(e) => set("loanAmount", e.target.value)} placeholder="0.00" className="mt-1" />
                    </div>
                    <div>
                      <Label>Installment Amount (USD)</Label>
                      <Input type="number" min="0" value={form.installmentAmount} onChange={(e) => set("installmentAmount", e.target.value)} placeholder="0.00" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>Payment Frequency</Label>
                    <Select value={form.installmentFrequency} onValueChange={(v) => set("installmentFrequency", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="bi-annual">Bi-Annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formRemainingInstallments !== null && (
                    <p className="text-xs text-muted-foreground">
                      ≈ {formRemainingInstallments} installments remaining at this amount
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Register Asset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
