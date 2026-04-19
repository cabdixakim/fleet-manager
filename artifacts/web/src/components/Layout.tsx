import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CommandPalette } from "@/components/CommandPalette";
import {
  LayoutDashboard, Truck, Users, Package, Building2, CreditCard, FileText,
  BarChart3, ChevronRight, X, Layers, TruckIcon, UserCheck, DollarSign,
  ClipboardCheck, Receipt, Settings, LogOut, Shield, Calendar, Search, MessageSquare,
  Menu, ChevronLeft, MapPin, List, Calculator, BookOpen, BarChart2, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { sidebarConfig } from "@/components/sidebarConfig";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatDrawer } from "@/components/ChatDrawer";

type UserRole = "admin" | "manager" | "accounts" | "operations";

function getIcon(icon: string) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    dashboard: LayoutDashboard, layers: Layers, truck: TruckIcon,
    fileText: FileText, shieldCheck: Shield, users: Users, user: UserCheck,
    briefcase: Building2, creditCard: CreditCard, dollarSign: DollarSign,
    barChart: BarChart3, clipboardList: ClipboardCheck, settings: Settings, messageSquare: MessageSquare,
    userCog: UserCheck, calendar: Calendar, receipt: Receipt, package: Package,
    list: List, mapPin: MapPin, calculator: Calculator, bookOpen: BookOpen, barChart2: BarChart2,
    building2: Building2, wallet: Wallet,
  };
  return icons[icon] || FileText;
}

