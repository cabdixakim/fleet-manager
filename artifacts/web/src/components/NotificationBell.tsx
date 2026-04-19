import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, MessageSquare, CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  task_assigned: { icon: MessageSquare, color: "text-blue-400" },
  task_completed: { icon: CheckCircle2, color: "text-emerald-400" },
  overdue_invoice: { icon: AlertCircle, color: "text-red-400" },
  stuck_trip: { icon: AlertCircle, color: "text-orange-400" },
};

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => api("/api/notifications/unread-count").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => api("/api/notifications").then((r) => r.json()),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api(`/api/notifications/${id}/read`, { method: "PUT" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api("/api/notifications/read-all", { method: "PUT" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const unread = countData?.count ?? 0;

  function handleClick(n: Notification) {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
          open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        )}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 max-h-[480px] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[10px] font-bold">{unread} new</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/60 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <Bell className="w-8 h-8 text-muted-foreground/20" />
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = TYPE_ICON[n.type] ?? { icon: Bell, color: "text-muted-foreground" };
                const Icon = config.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 border-b border-border/40 text-left transition-colors hover:bg-secondary/20",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className={cn("mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                      !n.read ? "bg-primary/10" : "bg-secondary/50"
                    )}>
                      <Icon className={cn("w-3.5 h-3.5", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-semibold leading-tight truncate", !n.read ? "text-foreground" : "text-foreground/80")}>{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
