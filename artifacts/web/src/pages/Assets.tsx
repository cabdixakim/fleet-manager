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
import { Plus, Trash2, TrendingDown, Package, DollarSign, BarChart2, CreditCard, CheckCircle2 } from "lucide-react";
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
  financed: boolean;
  lender: string | null;
  downPayment: string | null;
  loanAmount: string | null;
  installmentAmount: string | null;
  installmentFrequency: string | null;
  totalInstallments: number | null;
  installmentsPaid: number;
  // computed
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthsElapsed: number;
  fullyDepreciated: boolean;
  outstandingBalance: number;
  loanPaidPct: number;
  loanFullyPaid: boolean;
  createdAt: string;
}

interface Truck { id: number; plateNumber: string; }

const EMPTY_FORM = {
  name: "",
  description: "",
  truckId: "",
  purchasePrice: "",
  purchaseDate: format(new Date(), "yyyy-MM-dd"),
  usefulLifeYears: "5",
  salvageValue: "0",
  // financing
  financed: false,
  lender: "",
  downPayment: "",
  loanAmount: "",
  installmentAmount: "",
  installmentFrequency: "monthly",
  totalInstallments: "",
  installmentsPaid: "0",
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
  const totalOutstanding = assets.filter((a) => a.financed).reduce((s, a) => s + a.outstandingBalance, 0);
  const monthlyDep = assets.reduce((s, a) => s + (a.fullyDepreciated ? 0 : a.monthlyDepreciation), 0);

  const financedAssets = assets.filter((a) => a.financed);

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
        financed: form.financed,
      };
      if (form.financed) {
        body.lender = form.lender || null;
        body.downPayment = form.downPayment ? parseFloat(form.downPayment) : null;
        body.loanAmount = form.loanAmount ? parseFloat(form.loanAmount) : null;
        body.installmentAmount = form.installmentAmount ? parseFloat(form.installmentAmount) : null;
        body.installmentFrequency = form.installmentFrequency || null;
        body.totalInstallments = form.totalInstallments ? parseInt(form.totalInstallments) : null;
        body.installmentsPaid = parseInt(form.installmentsPaid || "0");
      }
      const res = await fetch("/api/assets", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
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

  async function handleDelete(id: number) {
    await fetch(`/api/assets/${id}`, { method: "DELETE", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["/api/assets"] });
    setConfirmDeleteId(null);
    toast({ title: "Asset removed" });
  }

  async function handleRecordPayment(id: number) {
    setRecordingPaymentId(id);
    try {
      const res = await fetch(`/api/assets/${id}/record-payment`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      await qc.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Payment recorded" });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    } finally {
      setRecordingPaymentId(null);
    }
  }

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Layout>
      <PageHeader
        title="Asset Register"
        subtitle="Track fixed assets, depreciation and loan repayments"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Asset
          </Button>
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
              const loanAmt = a.loanAmount ? parseFloat(a.loanAmount) : 0;
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
                            <CreditCard className="w-3 h-3" /> Financed
                          </span>
                        )}
                        {a.financed && a.loanFullyPaid && (
                          <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Loan Paid Off
                          </span>
                        )}
                        {a.fullyDepreciated && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Fully depreciated</span>
                        )}
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Purchased {a.purchaseDate} · {a.usefulLifeYears}yr useful life · {a.monthsElapsed}mo elapsed
                        {a.financed && a.downPayment ? ` · Down payment ${formatCurrency(parseFloat(a.downPayment))}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Depreciation section */}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Depreciation</p>
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

                  {/* Loan section */}
                  {a.financed && loanAmt > 0 && (
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Loan Repayment{a.lender ? ` — ${a.lender}` : ""}
                        </p>
                        {!a.loanFullyPaid && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={recordingPaymentId === a.id}
                            onClick={() => handleRecordPayment(a.id)}
                          >
                            {recordingPaymentId === a.id ? "Recording…" : "+ Record Payment"}
                          </Button>
                        )}
                      </div>
                      {/* Loan progress bar */}
                      <div className="h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", a.loanFullyPaid ? "bg-emerald-500" : "bg-rose-500")}
                          style={{ width: `${a.loanPaidPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Loan Amount</p>
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(loanAmt)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Outstanding</p>
                          <p className={cn("text-sm font-semibold", a.loanFullyPaid ? "text-emerald-500" : "text-rose-500")}>
                            {a.loanFullyPaid ? "Paid Off" : formatCurrency(a.outstandingBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Installments</p>
                          <p className="text-sm font-semibold text-foreground">
                            {a.installmentsPaid}{a.totalInstallments ? `/${a.totalInstallments}` : ""} paid
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                            {a.installmentFrequency ? FREQ_LABEL[a.installmentFrequency] ?? a.installmentFrequency : ""} Payment
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {a.installmentAmount ? formatCurrency(parseFloat(a.installmentAmount)) : "—"}
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

      {/* Add Asset Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Basic info */}
            <div>
              <Label>Asset Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Truck ZM 1234 AB" />
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

            {/* Financing toggle */}
            <div className="border border-border rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.financed}
                  onChange={(e) => set("financed", e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Purchased on credit / installments</p>
                  <p className="text-xs text-muted-foreground">Truck was bought with a loan, bank finance, or in installments</p>
                </div>
              </label>

              {form.financed && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div>
                    <Label>Lender / Finance Company</Label>
                    <Input value={form.lender} onChange={(e) => set("lender", e.target.value)} placeholder="e.g. Stanbic Bank, ABC Finance" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Down Payment (USD)</Label>
                      <Input type="number" min="0" value={form.downPayment} onChange={(e) => set("downPayment", e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Total Loan Amount (USD)</Label>
                      <Input type="number" min="0" value={form.loanAmount} onChange={(e) => set("loanAmount", e.target.value)} placeholder="0.00" />
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Total Installments</Label>
                      <Input type="number" min="1" value={form.totalInstallments} onChange={(e) => set("totalInstallments", e.target.value)} placeholder="e.g. 36" />
                    </div>
                    <div>
                      <Label>Already Paid (installments)</Label>
                      <Input type="number" min="0" value={form.installmentsPaid} onChange={(e) => set("installmentsPaid", e.target.value)} placeholder="0" />
                    </div>
                  </div>
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
          <p className="text-sm text-muted-foreground">This will permanently remove the asset record. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
