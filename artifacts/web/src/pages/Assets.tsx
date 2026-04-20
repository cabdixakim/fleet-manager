import { useState } from "react";
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
  CreditCard, CheckCircle2, CalendarClock, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

interface AssetRow {
  id: number;
  truckId: number | null;
  plateNumber: string | null;
  name: string;
  description: string | null;
  purchasePrice: string;
  purchaseDate: string;
  usefulLifeYears: number;
  salvageValue: string;
  depreciationMethod: string;
  entryDate: string | null;
  entryAccumulatedDepreciation: string;
  remainingUsefulLifeMonths: number | null;
  financed: boolean;
  lender: string | null;
  downPayment: string | null;
  loanAmount: string | null;        // outstanding at entry
  installmentAmount: string | null;
  installmentFrequency: string | null;
  installmentsPaid: number;
  // computed
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthsElapsed: number;
  remainingMonths: number;
  fullyDepreciated: boolean;
  currentOutstanding: number;
  remainingInstallments: number;
  loanPaidPct: number;
  loanFullyPaid: boolean;
  createdAt: string;
}

interface Truck { id: number; plateNumber: string; }

const TODAY = format(new Date(), "yyyy-MM-dd");

const EMPTY_FORM = {
  name: "",
  description: "",
  truckId: "",
  purchasePrice: "",
  purchaseDate: TODAY,
  usefulLifeYears: "5",
  salvageValue: "0",
  depreciationMethod: "straight_line",
  isMigration: false,
  entryAccumulatedDepreciation: "",
  remainingUsefulLifeMonths: "",
  financed: false,
  lender: "",
  downPayment: "",
  loanAmount: "",           // outstanding balance at entry
  installmentAmount: "",
  installmentFrequency: "monthly",
};

const FREQ_LABEL: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", "bi-annual": "Bi-Annual", annual: "Annual",
};

