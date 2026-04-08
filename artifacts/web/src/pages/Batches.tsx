import { useState } from "react";
import { useGetBatches, useCreateBatch, useUpdateBatch, useGetClients, useGetAgents } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useLocation } from "wouter";
import { exportToExcel } from "@/lib/export";
import { Plus, Download, Search, Package, ArrowRight, Truck, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { StatusRevertDialog } from "@/components/StatusRevertDialog";
import { ROUTES, getRouteShort, DEFAULT_ROUTE } from "@/lib/routes";

const BATCH_STATUS_ORDER = ["planning", "loading", "in_transit", "delivered", "invoiced", "closed"];
const BATCH_FINANCIAL_STATUSES = ["invoiced", "closed"];

const STATUS_FILTERS = ["all", "planning", "loading", "in_transit", "delivered", "invoiced", "cancelled"];
const STATUS_LABEL: Record<string, string> = { all: "All", planning: "Planning", loading: "Loading", in_transit: "In Transit", delivered: "Delivered", invoiced: "Invoiced", cancelled: "Cancelled" };
export default function Batches() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", clientId: "", route: DEFAULT_ROUTE, ratePerMt: "", agentId: "", agentFeePerMt: "", notes: "" });
  const [editBatch, setEditBatch] = useState<any | null>(null);
  const [cancelBatch, setCancelBatch] = useState<any | null>(null);
  const [batchRevertDialog, setBatchRevertDialog] = useState<{ open: boolean; fromStatus: string; toStatus: string } | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;
  const { data: batches = [], isLoading } = useGetBatches(params);
  const { data: clients = [] } = useGetClients();
  const { data: agents = [] } = useGetAgents();
  const { mutateAsync: createBatch, isPending } = useCreateBatch();
  const { mutateAsync: updateBatch, isPending: updating } = useUpdateBatch();

  const filtered = (batches as any[]).filter((b) =>
    !search || b.name?.toLowerCase().includes(search.toLowerCase()) || b.clientName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name || !form.clientId || !form.ratePerMt) return;
    await createBatch({ data: { ...form, clientId: parseInt(form.clientId), ratePerMt: parseFloat(form.ratePerMt), ...(form.agentId ? { agentId: parseInt(form.agentId), agentFeePerMt: form.agentFeePerMt ? parseFloat(form.agentFeePerMt) : null } : { agentId: null, agentFeePerMt: null }), status: "planning" } });
    qc.invalidateQueries({ queryKey: ["/api/batches"] });
    setShowCreate(false);
    setForm({ name: "", clientId: "", route: DEFAULT_ROUTE, ratePerMt: "", agentId: "", agentFeePerMt: "", notes: "" });
  };

  const performBatchUpdate = async (revertReason?: string) => {
    if (!editBatch) return;
    await updateBatch({
      id: editBatch.id,
      data: {
        name: editBatch.name,
        ratePerMt: parseFloat(editBatch.ratePerMt),
        notes: editBatch.notes,
        status: editBatch.status,
        agentId: editBatch.agentId ? parseInt(editBatch.agentId) : null,
        agentFeePerMt: editBatch.agentFeePerMt ? parseFloat(editBatch.agentFeePerMt) : null,
        ...(revertReason ? { revertReason } : {}),
      } as any,
    });
    qc.invalidateQueries({ queryKey: ["/api/batches"] });
    setEditBatch(null);
    setBatchRevertDialog(null);
  };

  const handleUpdate = async () => {
    if (!editBatch) return;
    const originalStatus = editBatch._originalStatus ?? editBatch.status;
    const fromIdx = BATCH_STATUS_ORDER.indexOf(originalStatus);
    const toIdx = BATCH_STATUS_ORDER.indexOf(editBatch.status);
    const isBackward = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
    if (isBackward) {
      setBatchRevertDialog({ open: true, fromStatus: originalStatus, toStatus: editBatch.status });
      return;
    }
    await performBatchUpdate();
  };

  const handleCancelBatch = async () => {
    if (!cancelBatch) return;
    await fetch(`/api/batches/${cancelBatch.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "cancelled" }),
    });
    qc.invalidateQueries({ queryKey: ["/api/batches"] });
    setCancelBatch(null);
  };

  return (
    <Layout>
      <PageHeader title="Batches" subtitle="Manage and track all operational batches" actions={
        <Button onClick={() => setShowCreate(true)} size="sm" variant="primary">
          <Plus className="w-4 h-4 mr-1" /> New Batch
        </Button>
      } />
      <PageContent>
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search batches..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm w-52" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Batch list */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading batches...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No batches found</p>
              <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Create a new batch to start assigning trucks</p>
              <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Batch</Button>
            </div>
          ) : filtered.map((b: any) => (
            <div key={b.id} onClick={() => navigate(`/batches/${b.id}`)}
              className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all group">
              {/* Left indicator */}
              <div className="w-1 h-10 rounded-full bg-primary/40 group-hover:bg-primary transition-colors shrink-0" />
              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{b.name || `Batch #${b.id}`}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{b.clientName}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{getRouteShort(b.route)}</span>
                  <span>·</span>
                  <span>{formatCurrency(b.ratePerMt)}/MT</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{b.activeTrips ?? 0}/{b.truckCount ?? 0} trucks</span>
                  <span>·</span>
                  <span>{formatDate(b.createdAt)}</span>
                </div>
              </div>
              {/* Right: status + actions */}
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={b.status} />
                <button onClick={(e) => { e.stopPropagation(); setEditBatch({ ...b, ratePerMt: String(b.ratePerMt ?? ""), _originalStatus: b.status }); }} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {b.status === "planning" && (
                  <button onClick={(e) => { e.stopPropagation(); setCancelBatch(b); }} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded" title="Cancel batch">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </PageContent>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create New Batch</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Batch Name *</Label>
              <Input placeholder="e.g. BATCH-2026-001" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{(clients as any[]).map((c:any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Route *</Label>
              <Select value={form.route} onValueChange={(v) => setForm({ ...form, route: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ROUTES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate per MT (USD) *</Label>
              <Input type="number" placeholder="0.00" value={form.ratePerMt} onChange={(e) => setForm({ ...form, ratePerMt: e.target.value })} className="mt-1.5" />
            </div>
            {(agents as any[]).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Agent <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v === "none" ? "" : v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="No agent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No agent</SelectItem>
                      {(agents as any[]).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agent fee/MT <span className="text-muted-foreground text-xs">(USD)</span></Label>
                  <Input type="number" placeholder="0.00" value={form.agentFeePerMt} onChange={(e) => setForm({ ...form, agentFeePerMt: e.target.value })} className="mt-1.5" disabled={!form.agentId} />
                </div>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Input placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending || !form.name || !form.clientId || !form.ratePerMt}>
              {isPending ? "Creating..." : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={!!editBatch} onOpenChange={() => setEditBatch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Batch — {editBatch?.name}</DialogTitle></DialogHeader>
          {editBatch && (
            <div className="space-y-4 py-2">
              <div><Label>Batch Name *</Label><Input value={editBatch.name} onChange={(e) => setEditBatch({ ...editBatch, name: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Status</Label>
                <Select value={editBatch.status} onValueChange={(v) => setEditBatch({ ...editBatch, status: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["planning", "loading", "in_transit", "delivered", "invoiced", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Rate per MT (USD) *</Label><Input type="number" value={editBatch.ratePerMt} onChange={(e) => setEditBatch({ ...editBatch, ratePerMt: e.target.value })} className="mt-1.5" /></div>
              {(agents as any[]).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Agent <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={editBatch.agentId ? String(editBatch.agentId) : "none"} onValueChange={(v) => setEditBatch({ ...editBatch, agentId: v === "none" ? null : v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="No agent" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No agent</SelectItem>
                        {(agents as any[]).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Agent fee/MT <span className="text-muted-foreground text-xs">(USD)</span></Label>
                    <Input type="number" placeholder="0.00" value={editBatch.agentFeePerMt ?? ""} onChange={(e) => setEditBatch({ ...editBatch, agentFeePerMt: e.target.value })} className="mt-1.5" disabled={!editBatch.agentId} />
                  </div>
                </div>
              )}
              <div><Label>Notes</Label><Input value={editBatch.notes ?? ""} onChange={(e) => setEditBatch({ ...editBatch, notes: e.target.value })} className="mt-1.5" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatch(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updating || !editBatch?.name}>{updating ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Batch Confirm */}
      <Dialog open={!!cancelBatch} onOpenChange={() => setCancelBatch(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancel Batch</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to cancel batch <strong>{cancelBatch?.name}</strong>? This will mark the batch as cancelled. No trips have started, so no data will be lost.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelBatch(null)}>Keep Batch</Button>
            <Button variant="destructive" onClick={handleCancelBatch}>Cancel Batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {batchRevertDialog && editBatch && (
        <StatusRevertDialog
          open={batchRevertDialog.open}
          fromStatus={batchRevertDialog.fromStatus}
          toStatus={batchRevertDialog.toStatus}
          entityType="batch"
          isBlocked={
            BATCH_FINANCIAL_STATUSES.includes(batchRevertDialog.fromStatus) &&
            !["owner", "admin", "manager"].includes(user?.role ?? "")
          }
          onClose={() => setBatchRevertDialog(null)}
          onConfirm={(reason) => performBatchUpdate(reason)}
        />
      )}
    </Layout>
  );
}
