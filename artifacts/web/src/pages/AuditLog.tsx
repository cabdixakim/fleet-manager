import { useState, useEffect, useRef } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, formatDistanceToNow, startOfDay, endOfDay } from "date-fns";
import {
  Shield, ChevronLeft, ChevronRight, Search, Filter, X,
  Plus, Pencil, Trash2, ArrowRightLeft, CreditCard,
  LogIn, LogOut as LogOutIcon, AlertTriangle, Upload,
  Eye, ChevronDown, ChevronUp, Layers, Truck, Users,
  Building2, FileText, User, RotateCcw, Ban, Calendar,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTIONS = [
  "create", "update", "delete", "status_change", "cancellation",
  "status_revert", "payment", "login", "logout", "login_failed",
  "file_upload", "amendment",
];
const ENTITIES = [
  "batch", "trip", "client", "subcontractor", "invoice", "user",
  "driver", "truck", "payroll", "settings", "auth",
  "client_transaction", "subcontractor_transaction",
  "trip_expense", "truck_expense", "company_expense",
  "clearance", "delivery_note",
];
const PAGE_SIZE = 50;

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  create:        { icon: Plus,           color: "text-emerald-400",  bg: "bg-emerald-500/10 border-emerald-500/20",   label: "Created"    },
  update:        { icon: Pencil,         color: "text-blue-400",     bg: "bg-blue-500/10 border-blue-500/20",         label: "Updated"    },
  delete:        { icon: Trash2,         color: "text-red-400",      bg: "bg-red-500/10 border-red-500/20",           label: "Deleted"    },
  status_change: { icon: ArrowRightLeft, color: "text-violet-400",   bg: "bg-violet-500/10 border-violet-500/20",     label: "Status"     },
  cancellation:  { icon: Ban,            color: "text-red-400",      bg: "bg-red-500/10 border-red-500/20",           label: "Cancelled"  },
  status_revert: { icon: RotateCcw,     color: "text-amber-400",    bg: "bg-amber-500/10 border-amber-500/20",       label: "Reverted"   },
  payment:       { icon: CreditCard,     color: "text-amber-400",    bg: "bg-amber-500/10 border-amber-500/20",       label: "Payment"    },
  login:         { icon: LogIn,          color: "text-teal-400",     bg: "bg-teal-500/10 border-teal-500/20",         label: "Login"      },
  logout:        { icon: LogOutIcon,     color: "text-slate-400",    bg: "bg-slate-500/10 border-slate-500/20",       label: "Logout"     },
  login_failed:  { icon: AlertTriangle,  color: "text-red-400",      bg: "bg-red-500/10 border-red-500/20",           label: "Failed"     },
  file_upload:   { icon: Upload,         color: "text-sky-400",      bg: "bg-sky-500/10 border-sky-500/20",           label: "Upload"     },
  amendment:     { icon: ArrowRightLeft, color: "text-orange-400",   bg: "bg-orange-500/10 border-orange-500/20",     label: "Amended"    },
};

const ENTITY_ICON: Record<string, React.ElementType> = {
  batch: Layers, trip: Truck, client: Building2, subcontractor: Users,
  invoice: FileText, user: User, driver: User, truck: Truck,
  payroll: CreditCard, settings: Shield, auth: Shield,
  client_transaction: CreditCard, subcontractor_transaction: CreditCard,
  trip_expense: CreditCard, truck_expense: CreditCard, company_expense: CreditCard,
  clearance: FileText, delivery_note: FileText,
};

const METADATA_LABELS: Record<string, string> = {
  from: "From status",
  to: "To status",
  amendmentType: "Amendment type",
  fromStatus: "From status",
  revertReason: "Revert reason",
  cancellationReason: "Cancellation reason",
  reason: "Reason",
  newTruckId: "New truck ID",
  newDriverId: "New driver ID",
  newCapacity: "New capacity (MT)",
  invoiceDeLinked: "Invoice de-linked",
  status: "New status",
  incidentFlag: "Incident flagged",
  previousStatus: "Previous status",
  replacementTruckId: "Replacement truck ID",
  revenueOwner: "Revenue attribution",
  role: "Role",
  email: "Email",
  type: "Transaction type",
  amount: "Amount",
  reference: "Reference",
  fields: "Fields changed",
  route: "Route",
  cargo: "Cargo",
  ratePerMt: "Rate / MT",
  salary: "Salary",
};

function formatMetaValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "amount") return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === "ratePerMt") return `$${Number(value).toFixed(2)}/MT`;
  if (key === "salary") return `$${Number(value).toLocaleString()}/mo`;
  if (key === "newCapacity") return `${value} MT`;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function groupByDay(logs: AuditEntry[]) {
  const groups: { label: string; date: Date; entries: AuditEntry[] }[] = [];
  for (const log of logs) {
    const d = new Date(log.createdAt);
    const key = d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date.toDateString() === key) {
      last.entries.push(log);
    } else {
      let label = format(d, "EEEE, MMMM d, yyyy");
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      groups.push({ label, date: d, entries: [log] });
    }
  }
  return groups;
}

