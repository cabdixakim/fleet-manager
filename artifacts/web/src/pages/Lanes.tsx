import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { initLanes } from "@/lib/routes";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, Route, GripVertical, X, ChevronDown, ChevronUp } from "lucide-react";

interface LaneCheckpoint {
  seq: number;
  name: string;
  country: string;
  documentType: string | null;
  feeUsd: number | null;
  clearanceRequired: boolean;
}

interface Lane {
  id: number;
  value: string;
  label: string;
  short: string;
  chart: string;
  sortOrder: number;
  isActive: boolean;
  checkpoints: LaneCheckpoint[];
}

const emptyCheckpoint = (): LaneCheckpoint => ({ seq: 0, name: "", country: "", documentType: null, feeUsd: null, clearanceRequired: false });
const emptyForm = { label: "", short: "", chart: "" };

function slugPreview(label: string) {
  return label.trim()
    .toLowerCase()
    .replace(/\s*[→\->]+\s*/g, "_to_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function Lanes() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editLane, setEditLane] = useState<Lane | null>(null);
  const [deleteLane, setDeleteLane] = useState<Lane | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editCheckpoints, setEditCheckpoints] = useState<LaneCheckpoint[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);

  const { data: lanes = [], isLoading } = useQuery<Lane[]>({
    queryKey: ["/api/lanes/all"],
    queryFn: () => fetch("/api/lanes/all", { credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => initLanes(data.filter(l => l.isActive)),
  });

  const addMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch("/api/lanes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lanes"] });
      qc.invalidateQueries({ queryKey: ["/api/lanes/all"] });
      toast({ title: "Route added" });
      setShowAdd(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await fetch(`/api/lanes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lanes"] });
      qc.invalidateQueries({ queryKey: ["/api/lanes/all"] });
      toast({ title: "Route updated" });
      setEditLane(null);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/lanes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lanes"] });
      qc.invalidateQueries({ queryKey: ["/api/lanes/all"] });
      toast({ title: "Route removed" });
      setDeleteLane(null);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openEdit(lane: Lane) {
    setEditLane(lane);
    setForm({ label: lane.label, short: lane.short, chart: lane.chart });
    setEditCheckpoints((lane.checkpoints ?? []).map((cp, i) => ({ ...cp, seq: i + 1 })));
    setShowCheckpoints((lane.checkpoints ?? []).length > 0);
  }

  function addCheckpoint() {
    setEditCheckpoints((prev) => [...prev, { ...emptyCheckpoint(), seq: prev.length + 1 }]);
    setShowCheckpoints(true);
  }

  function removeCheckpoint(index: number) {
    setEditCheckpoints((prev) => prev.filter((_, i) => i !== index).map((cp, i) => ({ ...cp, seq: i + 1 })));
  }

  function updateCheckpoint(index: number, patch: Partial<LaneCheckpoint>) {
    setEditCheckpoints((prev) => prev.map((cp, i) => i === index ? { ...cp, ...patch } : cp));
  }

  const slug = slugPreview(form.label);

  return (
    <Layout>
      <PageHeader
        title="Routes"
        subtitle="Manage the lanes available when creating batches"
        actions={
          <Button size="sm" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Route
          </Button>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="text-muted-foreground text-sm py-12 text-center">Loading…</div>
        ) : lanes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Route className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No routes configured yet.</p>
            <Button size="sm" variant="outline" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add First Route
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl mx-auto">
            {lanes.map((lane) => (
              <div
                key={lane.id}
                className={`bg-card border rounded-xl px-4 py-3 flex items-center gap-4 ${!lane.isActive ? "opacity-50" : ""}`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{lane.label}</p>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground font-mono bg-secondary rounded px-1.5 py-0.5">{lane.value}</span>
                    <span className="text-[11px] text-muted-foreground">Short: <span className="font-medium text-foreground">{lane.short}</span></span>
                    <span className="text-[11px] text-muted-foreground">Chart: <span className="font-medium text-foreground">{lane.chart}</span></span>
                    {(lane.checkpoints ?? []).length > 0 && (
                      <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                        {lane.checkpoints.length} checkpoint{lane.checkpoints.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {!lane.isActive && (
                  <span className="text-[10px] text-muted-foreground bg-secondary rounded px-2 py-0.5">Inactive</span>
                )}
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(lane)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteLane(lane)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContent>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => !o && setShowAdd(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Route</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Full Label <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Beira → Lusaka"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              />
              {form.label && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Slug: <span className="text-foreground">{slug}</span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Short Label <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Beira → Lsk"
                value={form.short}
                onChange={e => setForm(p => ({ ...p, short: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chart Label <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Beira→Lsk"
                value={form.chart}
                onChange={e => setForm(p => ({ ...p, chart: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Used on report charts — keep it short (under 10 chars).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate({ label: form.label, short: form.short, chart: form.chart })}
              disabled={!form.label.trim() || !form.short.trim() || !form.chart.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? "Adding…" : "Add Route"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editLane} onOpenChange={(o) => !o && setEditLane(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Route</DialogTitle></DialogHeader>
          {editLane && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Slug (read-only)</Label>
                <Input value={editLane.value} disabled className="font-mono text-sm opacity-60" />
                <p className="text-[11px] text-muted-foreground">The slug is fixed — changing it would break existing batches.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Full Label</Label>
                <Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Short Label</Label>
                <Input value={form.short} onChange={e => setForm(p => ({ ...p, short: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Chart Label</Label>
                <Input value={form.chart} onChange={e => setForm(p => ({ ...p, chart: e.target.value }))} />
              </div>

              {/* Checkpoint editor */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-semibold text-foreground w-full"
                  onClick={() => setShowCheckpoints(!showCheckpoints)}
                >
                  {showCheckpoints ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Border Checkpoints
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{editCheckpoints.length} configured</span>
                </button>
                {showCheckpoints && (
                  <div className="space-y-3 pl-1">
                    <p className="text-[11px] text-muted-foreground">
                      Checkpoints define the border stops for this lane. Each checkpoint can require a clearance document and/or a fee. Order determines the status sequence for trips on this lane.
                    </p>
                    {editCheckpoints.map((cp, i) => (
                      <div key={i} className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                          <Input
                            placeholder="Checkpoint name (e.g. Chirundu Border)"
                            value={cp.name}
                            onChange={e => updateCheckpoint(i, { name: e.target.value })}
                            className="flex-1 h-8 text-sm"
                          />
                          <button type="button" onClick={() => removeCheckpoint(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Country (ISO)</Label>
                            <Input
                              placeholder="e.g. ZM"
                              value={cp.country ?? ""}
                              onChange={e => updateCheckpoint(i, { country: e.target.value.toUpperCase().slice(0, 2) })}
                              className="h-7 text-xs font-mono mt-0.5"
                              maxLength={2}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Doc Type</Label>
                            <Input
                              placeholder="e.g. T1, TR8"
                              value={cp.documentType ?? ""}
                              onChange={e => updateCheckpoint(i, { documentType: e.target.value || null })}
                              className="h-7 text-xs mt-0.5"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Fee (USD)</Label>
                            <Input
                              type="number"
                              placeholder="0.00"
                              value={cp.feeUsd ?? ""}
                              onChange={e => updateCheckpoint(i, { feeUsd: e.target.value ? parseFloat(e.target.value) : null })}
                              className="h-7 text-xs mt-0.5"
                            />
                          </div>
                          <div className="flex flex-col justify-end pb-0.5">
                            <Label className="text-[10px] text-muted-foreground mb-1.5">Clearance required</Label>
                            <Switch
                              checked={cp.clearanceRequired}
                              onCheckedChange={v => updateCheckpoint(i, { clearanceRequired: v })}
                            />
                          </div>
                        </div>
                        {cp.clearanceRequired && !cp.documentType && (
                          <p className="text-[10px] text-amber-500">Set a Doc Type so the clearance record is labelled correctly (e.g. T1, TR8).</p>
                        )}
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" className="w-full h-8 text-xs" onClick={addCheckpoint}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Checkpoint
                    </Button>
                  </div>
                )}
                {!showCheckpoints && (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs w-full" onClick={addCheckpoint}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Checkpoint
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLane(null)}>Cancel</Button>
            <Button
              onClick={() => editLane && editMutation.mutate({ id: editLane.id, body: { label: form.label, short: form.short, chart: form.chart, checkpoints: editCheckpoints.map((cp, i) => ({ ...cp, seq: i + 1 })) } })}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteLane} onOpenChange={(o) => !o && setDeleteLane(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove route?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteLane?.label}&rdquo; will be hidden from the batch creation dropdown. Existing batches on this route are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteLane && deleteMutation.mutate(deleteLane.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
