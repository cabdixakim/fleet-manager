import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetTrucks, useCreateTruck, useUpdateTruck, useDeleteTruck,
  useGetSubcontractors, useGetTruckDriverEngagements, useEngageDriverToTruck,
  useGetDrivers, useGetAllCurrentTruckDriverAssignments,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { exportToExcel } from "@/lib/export";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import {
  Plus, Download, Search, Truck, Pencil, Trash2, User,
  Clock, X, History, Building2, MapPin, ArrowRight,
  CheckCircle, Loader2, Users, FileText, Link2, Unlink,
  Container,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFleetMode } from "@/lib/useFleetMode";
import { getRouteShort } from "@/lib/routes";
import { useToast } from "@/hooks/use-toast";

const STATUS_FILTERS = ["all", "available", "idle", "on_trip", "maintenance", "retired"];
const STATUS_LABEL: Record<string, string> = { all: "All", available: "Available", idle: "Idle", on_trip: "On Trip", maintenance: "Maintenance", retired: "Retired" };
const STATUS_COLOR: Record<string, string> = {
  available: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  idle: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  on_trip: "text-primary bg-primary/10 border-primary/20",
  maintenance: "text-red-400 bg-red-500/10 border-red-500/20",
  retired: "text-muted-foreground bg-muted/40 border-border",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-400", idle: "bg-yellow-400", on_trip: "bg-primary animate-pulse",
  maintenance: "bg-red-400", retired: "bg-muted-foreground",
};
const TRIP_STATUS_LABEL: Record<string, string> = { nominated: "Nominated", loading: "Loading", loaded: "Loaded", in_transit: "In Transit", at_zambia_entry: "At Zambia", at_drc_entry: "At DRC" };
const TRIP_STATUS_COLOR: Record<string, string> = { nominated: "bg-slate-500/15 text-slate-300", loading: "bg-yellow-500/15 text-yellow-400", loaded: "bg-blue-500/15 text-blue-400", in_transit: "bg-primary/15 text-primary", at_zambia_entry: "bg-orange-500/15 text-orange-400", at_drc_entry: "bg-purple-500/15 text-purple-400" };

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
  const counts = { on_trip: active.filter((t) => t.status === "on_trip").length, available: active.filter((t) => t.status === "available").length, idle: active.filter((t) => t.status === "idle").length, maintenance: active.filter((t) => t.status === "maintenance").length };
  const total = active.length;
  if (total === 0) return null;
  const segments = [{ key: "on_trip", color: "bg-primary", label: "On Trip" }, { key: "available", color: "bg-emerald-400", label: "Available" }, { key: "idle", color: "bg-yellow-400", label: "Idle" }, { key: "maintenance", color: "bg-red-400", label: "Maintenance" }];
  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fleet Utilization</span>
        <span className="text-xs text-muted-foreground">{counts.on_trip} of {total} horses active</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.map(({ key, color }) => { const count = counts[key as keyof typeof counts]; if (count === 0) return null; return <div key={key} className={cn("h-full rounded-full transition-all", color)} style={{ width: `${(count / total) * 100}%` }} title={`${STATUS_LABEL[key]}: ${count}`} />; })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(({ key, color, label }) => { const count = counts[key as keyof typeof counts]; return <div key={key} className="flex items-center gap-1.5"><span className={cn("w-2 h-2 rounded-full shrink-0", color)} /><span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{count}</span> {label}</span></div>; })}
      </div>
    </div>
  );
}

