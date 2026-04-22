import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, ShieldCheck, Truck, Package, Users, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { differenceInDays } from "date-fns";

interface Policy {
  id: number;
  policyType: string;
  policyTypeLabel: string;
  insurerName: string;
  policyNumber: string;
  coverageAmount: number | null;
  premiumAmount: number | null;
  perLoadLimit: number | null;
  coverageScope: string | null;
  startDate: string | null;
  expiryDate: string | null;
  isActive: boolean;
  notes: string | null;
}

const POLICY_TYPES = [
  { value: "vehicle_fleet", label: "Fleet Vehicle Policy",      icon: Truck },
  { value: "cargo_transit", label: "Cargo / Goods-in-Transit",  icon: Package },
  { value: "third_party",   label: "Third-Party Liability",     icon: Users },
];

const POLICY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  vehicle_fleet: Truck,
  cargo_transit: Package,
  third_party:   Users,
};

function expiryStatus(expiryDate: string | null) {
  if (!expiryDate) return "none";
  const days = differenceInDays(new Date(expiryDate), new Date());
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "valid";
}

const STATUS_CONFIG = {
  expired: { label: "Expired",       cls: "text-red-400 bg-red-500/10 border-red-500/20",           icon: AlertTriangle },
  soon:    { label: "Expiring Soon",  cls: "text-amber-400 bg-amber-500/10 border-amber-500/20",      icon: Clock },
  valid:   { label: "Active",         cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  none:    { label: "No Expiry Set",  cls: "text-muted-foreground bg-muted/40 border-border",          icon: Clock },
};

const EMPTY_FORM = {
  policyType: "cargo_transit",
  insurerName: "",
  policyNumber: "",
  coverageAmount: "",
  premiumAmount: "",
  perLoadLimit: "",
  coverageScope: "",
  startDate: "",
  expiryDate: "",
  isActive: true,
  notes: "",
};

export default function CompanyPolicies() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: policies = [], isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/company-insurance-policies"],
    queryFn: () => fetch("/api/company-insurance-policies", { credentials: "include" }).then((r) => r.json()),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowDialog(true);
  }

  function openEdit(p: Policy) {
    setEditing(p);
    setForm({
      policyType: p.policyType,
      insurerName: p.insurerName,
      policyNumber: p.policyNumber,
      coverageAmount: p.coverageAmount?.toString() ?? "",
      premiumAmount: p.premiumAmount?.toString() ?? "",
      perLoadLimit: p.perLoadLimit?.toString() ?? "",
      coverageScope: p.coverageScope ?? "",
      startDate: p.startDate ?? "",
      expiryDate: p.expiryDate ?? "",
      isActive: p.isActive,
      notes: p.notes ?? "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.insurerName.trim() || !form.policyNumber.trim()) {
      toast({ title: "Insurer name and policy number are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        policyType: form.policyType,
        insurerName: form.insurerName.trim(),
        policyNumber: form.policyNumber.trim(),
        coverageAmount: form.coverageAmount || null,
        premiumAmount: form.premiumAmount || null,
        perLoadLimit: form.perLoadLimit || null,
        coverageScope: form.coverageScope || null,
        startDate: form.startDate || null,
        expiryDate: form.expiryDate || null,
        isActive: form.isActive,
        notes: form.notes || null,
      };
      const url = editing ? `/api/company-insurance-policies/${editing.id}` : "/api/company-insurance-policies";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      toast({ title: editing ? "Policy updated" : "Policy added" });
      qc.invalidateQueries({ queryKey: ["/api/company-insurance-policies"] });
      setShowDialog(false);
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const r = await fetch(`/api/company-insurance-policies/${deleteId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      toast({ title: "Policy deleted" });
      qc.invalidateQueries({ queryKey: ["/api/company-insurance-policies"] });
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally { setDeleteId(null); }
  }

  return (
    <Layout>
      <PageHeader
        title="Insurance Policies"
        subtitle="Company-level policies covering your fleet and cargo"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> Add Policy
          </Button>
        }
      />
      <PageContent>
        <div className="max-w-4xl space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No policies added yet.</p>
              <Button size="sm" variant="outline" onClick={openCreate}>Add your first policy</Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {policies.map((p) => {
                const Icon = POLICY_ICON[p.policyType] ?? ShieldCheck;
                const status = expiryStatus(p.expiryDate);
                const sc = STATUS_CONFIG[status];
                const StatusIcon = sc.icon;
                const daysLeft = p.expiryDate ? differenceInDays(new Date(p.expiryDate), new Date()) : null;

                return (
                  <div key={p.id} className={cn("rounded-xl border bg-card/80 p-4", !p.isActive && "opacity-60")}>
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{p.policyTypeLabel}</span>
                          {!p.isActive && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-muted/40 border-border text-muted-foreground">Inactive</span>
                          )}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border flex items-center gap-1", sc.cls)}>
                            <StatusIcon className="w-3 h-3" />
                            {status === "soon" && daysLeft !== null ? `Expires in ${daysLeft}d` : sc.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{p.insurerName} · {p.policyNumber}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-2 text-xs">
                          {p.coverageAmount && (
                            <div>
                              <span className="text-muted-foreground">Coverage</span>
                              <p className="font-medium text-foreground">{formatCurrency(p.coverageAmount)}</p>
                            </div>
                          )}
                          {p.premiumAmount && (
                            <div>
                              <span className="text-muted-foreground">Annual Premium</span>
                              <p className="font-medium text-foreground">{formatCurrency(p.premiumAmount)}</p>
                            </div>
                          )}
                          {p.perLoadLimit && (
                            <div>
                              <span className="text-muted-foreground">Per-Load Limit</span>
                              <p className="font-medium text-foreground">{formatCurrency(p.perLoadLimit)}</p>
                            </div>
                          )}
                          {p.expiryDate && (
                            <div>
                              <span className="text-muted-foreground">Expires</span>
                              <p className={cn("font-medium", status === "expired" ? "text-red-400" : status === "soon" ? "text-amber-400" : "text-foreground")}>
                                {new Date(p.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          )}
                          {p.coverageScope && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Scope</span>
                              <p className="font-medium text-foreground">{p.coverageScope}</p>
                            </div>
                          )}
                        </div>
                        {p.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{p.notes}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageContent>

      {/* Add / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { if (!saving) setShowDialog(o); }}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Policy" : "Add Insurance Policy"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Policy type — compact select */}
            <div className="space-y-1">
              <Label>Policy Type</Label>
              <Select value={form.policyType} onValueChange={(v) => setForm((f) => ({ ...f, policyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Insurer Name</Label>
                <Input value={form.insurerName} onChange={(e) => setForm((f) => ({ ...f, insurerName: e.target.value }))} placeholder="e.g. Hollard Insurance Zambia" />
              </div>
              <div className="space-y-1">
                <Label>Policy Number</Label>
                <Input value={form.policyNumber} onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))} placeholder="e.g. HI-GIT-2025-001" />
              </div>
              <div className="space-y-1">
                <Label>Coverage Scope</Label>
                <Input value={form.coverageScope} onChange={(e) => setForm((f) => ({ ...f, coverageScope: e.target.value }))} placeholder="e.g. SADC Region" />
              </div>
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Max Coverage (USD)</Label>
                <Input type="number" value={form.coverageAmount} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Annual Premium (USD)</Label>
                <Input type="number" value={form.premiumAmount} onChange={(e) => setForm((f) => ({ ...f, premiumAmount: e.target.value }))} placeholder="0.00" />
              </div>
              {form.policyType === "cargo_transit" && (
                <div className="col-span-2 space-y-1">
                  <Label>Per-Load Limit (USD)</Label>
                  <Input type="number" value={form.perLoadLimit} onChange={(e) => setForm((f) => ({ ...f, perLoadLimit: e.target.value }))} placeholder="e.g. 500000" />
                </div>
              )}
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Conditions, exclusions, broker contact…" rows={2} className="text-sm" />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", form.isActive ? "bg-primary" : "bg-muted-foreground/30")}
              >
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", form.isActive ? "translate-x-4" : "translate-x-0.5")} />
              </button>
              <span className="text-sm text-muted-foreground">Policy is active</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this policy?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
