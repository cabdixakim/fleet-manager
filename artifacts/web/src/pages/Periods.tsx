import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Lock, Unlock, AlertTriangle, Calendar, CheckCircle2, XCircle, TruckIcon, FileText, Users, ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Period = { id: number; name: string; startDate: string; endDate: string; isClosed: boolean };
type ClosePreview = {
  period: Period;
  openTrips: number;
  uninvoicedBatches: number;
  activeDrivers: number;
};

function StatRow({ icon: Icon, label, value, warn }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; warn: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg border", warn ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20")}>
      <Icon className={cn("w-4 h-4 shrink-0", warn ? "text-red-400" : "text-green-400")} />
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", warn ? "text-red-400" : "text-green-400")}>{value}</span>
      {warn ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
    </div>
  );
}

export default function Periods() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const { data: periods = [], isLoading } = useQuery<Period[]>({
    queryKey: ["/api/periods"],
    queryFn: () => fetch("/api/periods", { credentials: "include" }).then((r) => r.json()),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Period | null>(null);
  const [showClose, setShowClose] = useState<Period | null>(null);
  const [showReopen, setShowReopen] = useState<Period | null>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState("");

  const { data: closePreview, isLoading: previewLoading } = useQuery<ClosePreview>({
    queryKey: ["/api/periods", showClose?.id, "close-preview"],
    queryFn: () => fetch(`/api/periods/${showClose!.id}/close-preview`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!showClose,
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error ?? "Failed to create period"); return; }
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
      qc.invalidateQueries({ queryKey: ["current-period-header"] });
      setShowCreate(false);
      setForm({ name: "", startDate: "", endDate: "" });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/periods/${showEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: showEdit.name, startDate: showEdit.startDate, endDate: showEdit.endDate }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error ?? "Failed to update period"); return; }
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
      setShowEdit(null);
    } finally { setSaving(false); }
  };

  const handleClose = async () => {
    if (!showClose || closeConfirm !== "CLOSE") return;
    setClosing(true);
    try {
      const res = await fetch(`/api/periods/${showClose.id}/close`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); alert(e.error ?? "Failed to close period"); return; }
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
      qc.invalidateQueries({ queryKey: ["current-period-header"] });
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      setShowClose(null);
      setCloseConfirm("");
    } finally { setClosing(false); }
  };

  const handleReopen = async () => {
    if (!showReopen) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/periods/${showReopen.id}/reopen`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); alert(e.error ?? "Failed to reopen period"); return; }
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
      qc.invalidateQueries({ queryKey: ["current-period-header"] });
      setShowReopen(null);
    } finally { setClosing(false); }
  };

  const handleDelete = async (p: Period) => {
    if (!confirm(`Delete period "${p.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/periods/${p.id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) { const e = await res.json(); alert(e.error ?? "Failed to delete"); return; }
    qc.invalidateQueries({ queryKey: ["/api/periods"] });
  };

  const openPeriods = (periods as Period[]).filter((p) => !p.isClosed);
  const closedPeriods = (periods as Period[]).filter((p) => p.isClosed);

  const hasWarnings = closePreview && (closePreview.openTrips > 0 || closePreview.uninvoicedBatches > 0);

  return (
    <Layout>
      <PageHeader
        title="Accounting Periods"
        subtitle="Manage financial periods. Closing a period locks all client and subcontractor opening balances."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Period</Button>
          ) : undefined
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading periods...</div>
        ) : (periods as Period[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No periods yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mb-6">Create your first accounting period. When you close a period, all client and subcontractor opening balances will be locked for integrity.</p>
            {canManage && (
              <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Create First Period</Button>
            )}
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            {openPeriods.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Open Periods</h3>
                <div className="space-y-2">
                  {openPeriods.map((p) => (
                    <div key={p.id} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(p.startDate)} → {formatDate(p.endDate)}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                        <Unlock className="w-3 h-3" />Open
                      </span>
                      {canManage && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => setShowEdit(p)}>Edit</Button>
                          <Button size="sm" onClick={() => { setShowClose(p); setCloseConfirm(""); }} className="bg-amber-500 hover:bg-amber-600 text-white border-0">
                            <Lock className="w-3.5 h-3.5 mr-1.5" />Close Period
                          </Button>
                          {isAdmin && (
                            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleDelete(p)}>Delete</Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {closedPeriods.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Closed Periods</h3>
                <div className="space-y-2">
                  {closedPeriods.map((p) => (
                    <div key={p.id} className="bg-secondary/30 border border-border/50 rounded-xl px-5 py-4 flex items-center gap-4 opacity-80">
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(p.startDate)} → {formatDate(p.endDate)}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <Lock className="w-3 h-3" />Closed — OBs Locked
                      </span>
                      {isAdmin && (
                        <Button variant="outline" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setShowReopen(p)}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PageContent>

      {/* Create Period Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New Accounting Period</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Period Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. March 2026" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1" /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.startDate || !form.endDate}>{saving ? "Creating..." : "Create Period"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Period Dialog */}
      <Dialog open={!!showEdit} onOpenChange={(o) => !o && setShowEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Period</DialogTitle></DialogHeader>
          {showEdit && (
            <div className="space-y-3 py-2">
              <div><Label>Period Name</Label><Input value={showEdit.name} onChange={(e) => setShowEdit({ ...showEdit, name: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={showEdit.startDate} onChange={(e) => setShowEdit({ ...showEdit, startDate: e.target.value })} className="mt-1" /></div>
                <div><Label>End Date</Label><Input type="date" value={showEdit.endDate} onChange={(e) => setShowEdit({ ...showEdit, endDate: e.target.value })} className="mt-1" /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== CLOSE PERIOD — DRAMATIC CONFIRM MODAL ====== */}
      <Dialog open={!!showClose} onOpenChange={(o) => { if (!o) { setShowClose(null); setCloseConfirm(""); } }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0">
          {/* Red top stripe */}
          <div className="bg-gradient-to-r from-red-900/80 to-amber-900/80 px-6 pt-6 pb-5 border-b border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Close Period: {showClose?.name}</h2>
                <p className="text-sm text-red-300/80 mt-0.5">{showClose?.startDate} → {showClose?.endDate}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5 bg-background">
            {/* Pre-close health stats */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pre-Close Checklist</p>
              {previewLoading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading period health...</div>
              ) : closePreview ? (
                <div className="space-y-2">
                  <StatRow icon={TruckIcon} label="Trips still in transit / at border" value={closePreview.openTrips} warn={closePreview.openTrips > 0} />
                  <StatRow icon={FileText} label="Batches not yet invoiced" value={closePreview.uninvoicedBatches} warn={closePreview.uninvoicedBatches > 0} />
                </div>
              ) : null}
            </div>

            {/* Warning banner if issues exist */}
            {hasWarnings && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">There are unresolved items above. You can still close this period, but some balances may be inaccurate. Ensure all trips are delivered and all batches are invoiced first.</p>
              </div>
            )}

            {/* What happens list */}
            <div className="bg-secondary/40 border border-border rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">This action will permanently:</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Lock className="w-3 h-3 text-red-400 shrink-0" />Lock all client opening balances</li>
                <li className="flex items-center gap-2"><Lock className="w-3 h-3 text-red-400 shrink-0" />Lock all subcontractor opening balances</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />Require admin override with reason for any OB changes</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />Record this action in the audit log</li>
              </ul>
            </div>

            {/* Type-to-confirm */}
            <div>
              <Label className="text-sm font-medium">
                Type <span className="font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded text-xs">CLOSE</span> to confirm
              </Label>
              <Input
                value={closeConfirm}
                onChange={(e) => setCloseConfirm(e.target.value)}
                placeholder="Type CLOSE here..."
                className="mt-2 font-mono border-border focus-visible:ring-red-500/50"
                autoFocus={false}
              />
            </div>
          </div>

          <div className="px-6 pb-6 flex items-center justify-end gap-3 bg-background">
            <Button variant="outline" onClick={() => { setShowClose(null); setCloseConfirm(""); }}>Cancel</Button>
            <Button
              onClick={handleClose}
              disabled={closing || closeConfirm !== "CLOSE"}
              className={cn("border-0 text-white", closeConfirm === "CLOSE" ? "bg-red-600 hover:bg-red-700" : "bg-muted text-muted-foreground")}
            >
              {closing ? "Closing Period..." : "Close Period & Lock OBs"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reopen Period Dialog */}
      <Dialog open={!!showReopen} onOpenChange={(o) => !o && setShowReopen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reopen Period — {showReopen?.name}</DialogTitle>
            <DialogDescription>Admin-only action. This does NOT automatically unlock opening balances.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Reopening the period changes its status back to open. Opening balances remain locked — use the Adjust OB function on individual clients or subcontractors to modify them.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopen(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReopen} disabled={closing}>{closing ? "Reopening..." : "Reopen Period"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