const BOTTOM_NAV = [
  { path: "/", icon: "dashboard", label: "Home" },
  { path: "/batches", icon: "layers", label: "Batches" },
  { path: "/trips", icon: "truck", label: "Trips" },
  { path: "/clients", icon: "briefcase", label: "Clients" },
  { path: "/trucks", icon: "truck", label: "Fleet" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const openSidebar = () => setMobileOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("open-sidebar", openSidebar);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("open-sidebar", openSidebar);
    };
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location]);

  const { data: settings } = useQuery<{ name: string; logoUrl: string | null; fleetMode?: string }>({
    queryKey: ["company-settings-sidebar"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const [sidebarLogoErr, setSidebarLogoErr] = useState(false);
  useEffect(() => { setSidebarLogoErr(false); }, [settings?.logoUrl]);

  const fleetMode = settings?.fleetMode ?? "subcontractor";
  const companyName = settings?.name || "Optima Transport LLC";
  const logoUrl = settings?.logoUrl || null;
  const initials = companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open, always visible md+; hidden on print */}
      <aside className={cn(
        "print:hidden flex flex-col bg-card border-r border-border transition-all duration-300 shrink-0 z-50",
        "fixed inset-y-0 left-0 md:relative md:translate-x-0",
        mobileOpen ? "translate-x-0 w-64 shadow-2xl" : "-translate-x-full md:translate-x-0",
        !mobileOpen && "md:w-auto",
        collapsed ? "md:w-16" : "md:w-60",
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl && !sidebarLogoErr ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-full h-full object-cover"
                onError={() => setSidebarLogoErr(true)}
              />
            ) : (
              <span className="text-primary-foreground font-bold text-[11px] select-none leading-none">
                {initials}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 md:block" style={{ display: collapsed ? "none" : undefined }}>
            <div className="font-display font-bold text-[11px] leading-tight text-foreground line-clamp-2 break-words">{companyName}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Logistics Management</div>
          </div>
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-5">
          {(() => {
            const role = (user?.role ?? "operations") as import("@/components/sidebarConfig").UserRole;
            // owner and system see everything — no role filtering applied
            const superUser = role === "owner" || role === "system";
            return sidebarConfig.map((group) => {
            // Group-level role gate
            if (!superUser && group.roles && !group.roles.includes(role)) return null;

            const visibleLinks = group.links.filter((item) => {
              // Link-level role gate
              if (!superUser && item.roles && !item.roles.includes(role)) return false;
              // Fleet mode gates (apply to everyone)
              if (item.fleetHide === "company" && fleetMode === "company") return false;
              if (item.fleetOnly === "company" && fleetMode !== "company") return false;
              return true;
            });
            if (visibleLinks.length === 0) return null;
            return (
            <div key={group.section}>
              {!collapsed && (
                <div className="text-[10px] font-bold text-muted-foreground px-4 mb-1.5 uppercase tracking-widest">
                  {group.section}
                </div>
              )}
              {visibleLinks.map((item) => {
                const Icon = getIcon(item.icon);
                const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                return (
                  <Link key={item.path} href={item.path} className={cn(
                    "flex items-center gap-2.5 px-3 mx-2 rounded-lg transition-colors font-medium",
                    item.subtle
                      ? "py-1 text-xs"
                      : "py-2 text-sm",
                    active
                      ? item.subtle ? "bg-primary/5 text-primary/70" : "bg-primary/10 text-primary"
                      : item.subtle ? "text-muted-foreground/50 hover:bg-accent/30 hover:text-muted-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}>
                    <span className={cn("flex items-center justify-center shrink-0", item.subtle ? "w-3 h-3" : "w-4 h-4", collapsed && "mx-auto")}>
                      <Icon className={item.subtle ? "w-3 h-3" : "w-4 h-4"} />
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
          });
          })()}
        </nav>

        {/* User + actions */}
        <div className={cn("border-t border-border shrink-0", collapsed ? "p-2" : "p-3")}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{user?.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{user?.role}</div>
              </div>
              <ThemeToggleButton />
              <button onClick={logout} title="Sign out" className="text-muted-foreground hover:text-red-500 rounded p-1 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ThemeToggleButton />
              <button onClick={logout} className="text-muted-foreground hover:text-red-500 rounded p-1 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 print:overflow-visible print:w-full">
        {children}
      </main>

      {/* Mobile bottom navigation — hidden on print */}
      <nav className="print:hidden fixed bottom-0 left-0 right-0 z-30 md:hidden bg-card/95 backdrop-blur-lg border-t border-border flex items-center safe-area-bottom">
        {BOTTOM_NAV.map((item) => {
          const Icon = getIcon(item.icon);
          const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path} className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}>
              <Icon className={cn("w-5 h-5 transition-transform", active && "scale-110")} />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        {/* Chat button opens drawer */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-chat"))}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-muted-foreground"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[9px] font-medium">Chat</span>
        </button>
        {/* More button opens sidebar */}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ChatDrawer />
    </div>
  );
}

export function PageHeader({
  title, subtitle, actions,
}: {
  title?: string; subtitle?: string; actions?: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerLogoErr, setHeaderLogoErr] = useState(false);
  const { data: settings } = useQuery<{ name: string; logoUrl: string | null }>({
    queryKey: ["company-settings-header"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => { setHeaderLogoErr(false); }, [settings?.logoUrl]);

  const { data: currentPeriod } = useQuery<{ id: number; name: string; startDate: string; endDate: string; isClosed: boolean } | null>({
    queryKey: ["current-period-header"],
    queryFn: () => fetch("/api/periods/current", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const companyName = settings?.name || title || "Optima Transport LLC";
  const logoUrl = settings?.logoUrl || null;
  const headerInitials = companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const periodBadge = currentPeriod ? (
    <Link href="/periods">
      <span className="flex items-center gap-1 md:gap-1.5 px-2 py-1 text-[10px] md:text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer">
        <Calendar className="w-3 h-3" />
        <span>{currentPeriod.name}</span>
      </span>
    </Link>
  ) : currentPeriod !== undefined ? (
    <Link href="/periods">
      <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Calendar className="w-3 h-3" />
      </span>
    </Link>
  ) : null;

  return (
    <div className="print:hidden shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
      {/* ── Title row — always visible ── */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 gap-3">
        {/* Left: hamburger + logo + title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-sidebar"))}
            className="md:hidden text-muted-foreground hover:text-foreground p-1 -ml-1 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden hidden sm:flex">
            {logoUrl && !headerLogoErr ? (
              <img src={logoUrl} alt={companyName} className="w-full h-full object-cover" onError={() => setHeaderLogoErr(true)} />
            ) : (
              <span className="text-primary-foreground font-bold text-[10px] select-none leading-none">{headerInitials}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-display font-bold text-foreground truncate">{title || companyName}</h1>
            {subtitle && <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Right: period + search + actions (desktop only when actions exist) */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {periodBadge}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground bg-secondary/60 hover:bg-secondary border border-border rounded-lg transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden md:inline ml-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-chat"))}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Team Chat"
            aria-label="Open chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <NotificationBell />
          {/* Actions inline on desktop */}
          {actions && <div className="hidden md:flex items-center gap-2">{actions}</div>}
        </div>
      </div>

      {/* ── Actions row — mobile only, shown below title when actions exist ── */}
      {actions && (
        <div className="md:hidden flex items-center justify-end gap-2 px-4 py-2 border-t border-border/50 overflow-x-auto scrollbar-none bg-secondary/30">
          {actions}
        </div>
      )}
    </div>
  );
}

export function PageContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 print:overflow-visible print:pb-0 print:p-4", className)}>
      {children}
    </div>
  );
}