function TruckRow({ truck, driverName, onEdit, onRetire, onDriverHistory, onLocationSave, savingLocationId }: { truck: any; driverName: string | null; onEdit: () => void; onRetire: () => void; onDriverHistory: () => void; onLocationSave: (id: number, value: string) => void; savingLocationId: number | null }) {
  const [, navigate] = useLocation();
  const [editingLoc, setEditingLoc] = useState(false);
  const [locValue, setLocValue] = useState(truck.currentLocation ?? "");
  const locInputRef = useRef<HTMLInputElement>(null);
  const isOnTrip = truck.status === "on_trip";
  const location = isOnTrip && truck.activeTrip ? derivedLocation(truck.activeTrip.tripStatus, truck.activeTrip.route) : truck.currentLocation || null;
  const trailerPlate = truck.linkedTrailer?.plateNumber ?? truck.trailerPlate ?? null;

  const handleLocClick = (e: React.MouseEvent) => { e.stopPropagation(); if (isOnTrip) return; setLocValue(truck.currentLocation ?? ""); setEditingLoc(true); setTimeout(() => locInputRef.current?.focus(), 50); };
  const handleLocSave = () => { setEditingLoc(false); if (locValue !== (truck.currentLocation ?? "")) onLocationSave(truck.id, locValue); };

  return (
    <tr className="border-b border-border hover:bg-secondary/40 cursor-pointer transition-colors group" onClick={() => navigate(`/fleet/${truck.id}`)}>
      <td className="pl-4 pr-2 py-3 w-6"><div className={cn("w-2 h-2 rounded-full", STATUS_DOT[truck.status] ?? "bg-muted-foreground")} /></td>
      <td className="px-2 py-3 min-w-[120px]">
        <span className="font-mono font-semibold text-sm text-foreground">{truck.plateNumber}</span>
        {trailerPlate && <span className="block text-[11px] text-muted-foreground font-mono">{trailerPlate}</span>}
      </td>
      <td className="px-2 py-3 w-28">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS_COLOR[truck.status] ?? "bg-muted text-muted-foreground border-border")}>{STATUS_LABEL[truck.status] ?? truck.status}</span>
        {isOnTrip && truck.activeTrip && <span className={cn("block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded w-fit", TRIP_STATUS_COLOR[truck.activeTrip.tripStatus] ?? "bg-muted text-muted-foreground")}>{TRIP_STATUS_LABEL[truck.activeTrip.tripStatus] ?? truck.activeTrip.tripStatus}</span>}
      </td>
      <td className="hidden sm:table-cell px-2 py-3 text-xs text-muted-foreground max-w-[120px]">{truck.companyOwned ? <span className="flex items-center gap-1 text-primary/70"><Building2 className="w-3 h-3 shrink-0" />Company</span> : <span className="truncate block">{truck.subcontractorName ?? "—"}</span>}</td>
      <td className="hidden sm:table-cell px-2 py-3 w-36" onClick={(e) => e.stopPropagation()}>
        <button className={cn("flex items-center gap-1 text-xs hover:text-primary transition-colors", !driverName && "text-amber-400 hover:text-amber-300")} onClick={(e) => { e.stopPropagation(); onDriverHistory(); }}>
          <User className="w-3 h-3 shrink-0" /><span className="truncate">{driverName ?? "Assign driver"}</span>
        </button>
      </td>
      <td className="hidden md:table-cell px-2 py-3 text-xs text-muted-foreground max-w-[160px]" onClick={(e) => e.stopPropagation()}>
        {isOnTrip ? <span className="text-primary font-medium flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{location}</span>
          : editingLoc ? <div className="flex items-center gap-1"><input ref={locInputRef} value={locValue} onChange={(e) => setLocValue(e.target.value)} onBlur={handleLocSave} onKeyDown={(e) => { if (e.key === "Enter") handleLocSave(); if (e.key === "Escape") setEditingLoc(false); }} className="text-xs bg-secondary/60 border border-primary/40 rounded px-2 py-0.5 outline-none text-foreground w-full max-w-36" placeholder="Location…" />{savingLocationId === truck.id && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}</div>
          : <button onClick={handleLocClick} className="flex items-center gap-1 hover:text-foreground transition-colors text-left w-full"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{location ?? <span className="italic text-muted-foreground/40">—</span>}</span></button>}
      </td>
      <td className="hidden lg:table-cell px-2 py-3 text-xs text-muted-foreground w-28 whitespace-nowrap">{truck.status !== "retired" && <span className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{daysSinceDelivery(truck.lastDeliveredAt)}</span>}</td>
      <td className="px-2 py-3 text-xs w-24" onClick={(e) => e.stopPropagation()}>{isOnTrip && truck.activeTrip && <button onClick={(e) => { e.stopPropagation(); navigate(`/batches/${truck.activeTrip.batchId}`); }} className="flex items-center gap-0.5 text-[11px] text-primary hover:underline whitespace-nowrap">{truck.activeTrip.batchName || getRouteShort(truck.activeTrip.route)} <ArrowRight className="w-3 h-3" /></button>}</td>
      <td className="px-2 pr-3 py-3 w-16" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); navigate(`/fleet/${truck.id}?tab=documents`); }} title="Documents" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><FileText className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDriverHistory(); }} title="Assign driver" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><History className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          {truck.status !== "retired" && <button onClick={(e) => { e.stopPropagation(); onRetire(); }} title="Retire" className="p-1.5 rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </td>
    </tr>
  );
}

