import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetTrucks, useCreateTruck, useUpdateTruck, useDeleteTruck,
  useGetSubcontractors, useGetTruckDriverEngagements, useEngageDriverToTruck,
  useGetDrivers, useGetTruckDriverAssignments,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import {
  Plus, Download, Search, Truck, Pencil, Trash2, User,
  Clock, X, History, Building2, MapPin, ArrowRight,
  CheckCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFleetMode } from "@/lib/useFleetMode";
import { getRouteShort } from "@/lib/routes";

const STATUS_FILTERS = ["all", "available", "idle", "on_trip", "maintenance", "retired"];
const STATUS_LABEL: Record<string, string> = {
  all: "All", available: "Available", idle: "Idle",
  on_trip: "On Trip", maintenance: "Maintenance", retired: "Retired",
};
const STATUS_COLOR: Record<string, string> = {
  available: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  idle: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  on_trip: "text-primary bg-primary/10 border-primary/20",
  maintenance: "text-red-400 bg-red-500/10 border-red-500/20",
  retired: "text-muted-foreground bg-muted/40 border-border",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-400",
  idle: "bg-yellow-400",
  on_trip: "bg-primary animate-pulse",
  maintenance: "bg-red-400",
  retired: "bg-muted-foreground",
};

const TRIP_STATUS_LABEL: Record<string, string> = {
  nominated: "Nominated",
  loading: "Loading",
  loaded: "Loaded",
  in_transit: "In Transit",
  at_zambia_entry: "At Zambia",
  at_drc_entry: "At DRC",
};
const TRIP_STATUS_COLOR: Record<string, string> = {
  nominated: "bg-slate-500/15 text-slate-300",
  loading: "bg-yellow-500/15 text-yellow-400",
  loaded: "bg-blue-500/15 text-blue-400",
  in_transit: "bg-primary/15 text-primary",
  at_zambia_entry: "bg-orange-500/15 text-orange-400",
  at_drc_entry: "bg-purple-500/15 text-purple-400",
};

function derivedLocation(tripStatus: string, route: string | null): string {
  switch (tripStatus) {
    case "nominated": return "At Depot — Awaiting Loading";
    case "loading": return "Loading";
    case "loaded": return "Loaded — Awaiting Dispatch";
    case "in_transit": return route ? `In Transit: ${getRouteShort(route)}` : "In Transit";
    case "at_zambia_entry": return "At Zambia Border";
    case "at_drc_entry": return "At DRC Entry";
    default: return "On Trip";
  }
}

function daysSinceDelivery(lastDeliveredAt: string | null): string {
  if (!lastDeliveredAt) return "No deliveries yet";
  const d = differenceInDays(new Date(), new Date(lastDeliveredAt));
  if (d === 0) return "Delivered today";
  if (d === 1) return "Last delivery yesterday";
  return `Last delivery ${d} days ago`;
}

