import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Truck, MapPin, User, Package, AlertTriangle,
  ChevronRight, Filter, X,
} from "lucide-react";

import { getRouteShort } from "@/lib/routes";
import { TaskTrigger } from "@/components/TaskPanel";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "nominated", label: "Nominated" },
  { value: "loading", label: "Loading" },
  { value: "loaded", label: "Loaded" },
  { value: "in_transit", label: "In Transit" },
  { value: "at_zambia_entry", label: "At Zambia" },
  { value: "at_drc_entry", label: "At DRC" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "amended_out", label: "Amended" },
];

const STATUS_COLOR: Record<string, string> = {
  nominated: "bg-slate-500/10 text-slate-400",
  loading: "bg-yellow-500/10 text-yellow-400",
  loaded: "bg-blue-500/10 text-blue-400",
  in_transit: "bg-primary/10 text-primary",
  at_zambia_entry: "bg-orange-500/10 text-orange-400",
  at_drc_entry: "bg-purple-500/10 text-purple-400",
  delivered: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
  amended_out: "bg-muted text-muted-foreground",
};

const STATUS_DOT: Record<string, string> = {
  nominated: "bg-slate-400",
  loading: "bg-yellow-400",
  loaded: "bg-blue-400",
  in_transit: "bg-primary animate-pulse",
  at_zambia_entry: "bg-orange-400 animate-pulse",
  at_drc_entry: "bg-purple-400 animate-pulse",
  delivered: "bg-green-400",
  cancelled: "bg-red-400",
  amended_out: "bg-muted-foreground",
};

type TripRow = {
  id: number;
  batchId: number;
  batchName: string;
  batchRoute: string;
  clientName: string | null;
  truckPlate: string | null;
  trailerPlate: string | null;
  driverName: string | null;
  subcontractorName: string | null;
  product: string;
  capacity: number;
  status: string;
  loadedQty: number | null;
  deliveredQty: number | null;
  incidentFlag: boolean;
  createdAt: string;
};

export default function TripsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search) params.set("search", search);

  const { data: trips = [], isLoading } = useQuery<TripRow[]>({
    queryKey: ["/api/trips", statusFilter, search],
    queryFn: () => fetch(`/api/trips?${params}`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  // Counts per status for the filter bar
  const allData = useQuery<TripRow[]>({
    queryKey: ["/api/trips"],
    queryFn: () => fetch("/api/trips", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
  });
  const counts = (allData.data ?? []).reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeStatuses = ["in_transit", "at_zambia_entry", "at_drc_entry", "loading", "loaded"];
  const activeCount = activeStatuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

  return (
    <Layout>
      <PageHeader
        title="Trips"
        subtitle={`${activeCount} active · ${(allData.data ?? []).length} total`}
      />
      <PageContent className="space-y-4">
        {/* Search + filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search truck, driver, batch, client..."
              className="pl-9 h-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status filter pills — horizontal scroll on mobile */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
            {STATUS_FILTERS.map((f) => {
              const count = f.value ? counts[f.value] : (allData.data ?? []).length;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/60 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
                  )}
                >
                  {f.label}
                  {count > 0 && (
                    <span className={cn(
                      "text-[9px] px-1 rounded-full font-bold",
                      statusFilter === f.value ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    )}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-secondary/30 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Truck className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-foreground font-semibold mb-1">No trips found</p>
            <p className="text-sm text-muted-foreground">
              {search || statusFilter ? "Try adjusting your filters" : "Trips are created from within a batch"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trips.map((trip) => (
              <div
                key={trip.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/trips/${trip.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/trips/${trip.id}`)}
                className="w-full cursor-pointer text-left bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-card/80 active:scale-[0.99] transition-all group"
              >
                <div className="flex items-start gap-3">
                  {/* Status indicator */}
                  <div className="mt-1 shrink-0">
                    <div className={cn("w-2 h-2 rounded-full", STATUS_DOT[trip.status] ?? "bg-muted-foreground")} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Row 1: Truck + incident + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground font-mono">
                        {trip.truckPlate ?? "—"}
                      </span>
                      {trip.trailerPlate && (
                        <span className="text-xs text-muted-foreground font-mono">/ {trip.trailerPlate}</span>
                      )}
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold border-0", STATUS_COLOR[trip.status])}>
                        {trip.status.replace(/_/g, " ")}
                      </span>
                      {trip.incidentFlag && (
                        <span className="flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Incident
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide ml-auto">
                        {trip.product}
                      </span>
                    </div>

                    {/* Row 2: Batch + route + client */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 shrink-0" />
                        {trip.batchName}
                      </span>
                      <span className="hidden sm:flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {getRouteShort(trip.batchRoute)}
                      </span>
                      {trip.clientName && (
                        <span className="text-muted-foreground/80">{trip.clientName}</span>
                      )}
                    </div>

                    {/* Row 3: Driver + sub + capacity */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 shrink-0" />
                        {trip.driverName ?? <span className="italic">No driver</span>}
                      </span>
                      {trip.subcontractorName && (
                        <span className="text-muted-foreground/70">· {trip.subcontractorName}</span>
                      )}
                      <span className="ml-auto text-muted-foreground/60 font-mono text-[10px]">
                        {trip.loadedQty != null
                          ? `${trip.loadedQty.toFixed(0)} MT loaded`
                          : `${trip.capacity.toFixed(0)} MT cap`}
                        {trip.deliveredQty != null && ` · ${trip.deliveredQty.toFixed(0)} MT del`}
                      </span>
                    </div>
                  </div>

                  {/* Task trigger + Chevron */}
                  <div
                    className="flex items-center gap-1 shrink-0 mt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TaskTrigger
                      recordType="trip"
                      recordId={trip.id}
                      recordLabel={`${trip.truckPlate ?? "Trip"} — ${trip.batchName}`}
                    />
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary footer */}
        {trips.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pb-2">
            Showing {trips.length} trip{trips.length !== 1 ? "s" : ""}
            {(search || statusFilter) && " (filtered)"}
            {" · "} Auto-refreshes every 30 seconds
          </p>
        )}
      </PageContent>
    </Layout>
  );
}