function TrailerRow({ trailer, horses, onReassign, onEditStatus, onRetire }: { trailer: any; horses: any[]; onReassign: (trailer: any) => void; onEditStatus: (trailer: any) => void; onRetire: (trailer: any) => void }) {
  return (
    <tr className="border-b border-border hover:bg-secondary/40 transition-colors group">
      <td className="pl-4 pr-2 py-3 w-6"><div className={cn("w-2 h-2 rounded-full", STATUS_DOT[trailer.status] ?? "bg-muted-foreground")} /></td>
      <td className="px-2 py-3">
        <span className="font-mono font-semibold text-sm text-foreground flex items-center gap-1.5"><Container className="w-3.5 h-3.5 text-muted-foreground" />{trailer.plateNumber}</span>
      </td>
      <td className="px-2 py-3 w-32">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS_COLOR[trailer.status] ?? "bg-muted text-muted-foreground border-border")}>{STATUS_LABEL[trailer.status] ?? trailer.status}</span>
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground">
        {trailer.horsePlate
          ? <span className="flex items-center gap-1.5 text-foreground"><Truck className="w-3.5 h-3.5 text-muted-foreground" />{trailer.horsePlate}</span>
          : <span className="flex items-center gap-1.5 text-amber-400"><Unlink className="w-3.5 h-3.5" />Unassigned</span>}
      </td>
      <td className="px-2 pr-3 py-3 w-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onReassign(trailer)} title="Reassign to horse" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Link2 className="w-3.5 h-3.5" /></button>
          <button onClick={() => onEditStatus(trailer)} title="Edit status" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          {trailer.status !== "retired" && <button onClick={() => onRetire(trailer)} title="Retire" className="p-1.5 rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </td>
    </tr>
  );
}