function AuditCard({ log }: { log: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = ACTION_CONFIG[log.action] ?? { icon: Eye, color: "text-muted-foreground", bg: "bg-secondary border-border", label: log.action };
  const Icon = cfg.icon;
  const EntityIcon = ENTITY_ICON[log.entity] ?? FileText;
  const relevantMeta = log.metadata
    ? Object.entries(log.metadata).filter(([, v]) => v !== null && v !== undefined)
    : [];
  const hasMetadata = relevantMeta.length > 0;
  const timeAgo = formatDistanceToNow(new Date(log.createdAt), { addSuffix: true });
  const timeExact = format(new Date(log.createdAt), "HH:mm:ss");

  return (
    <div className="relative pl-8 pb-4 group">
      {/* Timeline dot */}
      <div className={cn(
        "absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center border",
        cfg.bg
      )}>
        <Icon className={cn("w-3 h-3", cfg.color)} />
      </div>

      {/* Card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-border/80 transition-colors">
        <div className="flex items-start gap-3 p-3.5">
          {/* Entity icon */}
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
            <EntityIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold border uppercase tracking-wide", cfg.bg, cfg.color)}>
                  {cfg.label}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {log.entity.replace(/_/g, " ")}{log.entityId ? ` #${log.entityId}` : ""}
                </span>
              </div>
              <time className="text-[10px] text-muted-foreground/60 shrink-0 font-mono" title={timeExact}>
                {timeAgo} · {timeExact}
              </time>
            </div>
            <p className="text-sm text-foreground mt-1 leading-snug">{log.description}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center text-[8px] font-bold text-primary">
                  {log.userName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                </div>
                <span className="text-[10px] text-muted-foreground">{log.userName ?? "System"}</span>
              </div>
              {log.ipAddress && (
                <span className="text-[10px] text-muted-foreground/50 hidden sm:block font-mono">{log.ipAddress}</span>
              )}
              {hasMetadata && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 ml-auto"
                >
                  {expanded ? "Hide details" : "Show details"}
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
            {expanded && hasMetadata && (
              <div className="mt-2 p-2.5 bg-secondary/50 rounded-lg border border-border/40 space-y-1">
                {relevantMeta.map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0 min-w-[120px]">
                      {METADATA_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </span>
                    <span className="text-foreground font-medium">{formatMetaValue(k, v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ action: "", entity: "", search: "", from: "", to: "" });
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input → server query param
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
      setPage(0);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(page * PAGE_SIZE));
  if (filters.action) params.set("action", filters.action);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);

  const { data, isLoading } = useQuery<{ logs: AuditEntry[]; total: number }>({
    queryKey: ["audit-logs", page, filters.action, filters.entity, filters.search, filters.from, filters.to],
    queryFn: () => fetch(`/api/audit-logs?${params}`, { credentials: "include" }).then((r) => r.json()),
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const groups = groupByDay(logs);

  const hasFilters = filters.action || filters.entity || filters.search || filters.from || filters.to;

  function clearFilters() {
    setFilters({ action: "", entity: "", search: "", from: "", to: "" });
    setSearchInput("");
    setPage(0);
  }

  return (
    <Layout>
      <PageHeader
        title="Audit Log"
        subtitle="Complete record of all system activity and changes"
      />
      <PageContent>
        {/* Filters */}
        <div className="space-y-2 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search descriptions, users..."
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Action filter */}
            <Select value={filters.action || "all"} onValueChange={(v) => { setFilters((f) => ({ ...f, action: v === "all" ? "" : v })); setPage(0); }}>
              <SelectTrigger className="w-38 h-9 text-sm">
                <Filter className="w-3 h-3 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    <span className="flex items-center gap-2">
                      {ACTION_CONFIG[a] ? (
                        <span className={cn("text-[10px] px-1 py-0.5 rounded border font-bold", ACTION_CONFIG[a].bg, ACTION_CONFIG[a].color)}>
                          {ACTION_CONFIG[a].label}
                        </span>
                      ) : null}
                      {a.replace(/_/g, " ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Entity filter */}
            <Select value={filters.entity || "all"} onValueChange={(v) => { setFilters((f) => ({ ...f, entity: v === "all" ? "" : v })); setPage(0); }}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITIES.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
                <X className="w-3.5 h-3.5" />Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} entries</span>
          </div>

          {/* Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date range:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground sr-only">From</Label>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); setPage(0); }}
                className="h-8 text-xs w-36 px-2"
                placeholder="From"
              />
            </div>
            <span className="text-xs text-muted-foreground">→</span>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground sr-only">To</Label>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); setPage(0); }}
                className="h-8 text-xs w-36 px-2"
                placeholder="To"
              />
            </div>
            {(filters.from || filters.to) && (
              <Button
                size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1"
                onClick={() => { setFilters((f) => ({ ...f, from: "", to: "" })); setPage(0); }}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="pl-8 pb-4">
                <div className="h-16 bg-secondary/30 animate-pulse rounded-xl" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-foreground font-semibold mb-1">No entries found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-3 top-6 bottom-0 w-px bg-border" />

            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  {/* Day separator */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 shrink-0" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider bg-background px-2 py-0.5 rounded-full border border-border">
                        {group.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{group.entries.length} event{group.entries.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {group.entries.map((log) => (
                      <AuditCard key={log.id} log={log} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} · {total.toLocaleString()} total
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setPage(0)} disabled={page === 0}>First</Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>Last</Button>
            </div>
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
