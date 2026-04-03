import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetTrucks, useCreateTruck, useUpdateTruck, useDeleteTruck,
  useGetSubcontractors, useGetTruckDriverEngagements, useEngageDriverToTruck,
  useGetDrivers, useGetTruckDriverAssignments,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plus, Download, Search, Truck, Pencil, Trash2, User,
  Clock, CheckCircle, X, ChevronDown, History,
  Wifi, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["all", "available", "idle", "on_trip", "maintenance", "retired"];
const STATUS_LABEL: Record<string, string> = { all: "All", available: "Available", idle: "Idle", on_trip: "On Trip", maintenance: "Maintenance", retired: "Retired" };
const STATUS_COLOR: Record<string, string> = {
  available: "text-emerald-400 bg-emerald-500/10",
  idle: "text-yellow-400 bg-yellow-500/10",
  on_trip: "text-primary bg-primary/10",
  maintenance: "text-red-400 bg-red-500/10",
  retired: "text-muted-foreground bg-muted/60",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-400",
  idle: "bg-yellow-400",
  on_trip: "bg-primary animate-pulse",
  maintenance: "bg-red-400",
  retired: "bg-muted-foreground",
};

export default function Fleet() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTruck, setEditTruck] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [showDriverDialog, setShowDriverDialog] = useState<{ truck: any } | null>(null);

  const emptyForm = { plateNumber: "", trailerPlate: "", subcontractorId: "", status: "available", driverId: "__none__", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: trucks = [], isLoading, dataUpdatedAt } = useGetTrucks({ query: { refetchInterval: 30_000 } });
  const { data: subs = [] } = useGetSubcontractors();
  const { data: driverHistory = [] } = useGetTruckDriverEngagements(showDriverDialog?.truck?.id ?? null);
  const { data: drivers = [] } = useGetDrivers();
  const { mutateAsync: createTruck, isPending: creating } = useCreateTruck();
  const { mutateAsync: updateTruck, isPending: updating } = useUpdateTruck();
  const { mutateAsync: deleteTruck, isPending: deleting } = useDeleteTruck();
  const { mutateAsync: engageDriver, isPending: assigning } = useEngageDriverToTruck();
  const { data: allAssignments = [] } = useGetTruckDriverAssignments(null);

  const handleRetire = async () => {
    if (!confirmDelete) return;
    await updateTruck({ id: confirmDelete.id, data: { status: "retired" } as any });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    setConfirmDelete(null);
  };

  const filtered = (trucks as any[]).filter((t) => {
    const matchSearch = !search ||
      t.plateNumber?.toLowerCase().includes(search.toLowerCase()) ||
      t.subcontractorName?.toLowerCase().includes(search.toLowerCase()) ||
      t.trailerPlate?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    if (!form.plateNumber || !form.subcontractorId) return;
    const truck = await createTruck({
      data: {
        plateNumber: form.plateNumber,
        trailerPlate: form.trailerPlate || undefined,
        subcontractorId: parseInt(form.subcontractorId),
        status: form.status as any,
        notes: form.notes || undefined,
      }
    });
    // If driver was selected, assign them
    if (form.driverId && form.driverId !== "__none__" && truck?.id) {
      try {
        await engageDriver({ truckId: truck.id, driverId: parseInt(form.driverId) });
      } catch {}
    }
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-assignments"] });
    setShowCreate(false);
    setForm(emptyForm);
  };

  const handleUpdate = async () => {
    if (!editTruck) return;
    await updateTruck({
      id: editTruck.id,
      data: {
        plateNumber: editTruck.plateNumber,
        trailerPlate: editTruck.trailerPlate,
        subcontractorId: editTruck.subcontractorId,
        status: editTruck.status as any,
        notes: editTruck.notes,
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    setEditTruck(null);
  };

  const handleAssignDriver = async (driverId: number) => {
    if (!showDriverDialog) return;
    await engageDriver({ truckId: showDriverDialog.truck.id, driverId });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-engagements", showDriverDialog.truck.id] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-assignments"] });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
  };

  const getCurrentDriverName = (truckId: number) => {
    const current = (allAssignments as any[]).find((a: any) => a.truckId === truckId && !a.unassignedAt);
    return current ? current.driverName : null;
  };

  // Status counts for filter badges
  const counts = (trucks as any[]).reduce((acc: any, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lastUpdated = dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : null;

  return (
    <Layout>
      <PageHeader
        title="Fleet"
        subtitle={`${(trucks as any[]).length} trucks registered`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(
              filtered.map((t: any) => ({
                Plate: t.plateNumber, Trailer: t.trailerPlate ?? "",
                Subcontractor: t.subcontractorName ?? "",
                Driver: getCurrentDriverName(t.id) ?? "",
                Status: t.status,
              })), "fleet"
            )}>
              <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export</span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Register Truck</span>
            </Button>
          </>
        }
      />
      <PageContent>
        {/* Search + filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search plate, sub, trailer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {STATUS_FILTERS.map((s) => {
              const count = s === "all" ? (trucks as any[]).length : (counts[s] ?? 0);
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/60 text-muted-foreground border-transparent hover:border-border"
                  )}
                >
                  {s !== "all" && <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s] ?? "bg-muted-foreground")} />}
                  {STATUS_LABEL[s]}
                  {count > 0 && (
                    <span className={cn(
                      "text-[9px] px-1 rounded-full font-bold",
                      statusFilter === s ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    )}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Real-time indicator */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filtered.length} truck{filtered.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · updated {lastUpdated ?? "now"}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-secondary/30 animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
            <Truck className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-semibold mb-1">No trucks found</p>
            {!search && !statusFilter && (
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-2" />Register Truck
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t: any) => {
              const driverName = getCurrentDriverName(t.id);
              return (
                <div
                  key={t.id}
                  className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/fleet/${t.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div className="mt-1.5 shrink-0">
                      <div className={cn("w-2 h-2 rounded-full", STATUS_DOT[t.status] ?? "bg-muted-foreground")} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-foreground font-mono">{t.plateNumber}</span>
                        {t.trailerPlate && (
                          <span className="text-xs text-muted-foreground font-mono">/ {t.trailerPlate}</span>
                        )}
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLOR[t.status] ?? "bg-muted text-muted-foreground")}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{t.subcontractorName ?? "—"}</span>
                        <span>·</span>
                        <button
                          className={cn("flex items-center gap-1 underline underline-offset-2 hover:text-primary transition-colors", !driverName && "text-amber-400")}
                          onClick={(e) => { e.stopPropagation(); setShowDriverDialog({ truck: t }); }}
                        >
                          <User className="w-3 h-3" />
                          {driverName ?? "Assign driver"}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDriverDialog({ truck: t }); }}
                        title="Driver history"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditTruck(t); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {t.status !== "retired" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(t); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                          title="Retire truck"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* Register Truck */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Register New Truck</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plate Number *</Label>
                <Input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="mt-1" placeholder="e.g. T123ABC" />
              </div>
              <div>
                <Label>Trailer Plate</Label>
                <Input value={form.trailerPlate} onChange={(e) => setForm({ ...form, trailerPlate: e.target.value })} className="mt-1" placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Subcontractor *</Label>
              <Select value={form.subcontractorId} onValueChange={(v) => setForm({ ...form, subcontractorId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
                <SelectContent>{(subs as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign Driver (optional)</Label>
              <Select value={form.driverId} onValueChange={(v) => setForm({ ...form, driverId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select driver (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No driver yet</SelectItem>
                  {(drivers as any[]).map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Initial Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.plateNumber || !form.subcontractorId}>
              {creating ? "Saving..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Truck */}
      <Dialog open={!!editTruck} onOpenChange={() => setEditTruck(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Update Truck — {editTruck?.plateNumber}</DialogTitle></DialogHeader>
          {editTruck && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plate Number</Label>
                  <Input value={editTruck.plateNumber ?? ""} onChange={(e) => setEditTruck({ ...editTruck, plateNumber: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Trailer Plate</Label>
                  <Input value={editTruck.trailerPlate ?? ""} onChange={(e) => setEditTruck({ ...editTruck, trailerPlate: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editTruck.status} onValueChange={(v) => setEditTruck({ ...editTruck, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="on_trip">On Trip</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editTruck.notes ?? ""} onChange={(e) => setEditTruck({ ...editTruck, notes: e.target.value })} className="mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTruck(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updating}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Retire Truck</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will mark <strong>{confirmDelete?.plateNumber}</strong> as retired. It will be hidden from active operations but all its trip history and financial records will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Keep Active</Button>
            <Button variant="destructive" onClick={handleRetire} disabled={updating}>
              {updating ? "Retiring..." : "Retire Truck"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Driver history + assign */}
      <Dialog open={!!showDriverDialog} onOpenChange={() => setShowDriverDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Driver — {showDriverDialog?.truck?.plateNumber}</DialogTitle>
          </DialogHeader>

          {/* Current driver */}
          {(() => {
            const current = (driverHistory as any[]).find((e: any) => !e.unassignedAt);
            return (
              <div className={cn(
                "flex items-center gap-3 p-3.5 rounded-xl border mb-4",
                current
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/5 border-amber-500/20 text-amber-400"
              )}>
                <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {current ? current.driverName : "No driver assigned"}
                  </p>
                  {current && (
                    <p className="text-[10px] text-muted-foreground">
                      Since {format(new Date(current.assignedAt), "d MMM yyyy")}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Assignment history timeline */}
          {(driverHistory as any[]).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Driver History</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(driverHistory as any[]).map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      e.unassignedAt ? "bg-muted-foreground" : "bg-emerald-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{e.driverName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(e.assignedAt), "d MMM yyyy")}
                        {e.unassignedAt && ` → ${format(new Date(e.unassignedAt), "d MMM yyyy")}`}
                        {!e.unassignedAt && " → Current"}
                      </p>
                    </div>
                    {!e.unassignedAt && (
                      <span className="text-[10px] text-emerald-400 font-bold">Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign new driver */}
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Assign / Change Driver</Label>
            <Select onValueChange={(v) => v && handleAssignDriver(Number(v))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select driver to assign..." />
              </SelectTrigger>
              <SelectContent>
                {(drivers as any[]).map((d: any) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assigning && <p className="text-xs text-muted-foreground mt-1.5">Assigning...</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDriverDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