export default function Fleet() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [fleetTab, setFleetTab] = useState<"horses" | "trailers">("horses");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTruck, setEditTruck] = useState<any | null>(null);
  const [originalSubId, setOriginalSubId] = useState<number | null>(null);
  const [originalCompanyOwned, setOriginalCompanyOwned] = useState(false);
  const [confirmSubSwap, setConfirmSubSwap] = useState(false);
  const [confirmOwnershipTransfer, setConfirmOwnershipTransfer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [showDriverDialog, setShowDriverDialog] = useState<{ truck: any } | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("__none__");
  const [savingLocationId, setSavingLocationId] = useState<number | null>(null);

  // Trailer-specific state
  const [editLinkedTrailerId, setEditLinkedTrailerId] = useState<string>("__none__");
  const [reassignTrailer, setReassignTrailer] = useState<any | null>(null);
  const [reassignHorseId, setReassignHorseId] = useState<string>("");
  const [editTrailerStatus, setEditTrailerStatus] = useState<any | null>(null);
  const [editTrailerStatusValue, setEditTrailerStatusValue] = useState<string>("available");
  const [retireTrailer, setRetireTrailer] = useState<any | null>(null);

  const fleetMode = useFleetMode();

  const emptyForm = { registering: "unit" as "unit" | "horse" | "trailer", plateNumber: "", trailerPlate: "", subcontractorId: "", status: "available", driverId: "__none__", notes: "", companyOwned: true, currentLocation: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: trucks = [], isLoading, dataUpdatedAt } = useGetTrucks({ query: { refetchInterval: 30_000 } });
  const { data: subs = [] } = useGetSubcontractors();
  const { data: driverHistory = [] } = useGetTruckDriverEngagements(showDriverDialog?.truck?.id ?? null);
  const { data: drivers = [] } = useGetDrivers();
  const { mutateAsync: createTruck, isPending: creating } = useCreateTruck();
  const { mutateAsync: updateTruck, isPending: updating } = useUpdateTruck();
  const { mutateAsync: deleteTruck } = useDeleteTruck();
  const { mutateAsync: engageDriver, isPending: assigning } = useEngageDriverToTruck();
  const { data: allAssignments = [] } = useGetAllCurrentTruckDriverAssignments();

  // Trailers query
  const { data: trailers = [], isLoading: trailersLoading } = useQuery<any[]>({
    queryKey: ["/api/trucks", "trailers"],
    queryFn: () => fetch("/api/trucks?unitType=trailer", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const createTrailerMutation = useMutation({
    mutationFn: async (body: { trailerPlate: string; status: string; notes: string }) => {
      const res = await fetch("/api/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ registering: "trailer", trailerPlate: body.trailerPlate, status: body.status, notes: body.notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trucks"] });
      toast({ title: "Trailer registered" });
      setShowCreate(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Failed to register trailer", description: e.message }),
  });

  const assignHorseMutation = useMutation({
    mutationFn: async ({ trailerId, horseId }: { trailerId: number; horseId: number | null }) => {
      const res = await fetch(`/api/trucks/${trailerId}/assign-horse`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ horseId }) });
      if (!res.ok) throw new Error("Failed to reassign trailer");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trucks"] });
      toast({ title: "Trailer reassigned" });
      setReassignTrailer(null);
      setReassignHorseId("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateTrailerStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/trucks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trucks"] });
      toast({ title: "Trailer status updated" });
      setEditTrailerStatus(null);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const handleRetire = async () => {
    if (!confirmDelete) return;
    await updateTruck({ id: confirmDelete.id, data: { status: "retired" } as any });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    setConfirmDelete(null);
  };

  const horsesArr = trucks as any[];
  const filtered = horsesArr.filter((t) => {
    const trailerPlate = t.linkedTrailer?.plateNumber ?? t.trailerPlate ?? "";
    const matchSearch = !search || t.plateNumber?.toLowerCase().includes(search.toLowerCase()) || t.subcontractorName?.toLowerCase().includes(search.toLowerCase()) || trailerPlate.toLowerCase().includes(search.toLowerCase()) || t.currentLocation?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredTrailers = (trailers as any[]).filter((t) => {
    const matchSearch = !search || t.plateNumber?.toLowerCase().includes(search.toLowerCase()) || t.horsePlate?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    const { registering, plateNumber, trailerPlate, companyOwned, subcontractorId, status, driverId, notes, currentLocation } = form;
    const isCompanyTruck = fleetMode === "company" || (fleetMode === "mixed" && companyOwned);

    if (registering === "trailer") {
      if (!trailerPlate) return;
      createTrailerMutation.mutate({ trailerPlate, status, notes });
      return;
    }

    if (!plateNumber) return;
    if (registering !== "trailer" && !isCompanyTruck && !subcontractorId) return;

    const truck = await createTruck({
      data: {
        registering,
        plateNumber,
        trailerPlate: trailerPlate || undefined,
        subcontractorId: isCompanyTruck ? null : parseInt(subcontractorId),
        companyOwned: isCompanyTruck,
        status: status as any,
        notes: notes || undefined,
        currentLocation: currentLocation || undefined,
      } as any,
    });

    if (driverId && driverId !== "__none__" && truck?.id) {
      try { await engageDriver({ truckId: truck.id, driverId: parseInt(driverId) }); } catch {}
    }
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-assignments"] });
    setShowCreate(false);
    setForm(emptyForm);
  };

  const doUpdate = async () => {
    if (!editTruck) return;
    const isCompanyNow = !!editTruck.companyOwned;
    await updateTruck({ id: editTruck.id, data: { plateNumber: editTruck.plateNumber, companyOwned: isCompanyNow, subcontractorId: isCompanyNow ? null : (editTruck.subcontractorId ?? null), status: editTruck.status as any, notes: editTruck.notes, currentLocation: editTruck.currentLocation ?? null } });

    // Handle trailer link change via entity system
    const originalTrailerId = editTruck.linkedTrailer?.id ?? null;
    const newTrailerId = editLinkedTrailerId === "__none__" ? null : parseInt(editLinkedTrailerId);
    if (newTrailerId !== originalTrailerId) {
      if (originalTrailerId) {
        await fetch(`/api/trucks/${originalTrailerId}/assign-horse`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ horseId: null }) });
      }
      if (newTrailerId) {
        await fetch(`/api/trucks/${newTrailerId}/assign-horse`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ horseId: editTruck.id }) });
      }
    }

    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    setConfirmSubSwap(false);
    setConfirmOwnershipTransfer(false);
    setEditTruck(null);
    setEditLinkedTrailerId("__none__");
  };

  const handleUpdate = () => {
    if (!editTruck) return;
    const ownershipChanged = !!editTruck.companyOwned !== originalCompanyOwned;
    const subChanged = !editTruck.companyOwned && editTruck.subcontractorId !== originalSubId;
    if (ownershipChanged) setConfirmOwnershipTransfer(true);
    else if (subChanged) setConfirmSubSwap(true);
    else doUpdate();
  };

  const handleAssignDriver = async (driverId: number) => {
    if (!showDriverDialog) return;
    await engageDriver({ truckId: showDriverDialog.truck.id, driverId });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-engagements", showDriverDialog.truck.id] });
    qc.invalidateQueries({ queryKey: ["/api/truck-driver-engagements/all-current"] });
    qc.invalidateQueries({ queryKey: ["/api/trucks"] });
  };

  const handleLocationSave = async (id: number, value: string) => {
    setSavingLocationId(id);
    try {
      await fetch(`/api/trucks/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentLocation: value || null }) });
      qc.invalidateQueries({ queryKey: ["/api/trucks"] });
    } finally { setSavingLocationId(null); }
  };

  const getCurrentDriverName = (truckId: number) => {
    const current = (allAssignments as any[]).find((a: any) => a.truckId === truckId && !a.unassignedAt);
    return current ? current.driverName : null;
  };

  const counts = horsesArr.reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const lastUpdated = dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : null;
  const nonRetired = horsesArr.filter((t) => t.status !== "retired");

  const registeringLabel = { unit: "Full Unit", horse: "Horse Only", trailer: "Trailer Only" };

  return (
    <Layout>
      <PageHeader
        title="Fleet"
        subtitle={`${horsesArr.length} horses · ${(trailers as any[]).length} trailers · ${nonRetired.filter((t) => t.status === "on_trip").length} active now`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered.map((t: any) => ({ Plate: t.plateNumber, Trailer: t.linkedTrailer?.plateNumber ?? t.trailerPlate ?? "", Subcontractor: t.subcontractorName ?? (t.companyOwned ? "Company Fleet" : ""), Driver: getCurrentDriverName(t.id) ?? "", Status: t.status, Location: t.status === "on_trip" && t.activeTrip ? derivedLocation(t.activeTrip.tripStatus, t.activeTrip.route) : (t.currentLocation ?? ""), "Last Delivery": t.lastDeliveredAt ?? "" })), "fleet")}>
              <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export</span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Register</span>
            </Button>
          </>
        }
      />
      <PageContent>
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {(["horses", "trailers"] as const).map((tab) => (
            <button key={tab} onClick={() => setFleetTab(tab)} className={cn("px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize", fleetTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {tab === "horses" ? <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />Horses ({horsesArr.length})</span> : <span className="flex items-center gap-1.5"><Container className="w-3.5 h-3.5" />Trailers ({(trailers as any[]).length})</span>}
            </button>
          ))}
        </div>

        {fleetTab === "horses" && (
          <>
            {!isLoading && horsesArr.length > 0 && <UtilizationBar trucks={horsesArr} />}
            <div className="space-y-3 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search plate, trailer, subcontractor, location..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
                {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {STATUS_FILTERS.map((s) => { const count = s === "all" ? horsesArr.length : (counts[s] ?? 0); return <button key={s} onClick={() => setStatusFilter(s)} className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border", statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-transparent hover:border-border")}>{s !== "all" && <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s] ?? "bg-muted-foreground")} />}{STATUS_LABEL[s]}{count > 0 && <span className={cn("text-[9px] px-1 rounded-full font-bold", statusFilter === s ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>{count}</span>}</button>; })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{filtered.length} horse{filtered.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live · updated {lastUpdated ?? "now"}</div>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-1">{[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-secondary/30 animate-pulse rounded" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
                <Truck className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-foreground font-semibold mb-1">No horses found</p>
                {!search && statusFilter === "all" && <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Register</Button>}
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-secondary/40">
                    <th className="pl-4 pr-2 py-2 w-6" />
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Horse / Trailer</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="hidden sm:table-cell px-2 py-2 text-left text-xs font-medium text-muted-foreground">Owner</th>
                    <th className="hidden sm:table-cell px-2 py-2 text-left text-xs font-medium text-muted-foreground">Driver</th>
                    <th className="hidden md:table-cell px-2 py-2 text-left text-xs font-medium text-muted-foreground">Location</th>
                    <th className="hidden lg:table-cell px-2 py-2 text-left text-xs font-medium text-muted-foreground">Last Trip</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Trip</th>
                    <th className="px-2 pr-3 py-2 w-16" />
                  </tr></thead>
                  <tbody>
                    {filtered.map((t: any) => <TruckRow key={t.id} truck={t} driverName={getCurrentDriverName(t.id)} onEdit={() => { setEditTruck(t); setOriginalSubId(t.subcontractorId); setOriginalCompanyOwned(!!t.companyOwned); setEditLinkedTrailerId(t.linkedTrailer?.id ? String(t.linkedTrailer.id) : "__none__"); }} onRetire={() => setConfirmDelete(t)} onDriverHistory={() => setShowDriverDialog({ truck: t })} onLocationSave={handleLocationSave} savingLocationId={savingLocationId} />)}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {fleetTab === "trailers" && (
          <>
            <div className="space-y-3 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search trailer plate or assigned horse..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
                {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {STATUS_FILTERS.filter(s => s !== "on_trip").map((s) => { const count = s === "all" ? (trailers as any[]).length : (trailers as any[]).filter(t => t.status === s).length; return <button key={s} onClick={() => setStatusFilter(s)} className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border", statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-transparent hover:border-border")}>{s !== "all" && <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s] ?? "bg-muted-foreground")} />}{STATUS_LABEL[s]}{count > 0 && <span className={cn("text-[9px] px-1 rounded-full font-bold", statusFilter === s ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>{count}</span>}</button>; })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{filteredTrailers.length} trailer{filteredTrailers.length !== 1 ? "s" : ""} · {(trailers as any[]).filter(t => !t.currentHorseId).length} unassigned</span>
              </div>
            </div>

            {trailersLoading ? (
              <div className="space-y-1">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-secondary/30 animate-pulse rounded" />)}</div>
            ) : filteredTrailers.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
                <Container className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-foreground font-semibold mb-1">No trailers registered</p>
                {!search && statusFilter === "all" && <Button size="sm" className="mt-4" onClick={() => { setForm({ ...emptyForm, registering: "trailer" }); setShowCreate(true); }}><Plus className="w-4 h-4 mr-2" />Register Trailer</Button>}
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-secondary/40">
                    <th className="pl-4 pr-2 py-2 w-6" />
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Trailer Plate</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Assigned Horse</th>
                    <th className="px-2 pr-3 py-2 w-20" />
                  </tr></thead>
                  <tbody>
                    {filteredTrailers.map((t: any) => <TrailerRow key={t.id} trailer={t} horses={horsesArr} onReassign={(tr) => { setReassignTrailer(tr); setReassignHorseId(tr.currentHorseId ? String(tr.currentHorseId) : ""); }} onEditStatus={(tr) => { setEditTrailerStatus(tr); setEditTrailerStatusValue(tr.status); }} onRetire={(tr) => setRetireTrailer(tr)} />)}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PageContent>

      {/* Register Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Register New Unit</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {/* Registering type */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Registering</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["unit", "horse", "trailer"] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setForm({ ...form, registering: r })} className={cn("py-2 px-2 rounded-lg border text-xs font-medium transition-all text-center", form.registering === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50")}>
                    {registeringLabel[r]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {form.registering === "unit" && "Creates a horse and trailer together, linked as a pair."}
                {form.registering === "horse" && "Creates a horse (cab/prime mover) without a trailer."}
                {form.registering === "trailer" && "Creates a standalone trailer — assign to a horse later."}
              </p>
            </div>

            {/* Plate fields */}
            {form.registering === "trailer" ? (
              <div>
                <Label>Trailer Plate *</Label>
                <Input value={form.trailerPlate} onChange={(e) => setForm({ ...form, trailerPlate: e.target.value })} className="mt-1" placeholder="e.g. T456XYZ" />
              </div>
            ) : form.registering === "unit" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Horse Plate *</Label><Input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="mt-1" placeholder="e.g. T123ABC" /></div>
                <div><Label>Trailer Plate *</Label><Input value={form.trailerPlate} onChange={(e) => setForm({ ...form, trailerPlate: e.target.value })} className="mt-1" placeholder="e.g. T456XYZ" /></div>
              </div>
            ) : (
              <div><Label>Horse Plate *</Label><Input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="mt-1" placeholder="e.g. T123ABC" /></div>
            )}

            {/* Ownership — only for horse/unit */}
            {form.registering !== "trailer" && (
              <>
                {fleetMode === "company" && <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm"><Building2 className="w-4 h-4 shrink-0" /><span className="font-medium">Company Fleet truck — no commission</span></div>}
                {fleetMode === "mixed" && (
                  <div>
                    <Label>Ownership</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button type="button" onClick={() => setForm({ ...form, companyOwned: false, subcontractorId: "" })} className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", !form.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}><User className="w-4 h-4" />Subcontractor</button>
                      <button type="button" onClick={() => setForm({ ...form, companyOwned: true, subcontractorId: "" })} className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", form.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}><Building2 className="w-4 h-4" />Company</button>
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
                <div><Label>Current Location</Label><Input value={form.currentLocation} onChange={(e) => setForm({ ...form, currentLocation: e.target.value })} className="mt-1" placeholder="e.g. Ndola Depot, Lusaka Yard" /></div>
              </>
            )}

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
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setForm(emptyForm); }}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating || createTrailerMutation.isPending ||
                (form.registering === "trailer" && !form.trailerPlate) ||
                (form.registering !== "trailer" && !form.plateNumber) ||
                (form.registering !== "trailer" && !form.companyOwned && !form.subcontractorId && fleetMode !== "company")
              }
            >
              {(creating || createTrailerMutation.isPending) ? "Saving..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Horse Dialog */}
      <Dialog open={!!editTruck} onOpenChange={() => { setEditTruck(null); setEditLinkedTrailerId("__none__"); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Update — {editTruck?.plateNumber}</DialogTitle></DialogHeader>
          {editTruck && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Horse Plate</Label><Input value={editTruck.plateNumber ?? ""} onChange={(e) => setEditTruck({ ...editTruck, plateNumber: e.target.value })} className="mt-1" /></div>
                <div>
                  <Label>Linked Trailer</Label>
                  <Select value={editLinkedTrailerId} onValueChange={setEditLinkedTrailerId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="No trailer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No trailer —</SelectItem>
                      {(trailers as any[])
                        .filter(t => t.status !== "retired" && (!t.currentHorseId || t.id === editTruck.linkedTrailer?.id))
                        .map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Ownership</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button type="button" onClick={() => setEditTruck({ ...editTruck, companyOwned: false })} className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", !editTruck.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50")}><Users className="w-3.5 h-3.5" />Subcontractor</button>
                  <button type="button" onClick={() => setEditTruck({ ...editTruck, companyOwned: true })} className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all", editTruck.companyOwned ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50")}><Building2 className="w-3.5 h-3.5" />Company Fleet</button>
                </div>
                {!editTruck.companyOwned && (
                  <div className="mt-2">
                    <Select value={String(editTruck.subcontractorId ?? "")} onValueChange={(v) => setEditTruck({ ...editTruck, subcontractorId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
                      <SelectContent>{(subs as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {editTruck.status === "on_trip" && <p className="text-xs text-amber-500 mt-1">On a trip — transfer takes effect from the next nomination.</p>}
                  </div>
                )}
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
              {editTruck.status !== "on_trip" && <div><Label>Current Location</Label><Input value={editTruck.currentLocation ?? ""} onChange={(e) => setEditTruck({ ...editTruck, currentLocation: e.target.value })} className="mt-1" placeholder="e.g. Ndola Depot" /></div>}
              <div><Label>Notes</Label><Input value={editTruck.notes ?? ""} onChange={(e) => setEditTruck({ ...editTruck, notes: e.target.value })} className="mt-1" /></div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Insurance</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Insurer</Label><Input value={editTruck.insurerName ?? ""} onChange={(e) => setEditTruck({ ...editTruck, insurerName: e.target.value })} className="mt-1" /></div>
                  <div><Label>Policy Number</Label><Input value={editTruck.policyNumber ?? ""} onChange={(e) => setEditTruck({ ...editTruck, policyNumber: e.target.value })} className="mt-1" /></div>
                  <div><Label>Coverage (USD)</Label><Input type="number" value={editTruck.coverageAmount ?? ""} onChange={(e) => setEditTruck({ ...editTruck, coverageAmount: e.target.value })} className="mt-1" placeholder="0.00" /></div>
                  <div><Label>Expiry Date</Label><Input type="date" value={editTruck.insuranceExpiry ?? ""} onChange={(e) => setEditTruck({ ...editTruck, insuranceExpiry: e.target.value })} className="mt-1" /></div>
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

      {/* Reassign Trailer Dialog */}
      <Dialog open={!!reassignTrailer} onOpenChange={(o) => { if (!o) { setReassignTrailer(null); setReassignHorseId(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign Trailer — {reassignTrailer?.plateNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Select which horse this trailer is assigned to, or leave unassigned if it's in the yard.</p>
            <div>
              <Label>Assign to Horse</Label>
              <Select value={reassignHorseId || "__none__"} onValueChange={(v) => setReassignHorseId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select horse…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {horsesArr
                    .filter(h => h.status !== "retired" && (!h.linkedTrailer || h.linkedTrailer.id === reassignTrailer?.id))
                    .map((h: any) => <SelectItem key={h.id} value={String(h.id)}>{h.plateNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignTrailer(null); setReassignHorseId(""); }}>Cancel</Button>
            <Button onClick={() => reassignTrailer && assignHorseMutation.mutate({ trailerId: reassignTrailer.id, horseId: reassignHorseId ? parseInt(reassignHorseId) : null })} disabled={assignHorseMutation.isPending}>
              {assignHorseMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Trailer Status Dialog */}
      <Dialog open={!!editTrailerStatus} onOpenChange={(o) => { if (!o) setEditTrailerStatus(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Update Status — {editTrailerStatus?.plateNumber}</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={editTrailerStatusValue} onValueChange={setEditTrailerStatusValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTrailerStatus(null)}>Cancel</Button>
            <Button onClick={() => editTrailerStatus && updateTrailerStatusMutation.mutate({ id: editTrailerStatus.id, status: editTrailerStatusValue })} disabled={updateTrailerStatusMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcontractor swap / Ownership transfer / Retire horse */}
      <AlertDialog open={confirmSubSwap} onOpenChange={setConfirmSubSwap}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Change Subcontractor?</AlertDialogTitle><AlertDialogDescription>Reassigning this truck to a different subcontractor affects future trips only. Existing records keep the original subcontractor.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setConfirmSubSwap(false)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={doUpdate}>Confirm Reassignment</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOwnershipTransfer} onOpenChange={setConfirmOwnershipTransfer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Ownership?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Moving <span className="font-semibold text-foreground">{editTruck?.plateNumber}</span> from <span className="font-semibold text-foreground">{originalCompanyOwned ? "Company Fleet" : "Subcontractor"}</span> to <span className="font-semibold text-foreground">{editTruck?.companyOwned ? "Company Fleet" : "Subcontractor"}</span>.</p>
                <p>Past trip records keep their original ownership. This transfer affects future nominations only.</p>
                {editTruck?.status === "on_trip" && <p className="text-amber-500 font-medium">Currently on a trip — transfer takes effect from the next nomination.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setConfirmOwnershipTransfer(false)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={doUpdate}>Confirm Transfer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Retire {confirmDelete?.plateNumber}?</AlertDialogTitle><AlertDialogDescription>This horse will be marked as retired and removed from active operations. All historical trip records are preserved.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleRetire} className="bg-amber-500 hover:bg-amber-600">Retire Horse</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!retireTrailer} onOpenChange={() => setRetireTrailer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Retire Trailer {retireTrailer?.plateNumber}?</AlertDialogTitle><AlertDialogDescription>This trailer will be marked as retired and removed from available pool.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-500 hover:bg-amber-600" onClick={() => retireTrailer && updateTrailerStatusMutation.mutate({ id: retireTrailer.id, status: "retired" }, { onSuccess: () => setRetireTrailer(null) })}>Retire Trailer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Driver assignment dialog */}
      <Dialog open={!!showDriverDialog} onOpenChange={() => { setShowDriverDialog(null); setSelectedDriverId("__none__"); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Driver — {showDriverDialog?.truck?.plateNumber}</DialogTitle></DialogHeader>
          {showDriverDialog && (() => {
            const currentAssignment = (driverHistory as any[]).find((h: any) => !h.unassignedAt);
            return (
              <div className="space-y-4 py-1">
                <div className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm border", currentAssignment ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400")}>
                  <User className="w-4 h-4 shrink-0" />
                  {currentAssignment ? <span>Currently assigned: <span className="font-semibold">{currentAssignment.driverName}</span></span> : <span>No driver assigned yet</span>}
                </div>
                <div className="space-y-1.5">
                  <Label>{currentAssignment ? "Change driver" : "Assign a driver"}</Label>
                  <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                    <SelectTrigger><SelectValue placeholder="Select driver…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select driver —</SelectItem>
                      {(drivers as any[]).map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(driverHistory as any[]).length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">History</Label>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {(driverHistory as any[]).map((h: any) => (
                        <div key={h.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground">
                          <User className="w-3 h-3 shrink-0" /><span className="flex-1">{h.driverName}</span>
                          <span>{h.assignedAt ? new Date(h.assignedAt).toLocaleDateString() : "—"}</span>
                          {h.unassignedAt ? <span className="text-muted-foreground/50">→ {new Date(h.unassignedAt).toLocaleDateString()}</span> : <span className="text-emerald-400 font-medium">Current</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDriverDialog(null); setSelectedDriverId("__none__"); }}>Cancel</Button>
            <Button disabled={assigning || (() => { const cur = (driverHistory as any[]).find((h: any) => !h.unassignedAt); return selectedDriverId === "__none__" || selectedDriverId === String(cur?.driverId); })()} onClick={async () => { await handleAssignDriver(parseInt(selectedDriverId)); setSelectedDriverId("__none__"); }}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