function UtilizationBar({ trucks }: { trucks: any[] }) {
  const active = trucks.filter((t) => t.status !== "retired");
  const counts = {
    on_trip: active.filter((t) => t.status === "on_trip").length,
    available: active.filter((t) => t.status === "available").length,
    idle: active.filter((t) => t.status === "idle").length,
    maintenance: active.filter((t) => t.status === "maintenance").length,
  };
  const total = active.length;
  if (total === 0) return null;

  const segments = [
    { key: "on_trip", color: "bg-primary", label: "On Trip" },
    { key: "available", color: "bg-emerald-400", label: "Available" },
    { key: "idle", color: "bg-yellow-400", label: "Idle" },
    { key: "maintenance", color: "bg-red-400", label: "Maintenance" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fleet Utilization</span>
        <span className="text-xs text-muted-foreground">{counts.on_trip} of {total} trucks active</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.map(({ key, color }) => {
          const count = counts[key as keyof typeof counts];
          if (count === 0) return null;
          return (
            <div
              key={key}
              className={cn("h-full rounded-full transition-all", color)}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${STATUS_LABEL[key]}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(({ key, color, label }) => {
          const count = counts[key as keyof typeof counts];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{count}</span> {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TruckCard({
  truck,
  driverName,
  onEdit,
  onRetire,
  onDriverHistory,
  onLocationSave,
  savingLocationId,
}: {
  truck: any;
  driverName: string | null;
  onEdit: () => void;
  onRetire: () => void;
  onDriverHistory: () => void;
  onLocationSave: (id: number, value: string) => void;
  savingLocationId: number | null;
}) {
  const [, navigate] = useLocation();
  const [editingLoc, setEditingLoc] = useState(false);
  const [locValue, setLocValue] = useState(truck.currentLocation ?? "");
  const locInputRef = useRef<HTMLInputElement>(null);

  const isOnTrip = truck.status === "on_trip";
  const location = isOnTrip && truck.activeTrip
    ? derivedLocation(truck.activeTrip.tripStatus, truck.activeTrip.route)
    : truck.currentLocation || null;

  const handleLocClick = () => {
    if (isOnTrip) return;
    setLocValue(truck.currentLocation ?? "");
    setEditingLoc(true);
    setTimeout(() => locInputRef.current?.focus(), 50);
  };

  const handleLocSave = () => {
    setEditingLoc(false);
    if (locValue !== (truck.currentLocation ?? "")) {
      onLocationSave(truck.id, locValue);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
      <div
        className="p-4 cursor-pointer"
        onClick={() => navigate(`/fleet/${truck.id}`)}
      >
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div className="mt-1.5 shrink-0">
            <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_DOT[truck.status] ?? "bg-muted-foreground")} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Row 1: plate + status + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground font-mono text-sm tracking-wide">{truck.plateNumber}</span>
              {truck.trailerPlate && (
                <span className="text-xs text-muted-foreground font-mono">/ {truck.trailerPlate}</span>
              )}
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                STATUS_COLOR[truck.status] ?? "bg-muted text-muted-foreground border-border"
              )}>
                {STATUS_LABEL[truck.status] ?? truck.status}
              </span>
              <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={onDriverHistory}
                  title="Driver history"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {truck.status !== "retired" && (
                  <button
                    onClick={onRetire}
                    title="Retire truck"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: location */}
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <MapPin className={cn("w-3 h-3 shrink-0", isOnTrip ? "text-primary" : "text-muted-foreground")} />
              {isOnTrip ? (
                <span className="text-xs text-primary font-medium">{location}</span>
              ) : editingLoc ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    ref={locInputRef}
                    value={locValue}
                    onChange={(e) => setLocValue(e.target.value)}
                    onBlur={handleLocSave}
                    onKeyDown={(e) => { if (e.key === "Enter") handleLocSave(); if (e.key === "Escape") { setEditingLoc(false); } }}
                    className="text-xs bg-secondary/60 border border-primary/40 rounded px-2 py-0.5 outline-none text-foreground flex-1 min-w-0 max-w-48"
                    placeholder="e.g. Ndola Depot, Lusaka Yard..."
                  />
                  {savingLocationId === truck.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
                </div>
              ) : location ? (
                <button
                  onClick={handleLocClick}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                  title="Click to update location"
                >
                  {location}
                </button>
              ) : (
                <button
                  onClick={handleLocClick}
                  className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors italic"
                >
                  Set current location…
                </button>
              )}
            </div>

            {/* Row 3: active trip info (only when on_trip) */}
            {isOnTrip && truck.activeTrip && (
              <div
                className="flex items-center gap-2 flex-wrap"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">{truck.activeTrip.batchName}</span>
                {truck.activeTrip.route && (
                  <>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className="text-xs text-muted-foreground">{getRouteShort(truck.activeTrip.route)}</span>
                  </>
                )}
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  TRIP_STATUS_COLOR[truck.activeTrip.tripStatus] ?? "bg-muted text-muted-foreground"
                )}>
                  {TRIP_STATUS_LABEL[truck.activeTrip.tripStatus] ?? truck.activeTrip.tripStatus}
                </span>
                <button
                  onClick={() => navigate(`/batches/${truck.activeTrip.batchId}`)}
                  className="flex items-center gap-0.5 text-[10px] text-primary hover:underline shrink-0"
                >
                  View Batch <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Row 4: driver + last delivery */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap" onClick={(e) => e.stopPropagation()}>
              {truck.companyOwned ? (
                <span className="flex items-center gap-1 text-primary/60">
                  <Building2 className="w-3 h-3" />Company Fleet
                </span>
              ) : (
                <span className="truncate max-w-[120px]">{truck.subcontractorName ?? "No subcontractor"}</span>
              )}
              <span className="text-muted-foreground/30">·</span>
              <button
                className={cn(
                  "flex items-center gap-1 hover:text-primary transition-colors",
                  !driverName && "text-amber-400 hover:text-amber-300"
                )}
                onClick={(e) => { e.stopPropagation(); onDriverHistory(); }}
              >
                <User className="w-3 h-3" />
                {driverName ?? "Assign driver"}
              </button>
              {truck.status !== "retired" && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {daysSinceDelivery(truck.lastDeliveredAt)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Fleet() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTruck, setEditTruck] = useState<any | null>(null);
  const [originalSubId, setOriginalSubId] = useState<number | null>(null);
  const [confirmSubSwap, setConfirmSubSwap] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [showDriverDialog, setShowDriverDialog] = useState<{ truck: any } | null>(null);
  const [savingLocationId, setSavingLocationId] = useState<number | null>(null);

  const fleetMode = useFleetMode();
  const defaultCompanyOwned = fleetMode === "company";
  const emptyForm = {
    plateNumber: "", trailerPlate: "", subcontractorId: "", status: "available",
    driverId: "__none__", notes: "", companyOwned: defaultCompanyOwned, currentLocation: "",
  };
  const [form, setForm] = useState(emptyForm);

  const { data: trucks = [], isLoading, dataUpdatedAt } = useGetTrucks({ query: { refetchInterval: 30_000 } });
  const { data: subs = [] } = useGetSubcontractors();
  const { data: driverHistory = [] } = useGetTruckDriverEngagements(showDriverDialog?.truck?.id ?? null);
  const { data: drivers = [] } = useGetDrivers();
  const { mutateAsync: createTruck, isPending: creating } = useCreateTruck();
  const { mutateAsync: updateTruck, isPending: updating } = useUpdateTruck();
  const { mutateAsync: deleteTruck } = useDeleteTruck();
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
      t.trailerPlate?.toLowerCase().includes(search.toLowerCase()) ||
      t.currentLocation?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    if (!form.plateNumber) return;
    const isCompanyTruck = fleetMode === "company" || (fleetMode === "mixed" && form.companyOwned);
    if (!isCompanyTruck && !form.subcontractorId) return;
    const truck = await createTruck({
      data: {
        plateNumber: form.plateNumber,
        trailerPlate: form.trailerPlate || undefined,
        subcontractorId: isCompanyTruck ? null : parseInt(form.subcontractorId),
        companyOwned: isCompanyTruck,
        status: form.status as any,
        notes: form.notes || undefined,
        currentLocation: form.currentLocation || undefined,
      } as any
    });
    if (form.driverId && form.driverId !== "__none__" && truck?.id) {
      try { await engageDriver({ truckId: truck.id, driverId: parseInt(form.driverId) }); } catch {}
    }
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-assignments"] });
    setShowCreate(false);
    setForm(emptyForm);
  };

  const doUpdate = async () => {
    if (!editTruck) return;
    await updateTruck({
      id: editTruck.id,
      data: {
        plateNumber: editTruck.plateNumber,
        trailerPlate: editTruck.trailerPlate,
        subcontractorId: editTruck.subcontractorId,
        status: editTruck.status as any,
        notes: editTruck.notes,
        currentLocation: editTruck.currentLocation ?? null,
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    setConfirmSubSwap(false);
    setEditTruck(null);
  };

  const handleUpdate = () => {
    if (!editTruck) return;
    if (editTruck.subcontractorId !== originalSubId) setConfirmSubSwap(true);
    else doUpdate();
  };

  const handleAssignDriver = async (driverId: number) => {
    if (!showDriverDialog) return;
    await engageDriver({ truckId: showDriverDialog.truck.id, driverId });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-engagements", showDriverDialog.truck.id] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-assignments"] });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
  };

  const handleLocationSave = async (id: number, value: string) => {
    setSavingLocationId(id);
    try {
      await fetch(`/api/trucks/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentLocation: value || null }),
      });
      qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    } finally {
      setSavingLocationId(null);
    }
  };

  const getCurrentDriverName = (truckId: number) => {
    const current = (allAssignments as any[]).find((a: any) => a.truckId === truckId && !a.unassignedAt);
    return current ? current.driverName : null;
  };

  const counts = (trucks as any[]).reduce((acc: any, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lastUpdated = dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : null;
  const nonRetired = (trucks as any[]).filter((t) => t.status !== "retired");

  return (
    <Layout>
      <PageHeader
        title="Fleet"
        subtitle={`${(trucks as any[]).length} trucks registered · ${nonRetired.filter((t) => t.status === "on_trip").length} active now`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(
              filtered.map((t: any) => ({
                Plate: t.plateNumber, Trailer: t.trailerPlate ?? "",
                Subcontractor: t.subcontractorName ?? (t.companyOwned ? "Company Fleet" : ""),
                Driver: getCurrentDriverName(t.id) ?? "",
                Status: t.status,
                Location: t.status === "on_trip" && t.activeTrip
                  ? derivedLocation(t.activeTrip.tripStatus, t.activeTrip.route)
                  : (t.currentLocation ?? ""),
                "Last Delivery": t.lastDeliveredAt ?? "",
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
        {/* Utilization bar */}
        {!isLoading && (trucks as any[]).length > 0 && (
          <UtilizationBar trucks={trucks as any[]} />
        )}

        {/* Search + filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search plate, trailer, subcontractor, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filtered.length} truck{filtered.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · updated {lastUpdated ?? "now"}
            </div>
          </div>
        </div>

        {/* Truck list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-secondary/30 animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
            <Truck className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-semibold mb-1">No trucks found</p>
            {!search && statusFilter === "all" && (
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-2" />Register Truck
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t: any) => (
              <TruckCard
                key={t.id}
                truck={t}
                driverName={getCurrentDriverName(t.id)}
                onEdit={() => { setEditTruck(t); setOriginalSubId(t.subcontractorId); }}
                onRetire={() => setConfirmDelete(t)}
                onDriverHistory={() => setShowDriverDialog({ truck: t })}
                onLocationSave={handleLocationSave}
                savingLocationId={savingLocationId}
              />
            ))}
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
            {fleetMode === "company" && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm">
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">Company Fleet truck — no commission will be applied</span>
              </div>
            )}
            {fleetMode === "mixed" && (
              <div>
                <Label>Truck Ownership</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button type="button" onClick={() => setForm({ ...form, companyOwned: false, subcontractorId: "" })}
                    className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", !form.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                    <User className="w-4 h-4" />Subcontractor
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, companyOwned: true, subcontractorId: "" })}
                    className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", form.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                    <Building2 className="w-4 h-4" />Company
                  </button>
                </div>
              </div>
            )}
            {(fleetMode === "subcontractor" || (fleetMode === "mixed" && !form.companyOwned)) && (
              <div>
                <Label>Subcontractor *</Label>
                <Select value={form.subcontractorId} onValueChange={(v) => setForm({ ...form, subcontractorId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
                  <SelectContent>{(subs as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
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
              <Label>Current Location</Label>
              <Input value={form.currentLocation} onChange={(e) => setForm({ ...form, currentLocation: e.target.value })} className="mt-1" placeholder="e.g. Ndola Depot, Lusaka Yard" />
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
            <Button onClick={handleCreate} disabled={creating || !form.plateNumber || (!form.companyOwned && !form.subcontractorId && fleetMode !== "company")}>
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
              {editTruck.companyOwned ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Company Fleet truck — no commission applied</span>
                </div>
              ) : (
                <div>
                  <Label>Subcontractor</Label>
                  <Select value={String(editTruck.subcontractorId ?? "")} onValueChange={(v) => setEditTruck({ ...editTruck, subcontractorId: parseInt(v) })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
                    <SelectContent>
                      {(subs as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editTruck.status === "on_trip" && (
                    <p className="text-xs text-amber-500 mt-1">This truck is on a trip. Reassignment takes effect from the next nomination.</p>
                  )}
                </div>
              )}
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
              {editTruck.status !== "on_trip" && (
                <div>
                  <Label>Current Location</Label>
                  <Input
                    value={editTruck.currentLocation ?? ""}
                    onChange={(e) => setEditTruck({ ...editTruck, currentLocation: e.target.value })}
                    className="mt-1"
                    placeholder="e.g. Ndola Depot, Lusaka Yard"
                  />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Input value={editTruck.notes ?? ""} onChange={(e) => setEditTruck({ ...editTruck, notes: e.target.value })} className="mt-1" />
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Insurance</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Insurer</Label>
                    <Input value={editTruck.insurerName ?? ""} onChange={(e) => setEditTruck({ ...editTruck, insurerName: e.target.value })} className="mt-1" placeholder="e.g. Hollard" />
                  </div>
                  <div>
                    <Label>Policy Number</Label>
                    <Input value={editTruck.policyNumber ?? ""} onChange={(e) => setEditTruck({ ...editTruck, policyNumber: e.target.value })} className="mt-1" placeholder="e.g. HI-2024-001" />
                  </div>
                  <div>
                    <Label>Coverage (USD)</Label>
                    <Input type="number" value={editTruck.coverageAmount ?? ""} onChange={(e) => setEditTruck({ ...editTruck, coverageAmount: e.target.value })} className="mt-1" placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Expiry Date</Label>
                    <Input type="date" value={editTruck.insuranceExpiry ?? ""} onChange={(e) => setEditTruck({ ...editTruck, insuranceExpiry: e.target.value })} className="mt-1" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTruck(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updating}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcontractor swap confirmation */}
      <AlertDialog open={confirmSubSwap} onOpenChange={setConfirmSubSwap}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Subcontractor?</AlertDialogTitle>
            <AlertDialogDescription>
              Reassigning this truck to a different subcontractor will affect future trips only. Existing trip records keep the original subcontractor for accurate financials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmSubSwap(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doUpdate}>Confirm Reassignment</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retire confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire {confirmDelete?.plateNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This truck will be marked as retired and removed from active operations. All historical trip records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetire} className="bg-amber-500 hover:bg-amber-600">Retire Truck</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Driver assignment dialog */}
      <Dialog open={!!showDriverDialog} onOpenChange={() => setShowDriverDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Driver — {showDriverDialog?.truck?.plateNumber}</DialogTitle>
          </DialogHeader>
          {showDriverDialog && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assign Driver</Label>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {(drivers as any[]).map((d: any) => {
                    const isCurrentDriver = (driverHistory as any[]).some((h: any) => h.driverId === d.id && !h.unassignedAt);
                    return (
                      <button
                        key={d.id}
                        onClick={() => handleAssignDriver(d.id)}
                        disabled={assigning || isCurrentDriver}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                          isCurrentDriver
                            ? "bg-primary/10 text-primary cursor-default"
                            : "hover:bg-secondary text-foreground"
                        )}
                      >
                        <User className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{d.name}</span>
                        {isCurrentDriver && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(driverHistory as any[]).length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assignment History</Label>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {(driverHistory as any[]).map((h: any) => (
                      <div key={h.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="flex-1">{h.driverName}</span>
                        <span>{h.assignedAt ? new Date(h.assignedAt).toLocaleDateString() : "—"}</span>
                        {h.unassignedAt
                          ? <span className="text-muted-foreground/50">→ {new Date(h.unassignedAt).toLocaleDateString()}</span>
                          : <span className="text-emerald-400 font-medium">Current</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDriverDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
