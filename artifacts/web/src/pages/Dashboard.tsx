import { useGetDashboardMetrics, useGetDashboardAnalytics, useGetDashboardAlerts, useGetActiveOps } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  Package, Truck, AlertCircle, DollarSign, TrendingUp, TrendingDown,
  Users, FileText, AlertTriangle, ShieldAlert, ArrowRight, Activity,
  RefreshCw, MapPin, CheckCircle2, Clock, Zap,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";

import { getRouteShort } from "@/lib/routes";

const TRIP_STATUS_ORDER = ["nominated", "loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered"];
const TRIP_STATUS_COLOR: Record<string, string> = {
  nominated: "bg-slate-500",
  loading: "bg-yellow-400",
  loaded: "bg-blue-400",
  in_transit: "bg-primary",
  at_zambia_entry: "bg-orange-400",
  at_drc_entry: "bg-purple-400",
  delivered: "bg-emerald-500",
};
const TRIP_STATUS_LABEL: Record<string, string> = {
  nominated: "Nominated", loading: "Loading", loaded: "Loaded",
  in_transit: "In Transit", at_zambia_entry: "At Zambia", at_drc_entry: "At DRC", delivered: "Delivered",
};

// Theme-aware tooltip style
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

function TripProgressBar({ tripsByStatus, totalTrips }: { tripsByStatus: Record<string, number>; totalTrips: number }) {
  if (totalTrips === 0) return <p className="text-xs text-muted-foreground italic">No trucks assigned</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-secondary">
        {TRIP_STATUS_ORDER.map((s) => {
          const count = tripsByStatus[s] ?? 0;
          if (count === 0) return null;
          const pct = (count / totalTrips) * 100;
          return (
            <div key={s} title={`${TRIP_STATUS_LABEL[s]}: ${count}`} style={{ width: `${pct}%` }} className={cn("h-full", TRIP_STATUS_COLOR[s])} />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {TRIP_STATUS_ORDER.filter((s) => (tripsByStatus[s] ?? 0) > 0).map((s) => (
          <span key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("w-1.5 h-1.5 rounded-full inline-block", TRIP_STATUS_COLOR[s])} />
            {tripsByStatus[s]} {TRIP_STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  title, value, subtitle, icon: Icon, iconColor, trend, onClick,
}: {
  title: string; value: React.ReactNode; subtitle?: string;
  icon: React.ElementType; iconColor: string; trend?: { dir: "up" | "down" | "neutral"; label: string };
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-2xl p-4 flex flex-col gap-3",
        onClick && "cursor-pointer hover:border-primary/30 active:scale-[0.98] transition-all"
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-current/5", iconColor.replace("text-", "bg-").replace(/-([\d]+)/, "-$1/10"))}>
          <Icon className={cn("w-4.5 h-4.5", iconColor)} />
        </div>
        {trend && (
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
            trend.dir === "up" ? "text-emerald-400 bg-emerald-500/10" :
            trend.dir === "down" ? "text-red-400 bg-red-500/10" :
            "text-muted-foreground bg-secondary"
          )}>
            {trend.label}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold font-display text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{title}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: metrics, isLoading } = useGetDashboardMetrics();
  const { data: analytics } = useGetDashboardAnalytics({ period: "month" });
  const { data: alerts } = useGetDashboardAlerts();
  const { data: activeOps = [] } = useGetActiveOps();

  const totalAlerts = (alerts?.uninvoicedBatches?.length ?? 0) + (alerts?.pendingClearances?.filter((c) => c.daysWaiting >= 1)?.length ?? 0);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
    qc.invalidateQueries({ queryKey: ["/api/active-ops"] });
  };

  return (
    <Layout>
      <PageHeader
        title="Dashboard"
        subtitle="Operations command center"
        actions={
          <button
            onClick={handleRefresh}
            className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg border border-border hover:border-border/80"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      />
      <PageContent className="space-y-6">

        {/* ACTION CENTER */}
        {totalAlerts > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              <h2 className="text-sm font-bold text-foreground">Action Required</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-warning">{totalAlerts}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(alerts?.uninvoicedBatches ?? []).map((b) => (
                <button key={b.id} onClick={() => navigate(`/batches/${b.id}`)}
                  className="flex items-center gap-3 p-3.5 bg-warning/5 border border-warning/20 rounded-xl text-left hover:border-warning/40 hover:bg-warning/10 transition-all group active:scale-[0.98]">
                  <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                    <p className="text-xs text-warning font-medium">Needs invoicing</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-warning/50 group-hover:text-warning shrink-0 transition-colors" />
                </button>
              ))}
              {(alerts?.pendingClearances ?? []).filter((c) => c.daysWaiting >= 1).map((c) => (
                <button key={c.id} onClick={() => navigate("/clearances")}
                  className="flex items-center gap-3 p-3.5 bg-destructive/5 border border-destructive/20 rounded-xl text-left hover:border-destructive/40 hover:bg-destructive/10 transition-all group active:scale-[0.98]">
                  <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.truckPlate ?? "Unknown Truck"}</p>
                    <p className="text-xs text-destructive font-medium">{c.daysWaiting}d waiting — {c.type}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-destructive/50 group-hover:text-destructive shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI GRID */}
        <div>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="Active Batches"
              value={isLoading ? "—" : metrics?.activeBatches ?? 0}
              icon={Package} iconColor="text-primary"
              onClick={() => navigate("/batches")}
            />
            <KpiCard
              title="Trucks In Transit"
              value={isLoading ? "—" : metrics?.trucksInTransit ?? 0}
              icon={Truck} iconColor="text-warning"
              onClick={() => navigate("/trips")}
            />
            <KpiCard
              title="Pending Clearances"
              value={isLoading ? "—" : metrics?.pendingClearances ?? 0}
              icon={ShieldAlert} iconColor="text-destructive"
              onClick={() => navigate("/clearances")}
            />
            <KpiCard
              title="Uninvoiced Batches"
              value={isLoading ? "—" : metrics?.uninvoicedBatches ?? 0}
              icon={FileText}
              iconColor={metrics?.uninvoicedBatches ? "text-warning" : "text-emerald-400"}
              subtitle={metrics?.uninvoicedBatches ? "Need attention" : "All invoiced"}
              onClick={() => navigate("/invoices")}
            />
          </div>
        </div>

        {/* FINANCIAL KPIs */}
        <div>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Financials</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="Commission This Month"
              value={isLoading ? "—" : formatCurrency(metrics?.commissionThisMonth)}
              icon={DollarSign} iconColor="text-emerald-400"
              onClick={() => navigate("/reports")}
            />
            <KpiCard
              title="Client Receivables"
              value={isLoading ? "—" : formatCurrency(metrics?.totalReceivables)}
              subtitle="Outstanding invoices"
              icon={TrendingUp} iconColor="text-primary"
              onClick={() => navigate("/clients")}
            />
            <KpiCard
              title="Sub Payables"
              value={isLoading ? "—" : formatCurrency(metrics?.totalPayables)}
              subtitle="Owed to subs"
              icon={TrendingDown} iconColor="text-orange-400"
              onClick={() => navigate("/subcontractors")}
            />
            <KpiCard
              title="Active Drivers"
              value={isLoading ? "—" : metrics?.activeDrivers ?? 0}
              icon={Users} iconColor="text-purple-400"
              onClick={() => navigate("/drivers")}
            />
          </div>
        </div>

        {/* ACTIVE OPERATIONS */}
        {activeOps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-sm font-bold text-foreground">Live Operations</h2>
                <span className="text-xs text-muted-foreground">({activeOps.length})</span>
              </div>
              <button onClick={() => navigate("/batches")} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeOps.map((batch) => (
                <button key={batch.id} onClick={() => navigate(`/batches/${batch.id}`)}
                  className="bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/30 hover:bg-card/80 transition-all group active:scale-[0.98]">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-foreground truncate">{batch.name}</span>
                        <StatusBadge status={batch.status} />
                        {batch.pendingClearances > 0 && (
                          <span className="flex items-center gap-1 text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" />{batch.pendingClearances}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>{batch.clientName ?? "—"}</span>
                        <span>·</span>
                        <MapPin className="w-3 h-3" />
                        <span>{getRouteShort(batch.route)}</span>
                        <span>·</span>
                        <Truck className="w-3 h-3" />
                        <span>{batch.totalTrips}</span>
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                  </div>
                  <TripProgressBar tripsByStatus={batch.tripsByStatus} totalTrips={batch.totalTrips} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CHARTS */}
        {analytics && (
          <div>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Commission trend */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">Commission Trend</h3>
                <p className="text-xs text-muted-foreground mb-4">12-month rolling</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={analytics.commissionByPeriod}>
                    <defs>
                      <linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCurrency(v), "Commission"]} />
                    <Area type="monotone" dataKey="commission" stroke="hsl(var(--primary))" fill="url(#cgrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue by route */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">Revenue by Route</h3>
                <p className="text-xs text-muted-foreground mb-4">This period</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.revenueByRoute} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="route" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => getRouteShort(v)} width={70} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Revenue" />
                    <Bar dataKey="commission" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} name="Commission" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* QUICK ACTIONS */}
        <div>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "New Batch", icon: Package, path: "/batches", color: "text-primary" },
              { label: "All Trips", icon: Truck, path: "/trips", color: "text-warning" },
              { label: "Nominations", icon: FileText, path: "/nominations", color: "text-teal-400" },
              { label: "Reports", icon: TrendingUp, path: "/reports", color: "text-emerald-400" },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:bg-card/80 active:scale-[0.98] transition-all group"
              >
                <div className={cn("w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0", action.color)}>
                  <action.icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary ml-auto transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* RECENT BATCHES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recent Batches</h2>
            <button onClick={() => navigate("/batches")} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-secondary/30 animate-pulse rounded-xl" />)}
            </div>
          ) : !metrics?.recentBatches?.length ? (
            <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No batches yet</p>
              <button
                onClick={() => navigate("/batches")}
                className="mt-3 text-xs text-primary hover:text-primary/80 flex items-center gap-1"
              >
                Create first batch <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/50">
              {metrics.recentBatches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/batches/${b.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{b.name}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.clientName} · {getRouteShort(b.route)} · {b.activeTrips}/{b.truckCount} trucks
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</p>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary ml-auto transition-colors mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </PageContent>
    </Layout>
  );
}
