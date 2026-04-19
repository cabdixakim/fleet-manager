import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, Trash2, TrendingDown, Package, DollarSign, BarChart2 } from "lucide-react";
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
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthsElapsed: number;
  fullyDepreciated: boolean;
  createdAt: string;
}

interface Truck {
  id: number;
  plateNumber: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  truckId: "",
  purchasePrice: "",
  purchaseDate: format(new Date(), "yyyy-MM-dd"),
  usefulLifeYears: "5",
  salvageValue: "0",
};

export default function Assets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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
  const monthlyDep = assets.reduce((s, a) => s + (a.fullyDepreciated ? 0 : a.monthlyDepreciation), 0);

  async function handleSave() {
    if (!form.name || !form.purchasePrice || !form.purchaseDate || !form.usefulLifeYears) {
      toast({ title: "Missing fields", description: "Name, purchase price, date and useful life are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          truckId: form.truckId || null,
          purchasePrice: parseFloat(form.purchasePrice),
          purchaseDate: form.purchaseDate,
          usefulLifeYears: parseInt(form.usefulLifeYears),
          salvageValue: parseFloat(form.salvageValue || "0"),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
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

  return (
    <Layout>
      <PageHeader
        title="Asset Register"
        subtitle="Track fixed assets and their depreciation"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Asset
          </Button>
        }
      />
      <PageContent>
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Asset Cost", value: formatCurrency(totalCost), icon: Package, color: "text-blue-500" },
            { label: "Accumulated Depreciation", value: formatCurrency(totalAccum), icon: TrendingDown, color: "text-red-500" },
            { label: "Net Book Value", value: formatCurrency(totalNBV), icon: BarChart2, color: "text-emerald-500" },
            { label: "Monthly Depreciation", value: formatCurrency(monthlyDep), icon: DollarSign, color: "text-amber-500" },
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
              const pct = cost > 0 ? Math.min(100, (a.accumulatedDepreciation / cost) * 100) : 0;
              return (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">{a.name}</span>
                        {a.plateNumber && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{a.plateNumber}</span>
                        )}
                        {a.fullyDepreciated && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Fully depreciated</span>
                        )}
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Purchased {a.purchaseDate} · {a.usefulLifeYears}yr useful life · {a.monthsElapsed}mo elapsed
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Depreciation bar */}
                  <div className="h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", a.fullyDepreciated ? "bg-muted-foreground" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Figures */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                </div>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* Add Asset Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Asset Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Truck ZM 1234 AB" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div>
              <Label>Link to Truck (optional)</Label>
              <Select value={form.truckId} onValueChange={(v) => setForm((f) => ({ ...f, truckId: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select truck…" />
                </SelectTrigger>
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
                <Input type="number" min="0" value={form.purchasePrice} onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Salvage Value (USD)</Label>
                <Input type="number" min="0" value={form.salvageValue} onChange={(e) => setForm((f) => ({ ...f, salvageValue: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Date *</Label>
                <Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
              </div>
              <div>
                <Label>Useful Life (years) *</Label>
                <Input type="number" min="1" max="50" value={form.usefulLifeYears} onChange={(e) => setForm((f) => ({ ...f, usefulLifeYears: e.target.value }))} />
              </div>
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
          <DialogHeader>
            <DialogTitle>Remove Asset?</DialogTitle>
          </DialogHeader>
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
