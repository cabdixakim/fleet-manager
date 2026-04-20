import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, ShieldCheck, ChevronDown } from "lucide-react";
import { format } from "date-fns";

interface Claim {
  id: number;
  truckId: number | null;
  tripId: number | null;
  plateNumber: string | null;
  claimType: string;
  status: string;
  insurerName: string | null;
  policyNumber: string | null;
  amountClaimed: number | null;
  amountSettled: number | null;
  incidentDate: string | null;
  filedDate: string | null;
  settledDate: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
}

interface Truck { id: number; plateNumber: string; }

const CLAIM_TYPE_LABEL: Record<string, string> = {
  cargo_loss: "Cargo Loss", accident: "Accident", theft: "Theft",
  third_party: "Third Party", other: "Other",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", filed: "Filed", acknowledged: "Acknowledged",
  approved: "Approved", rejected: "Rejected", settled: "Settled",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  filed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  acknowledged: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  settled: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TODAY = format(new Date(), "yyyy-MM-dd");

const EMPTY_FORM = {
  truckId: "", tripId: "", claimType: "accident", status: "draft",
  insurerName: "", policyNumber: "",
  amountClaimed: "", amountSettled: "",
  incidentDate: TODAY, filedDate: "", settledDate: "",
  description: "", notes: "",
};

type FilterStatus = "all" | string;

export default function InsuranceClaims() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterStatus>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Claim | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: claims = [], isLoading } = useQuery<Claim[]>({
    queryKey: ["/api/insurance-claims"],
    queryFn: () => fetch("/api/insurance-claims", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: trucks = [] } = useQuery<Truck[]>({
    queryKey: ["/api/trucks"],
    queryFn: () => fetch("/api/trucks", { credentials: "include" }).then((r) => r.json()),
  });

  const filtered = useMemo(() => claims.filter((c) => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterType !== "all" && c.claimType !== filterType) return false;
    return true;
  }), [claims, filterStatus, filterType]);

  const totalClaimed = useMemo(() => filtered.reduce((s, c) => s + (c.amountClaimed ?? 0), 0), [filtered]);
  const totalSettled = useMemo(() => filtered.reduce((s, c) => s + (c.amountSettled ?? 0), 0), [filtered]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowDialog(true);
  }

  function openEdit(c: Claim) {
    setEditing(c);
    setForm({
      truckId: c.truckId?.toString() ?? "",
      tripId: c.tripId?.toString() ?? "",
      claimType: c.claimType,
      status: c.status,
      insurerName: c.insurerName ?? "",
      policyNumber: c.policyNumber ?? "",
      amountClaimed: c.amountClaimed?.toString() ?? "",
      amountSettled: c.amountSettled?.toString() ?? "",
      incidentDate: c.incidentDate ?? "",
      filedDate: c.filedDate ?? "",
      settledDate: c.settledDate ?? "",
      description: c.description ?? "",
      notes: c.notes ?? "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.claimType) { toast({ title: "Claim type required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        claimType: form.claimType,
        status: form.status,
        insurerName: form.insurerName || null,
        policyNumber: form.policyNumber || null,
        amountClaimed: form.amountClaimed ? form.amountClaimed : null,
        amountSettled: form.amountSettled ? form.amountSettled : null,
        incidentDate: form.incidentDate || null,
        filedDate: form.filedDate || null,
        settledDate: form.settledDate || null,
        description: form.description || null,
        notes: form.notes || null,
        truckId: form.truckId ? parseInt(form.truckId) : null,
        tripId: form.tripId ? parseInt(form.tripId) : null,
      };
      const url = editing ? `/api/insurance-claims/${editing.id}` : "/api/insurance-claims";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      toast({ title: editing ? "Claim updated" : "Claim created" });
      qc.invalidateQueries({ queryKey: ["/api/insurance-claims"] });
      setShowDialog(false);
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/insurance-claims/${deleteId}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Claim deleted" });
      qc.invalidateQueries({ queryKey: ["/api/insurance-claims"] });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  function f(k: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));
  }

  return (
    <Layout>
      <PageHeader
        title="Insurance Claims"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> New Claim
          </Button>
        }
      />
      <PageContent>
        <div className="space-y-5 max-w-5xl">
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Claims", value: filtered.length.toString() },
              { label: "Active", value: filtered.filter((c) => !["settled", "rejected"].includes(c.status)).length.toString() },
              { label: "Amount Claimed", value: formatCurrency(totalClaimed), accent: "amber" as const },
              { label: "Amount Settled", value: formatCurrency(totalSettled), accent: "green" as const },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                <p className={cn("text-lg font-bold font-mono",
                  k.accent === "green" ? "text-green-400" : k.accent === "amber" ? "text-amber-400" : "text-foreground"
                )}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "draft", "filed", "acknowledged", "approved", "rejected", "settled"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors border",
                  filterStatus === s ? "bg-primary/10 text-primary border-primary/30" : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}>
                {s === "all" ? "All Status" : STATUS_LABEL[s]}
              </button>
            ))}
            <span className="text-muted-foreground text-xs">|</span>
            {(["all", "cargo_loss", "accident", "theft", "third_party", "other"] as const).map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors border",
                  filterType === t ? "bg-primary/10 text-primary border-primary/30" : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}>
                {t === "all" ? "All Types" : CLAIM_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Claims list */}
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No claims found</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Truck", "Type", "Status", "Insurer", "Incident", "Claimed", "Settled", ""].map((h) => (
                      <th key={h} className="py-2.5 px-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap last:w-12">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={c.id} className={cn("border-b border-border/50 hover:bg-accent/30 transition-colors last:border-0", i % 2 === 1 && "bg-muted/10")}>
                      <td className="py-2.5 px-3 font-mono font-medium text-xs">{c.plateNumber ?? "—"}</td>
                      <td className="py-2.5 px-3 text-xs">{CLAIM_TYPE_LABEL[c.claimType] ?? c.claimType}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", STATUS_COLOR[c.status] ?? "bg-muted text-muted-foreground border-border")}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{c.insurerName ?? "—"}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">{c.incidentDate ?? "—"}</td>
                      <td className="py-2.5 px-3 text-xs font-mono text-amber-400">{c.amountClaimed != null ? formatCurrency(c.amountClaimed) : "—"}</td>
                      <td className="py-2.5 px-3 text-xs font-mono text-green-400">{c.amountSettled != null ? formatCurrency(c.amountSettled) : "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent/50">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(c.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded hover:bg-accent/50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageContent>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { if (!saving) setShowDialog(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Claim" : "New Insurance Claim"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Claim Type</Label>
                <Select value={form.claimType} onValueChange={(v) => setForm((p) => ({ ...p, claimType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLAIM_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Truck</Label>
              <Select value={form.truckId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, truckId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select truck…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No truck</SelectItem>
                  {trucks.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.plateNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Insurer</Label>
                <Input value={form.insurerName} onChange={f("insurerName")} placeholder="e.g. Hollard Insurance" />
              </div>
              <div className="space-y-1">
                <Label>Policy Number</Label>
                <Input value={form.policyNumber} onChange={f("policyNumber")} placeholder="e.g. HI-2024-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount Claimed (USD)</Label>
                <Input type="number" value={form.amountClaimed} onChange={f("amountClaimed")} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Amount Settled (USD)</Label>
                <Input type="number" value={form.amountSettled} onChange={f("amountSettled")} placeholder="0.00" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Incident Date</Label>
                <Input type="date" value={form.incidentDate} onChange={f("incidentDate")} />
              </div>
              <div className="space-y-1">
                <Label>Filed Date</Label>
                <Input type="date" value={form.filedDate} onChange={f("filedDate")} />
              </div>
              <div className="space-y-1">
                <Label>Settled Date</Label>
                <Input type="date" value={form.settledDate} onChange={f("settledDate")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={f("description")} rows={2} placeholder="What happened?" className="resize-none" />
            </div>
            <div className="space-y-1">
              <Label>Internal Notes</Label>
              <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Internal notes…" className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Claim"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!deleting && !o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this claim?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
