import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGlobalSearch } from "@workspace/api-client-react";
import { Search, Package, Users, Truck, User, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useGlobalSearch(query);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const sections = [
    ...(data?.batches?.length
      ? [{ label: "Batches", icon: Package, items: data.batches.map((b: any) => ({ label: b.name, sub: b.clientName ?? "", href: `/batches/${b.id}` })) }]
      : []),
    ...(data?.clients?.length
      ? [{ label: "Clients", icon: Users, items: data.clients.map((c: any) => ({ label: c.name, sub: c.contactEmail ?? "", href: `/clients` })) }]
      : []),
    ...(data?.trucks?.length
      ? [{ label: "Trucks", icon: Truck, items: data.trucks.map((t: any) => ({ label: t.plateNumber, sub: t.subcontractorName ?? "", href: `/fleet` })) }]
      : []),
    ...(data?.drivers?.length
      ? [{ label: "Drivers", icon: User, items: data.drivers.map((d: any) => ({ label: d.name, sub: d.licenseNumber ?? "", href: `/drivers` })) }]
      : []),
  ];

  const flat = sections.flatMap((s) => s.items);

  const quickNav = [
    { label: "Dashboard", href: "/" },
    { label: "Batches", href: "/batches" },
    { label: "Invoices", href: "/invoices" },
    { label: "Finance", href: "/finance" },
    { label: "Reports", href: "/reports" },
    { label: "Clearances", href: "/clearances" },
    { label: "Fleet", href: "/fleet" },
    { label: "Drivers", href: "/drivers" },
    { label: "Clients", href: "/clients" },
    { label: "Subcontractors", href: "/subcontractors" },
    { label: "Periods", href: "/periods" },
    { label: "Settings", href: "/settings" },
  ].filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (href: string) => {
    navigate(href);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const total = query.length >= 2 ? flat.length : quickNav.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, total - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") {
      if (query.length >= 2 && flat[cursor]) handleSelect(flat[cursor].href);
      else if (quickNav[cursor]) handleSelect(quickNav[cursor].href);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search batches, clients, trucks, drivers..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {isFetching && <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {query.length >= 2 ? (
            flat.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No results for "{query}"</div>
            ) : (
              (() => {
                let idx = 0;
                return sections.map((section) => (
                  <div key={section.label} className="mb-1">
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <section.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{section.label}</span>
                    </div>
                    {section.items.map((item) => {
                      const i = idx++;
                      return (
                        <button
                          key={item.href + item.label}
                          onClick={() => handleSelect(item.href)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                            i === cursor ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary/60"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.label}</p>
                            {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ));
              })()
            )
          ) : (
            <div>
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Navigation</span>
              </div>
              {quickNav.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => handleSelect(item.href)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                    i === cursor ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-secondary/30">
          <span className="text-[10px] text-muted-foreground">↑↓ Navigate</span>
          <span className="text-[10px] text-muted-foreground">↵ Select</span>
          <span className="text-[10px] text-muted-foreground">Esc Close</span>
          <span className="ml-auto text-[10px] text-muted-foreground">⌘K</span>
        </div>
      </div>
    </div>
  );
}