export default function Assets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [recordingPaymentId, setRecordingPaymentId] = useState<number | null>(null);
  const [postingDepreciationId, setPostingDepreciationId] = useState<number | null>(null);
  const [postingAll, setPostingAll] = useState(false);

  const { data: assets = [], isLoading } = useQuery<AssetRow[]>({
    queryKey: ["/api/assets"],
    queryFn: () => fetch("/api/assets", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: trucks = [] } = useQuery<Truck[]>({
    queryKey: ["/api/trucks"],
    queryFn: () => fetch("/api/trucks", { credentials: "include" }).then((r) => r.json()),
  });

  const totalCost = assets.reduce((s, a) => s + parseFloat(a.purchasePrice), 0);
  const totalAccum = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalNBV = assets.reduce((s, a) => s + a.netBookValue, 0);
  const totalOutstanding = assets.filter((a) => a.financed).reduce((s, a) => s + a.currentOutstanding, 0);
  const monthlyDep = assets.reduce((s, a) => s + (a.fullyDepreciated ? 0 : a.monthlyDepreciation), 0);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name || !form.purchasePrice || !form.purchaseDate || !form.usefulLifeYears) {
      toast({ title: "Missing fields", description: "Name, purchase price, date and useful life are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        name: form.name,
        description: form.description || null,
        truckId: form.truckId || null,
        purchasePrice: parseFloat(form.purchasePrice),
        purchaseDate: form.purchaseDate,
        usefulLifeYears: parseInt(form.usefulLifeYears),
        salvageValue: parseFloat(form.salvageValue || "0"),
        depreciationMethod: form.depreciationMethod,
        entryDate: TODAY,
        entryAccumulatedDepreciation: form.isMigration && form.entryAccumulatedDepreciation
          ? parseFloat(form.entryAccumulatedDepreciation)
          : 0,
        remainingUsefulLifeMonths: form.isMigration && form.remainingUsefulLifeMonths
          ? parseInt(form.remainingUsefulLifeMonths)
          : null,
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset registered", description: "Journal entry posted to the general ledger." });
      setShowAdd(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/assets/${id}`, { method: "DELETE", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["/api/assets"] });
    setConfirmDeleteId(null);
    toast({ title: "Asset removed" });
  }

  async function handleRecordPayment(a: AssetRow) {
    setRecordingPaymentId(a.id);
    try {
      const res = await fetch(`/api/assets/${a.id}/record-payment`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Payment recorded", description: "Hire Purchase Payable reduced in the general ledger." });
    } catch (e: any) {
      toast({ title: "Failed to record payment", description: e.message, variant: "destructive" });
    } finally {
      setRecordingPaymentId(null);
    }
  }

  async function handlePostDepreciation(a: AssetRow) {
    setPostingDepreciationId(a.id);
    try {
      const res = await fetch(`/api/assets/${a.id}/post-depreciation`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Depreciation posted", description: `${formatCurrency(data.amount)} posted for ${data.month}.` });
    } catch (e: any) {
      toast({ title: "Could not post depreciation", description: e.message, variant: "destructive" });
    } finally {
      setPostingDepreciationId(null);
    }
  }

  async function handlePostAllDepreciation() {
    setPostingAll(true);
    try {
      const res = await fetch("/api/assets/post-depreciation-all", { method: "POST", credentials: "include" });
      const data = await res.json();
      toast({ title: "Depreciation posted", description: `${data.posted} asset(s) posted for ${data.month}. ${data.skipped} skipped (fully depreciated).` });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setPostingAll(false);
    }
  }

  // Auto-calculate remaining installments for form preview
  const formRemainingInstallments =
    form.financed && form.loanAmount && form.installmentAmount
      ? Math.ceil(parseFloat(form.loanAmount) / parseFloat(form.installmentAmount))
      : null;

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
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Asset Cost", value: formatCurrency(totalCost), icon: Package, color: "text-blue-500" },
            { label: "Accumulated Dep.", value: formatCurrency(totalAccum), icon: TrendingDown, color: "text-red-500" },
            { label: "Net Book Value", value: formatCurrency(totalNBV), icon: BarChart2, color: "text-emerald-500" },
            { label: "Monthly Depreciation", value: formatCurrency(monthlyDep), icon: DollarSign, color: "text-amber-500" },
            { label: "Outstanding Loans", value: formatCurrency(totalOutstanding), icon: CreditCard, color: totalOutstanding > 0 ? "text-rose-500" : "text-muted-foreground" },
          ].map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={cn("w-4 h-4", c.color)} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Asset list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Package className="w-10 h-10 opacity-20" />
            <p className="text-sm">No assets registered yet.</p>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add your first asset
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {assets.map((a) => {
              const cost = parseFloat(a.purchasePrice);
              const depPct = cost > 0 ? Math.min(100, (a.accumulatedDepreciation / cost) * 100) : 0;
              const outstandingAtEntry = a.loanAmount ? parseFloat(a.loanAmount) : 0;
              return (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">{a.name}</span>
                        {a.plateNumber && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{a.plateNumber}</span>
                        )}
                        {a.financed && !a.loanFullyPaid && (
                          <span className="text-xs bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CreditCard className="w-3 h-3" /> Hire Purchase
                          </span>
                        )}
                        {a.financed && a.loanFullyPaid && (
                          <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Fully Paid
                          </span>
                        )}
                        {a.fullyDepreciated && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Fully Depreciated</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {a.depreciationMethod === "declining_balance" ? "Declining Balance" : "Straight-Line"}
                        </span>
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Purchased {a.purchaseDate}
                        {a.entryDate && a.entryDate !== a.purchaseDate ? ` · Entered ${a.entryDate}` : ""}
                        {" · "}{a.remainingMonths}mo remaining
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Depreciation */}
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Depreciation</p>
                    {!a.fullyDepreciated && (
                      <button
                        onClick={() => handlePostDepreciation(a)}
                        disabled={postingDepreciationId === a.id}
                        className="text-[10px] text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {postingDepreciationId === a.id ? "Posting…" : "Post this month"}
                      </button>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", a.fullyDepreciated ? "bg-muted-foreground" : "bg-primary")}
                      style={{ width: `${depPct}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    {[
                      { label: "Cost", value: formatCurrency(cost) },
                      { label: "Accumulated", value: formatCurrency(a.accumulatedDepreciation), muted: true },
                      { label: "Net Book Value", value: formatCurrency(a.netBookValue), highlight: true },
                      { label: "Monthly Dep.", value: a.fullyDepreciated ? "—" : formatCurrency(a.monthlyDepreciation) },
                    ].map((f) => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                        <p className={cn("text-sm font-semibold", f.highlight ? "text-emerald-500" : f.muted ? "text-muted-foreground" : "text-foreground")}>
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Hire Purchase / Installment */}
                  {a.financed && outstandingAtEntry > 0 && (
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Hire Purchase{a.lender ? ` — ${a.lender}` : ""}
                        </p>
                        {!a.loanFullyPaid && (
                          <Button
                            size="sm" variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={recordingPaymentId === a.id}
                            onClick={() => handleRecordPayment(a)}
                          >
                            {recordingPaymentId === a.id ? "Recording…" : "+ Record Payment"}
                          </Button>
                        )}
                      </div>
                      <div className="h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", a.loanFullyPaid ? "bg-emerald-500" : "bg-rose-500")}
                          style={{ width: `${a.loanPaidPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Balance at Entry</p>
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(outstandingAtEntry)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Outstanding Now</p>
                          <p className={cn("text-sm font-semibold", a.loanFullyPaid ? "text-emerald-500" : "text-rose-500")}>
                            {a.loanFullyPaid ? "Paid Off" : formatCurrency(a.currentOutstanding)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Payments Made</p>
                          <p className="text-sm font-semibold text-foreground">{a.installmentsPaid} recorded</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                            Remaining ({a.installmentFrequency ? FREQ_LABEL[a.installmentFrequency] ?? a.installmentFrequency : "—"})
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {a.loanFullyPaid ? "—" : `${a.remainingInstallments} × ${a.installmentAmount ? formatCurrency(parseFloat(a.installmentAmount)) : "—"}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* ── Add Asset Dialog ── */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">

            {/* Basic info */}
            <div className="space-y-3">
              <div>
                <Label>Asset Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Isuzu Tanker ZM 1234 AB" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional notes" />
              </div>
              <div>
                <Label>Link to Truck (optional)</Label>
                <Select value={form.truckId || "none"} onValueChange={(v) => set("truckId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select truck…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Purchase & depreciation */}
            <div className="border border-border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Purchase & Depreciation</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Price (USD) *</Label>
                  <Input type="number" min="0" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Salvage Value (USD)</Label>
                  <Input type="number" min="0" value={form.salvageValue} onChange={(e) => set("salvageValue", e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Date *</Label>
                  <Input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
                </div>
                <div>
                  <Label>Useful Life (years) *</Label>
                  <Input type="number" min="1" max="50" value={form.usefulLifeYears} onChange={(e) => set("usefulLifeYears", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Depreciation Method</Label>
                <Select value={form.depreciationMethod} onValueChange={(v) => set("depreciationMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight-Line — equal amount each month</SelectItem>
                    <SelectItem value="declining_balance">Declining Balance — higher early, tapers off</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Migration toggle */}
              <label className="flex items-start gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isMigration}
                  onChange={(e) => set("isMigration", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">This asset was already in use before today</p>
                  <p className="text-xs text-muted-foreground">Enter the accumulated depreciation and remaining life your accountant has on record</p>
                </div>
              </label>

              {form.isMigration && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
                  <div>
                    <Label>Accumulated Depreciation to Date (USD)</Label>
                    <Input type="number" min="0" value={form.entryAccumulatedDepreciation} onChange={(e) => set("entryAccumulatedDepreciation", e.target.value)} placeholder="e.g. 24000" />
                  </div>
                  <div>
                    <Label>Remaining Useful Life (months)</Label>
                    <Input type="number" min="1" value={form.remainingUsefulLifeMonths} onChange={(e) => set("remainingUsefulLifeMonths", e.target.value)} placeholder="e.g. 36" />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground -mt-1">
                    Get these figures from your previous accounting system or accountant. The system will calculate depreciation going forward from today using these numbers.
                  </p>
                </div>
              )}
            </div>

            {/* Financing */}
            <div className="border border-border rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.financed}
                  onChange={(e) => set("financed", e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Purchased on hire purchase / installment plan</p>
                  <p className="text-xs text-muted-foreground">Direct seller agreement — not a bank loan</p>
                </div>
              </label>

              {form.financed && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div>
                    <Label>Seller / Finance Company</Label>
                    <Input value={form.lender} onChange={(e) => set("lender", e.target.value)} placeholder="e.g. ABC Truck Dealers, Isuzu Finance" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Down Payment (USD)</Label>
                      <Input type="number" min="0" value={form.downPayment} onChange={(e) => set("downPayment", e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>{form.isMigration ? "Outstanding Balance Today (USD)" : "Remaining Balance to Pay (USD)"}</Label>
                      <Input type="number" min="0" value={form.loanAmount} onChange={(e) => set("loanAmount", e.target.value)} placeholder="0.00" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {form.isMigration ? "What you still owe as of today" : "Total price minus down payment"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Installment Amount (USD)</Label>
                      <Input type="number" min="0" value={form.installmentAmount} onChange={(e) => set("installmentAmount", e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Frequency</Label>
                      <Select value={form.installmentFrequency} onValueChange={(v) => set("installmentFrequency", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="bi-annual">Bi-Annual</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {formRemainingInstallments !== null && (
                    <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                      Remaining installments: <span className="font-semibold text-foreground">{formRemainingInstallments}</span> payments of{" "}
                      <span className="font-semibold text-foreground">{form.installmentAmount ? formatCurrency(parseFloat(form.installmentAmount)) : "—"}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Register Asset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Asset?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the asset record and reverse its journal entry. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
