import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, CheckCircle2, Circle, X, Send, RotateCcw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

type TaskUser = { id: number; name: string; role: string };
type Task = {
  id: number;
  note: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  assignedBy: TaskUser;
  assignedTo: TaskUser;
};

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

function timeAgo(s: string) {
  try { return formatDistanceToNow(new Date(s), { addSuffix: true }); } catch { return ""; }
}

// ─── Task Trigger Button (the 💬 icon) ──────────────────────────────────────
export function TaskTrigger({
  recordType, recordId, recordLabel,
}: {
  recordType: string; recordId: number; recordLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", recordType, recordId],
    queryFn: () => api(`/api/tasks/record/${recordType}/${recordId}`).then((r) => r.json()),
    enabled: open,
  });

  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0",
          openCount > 0
            ? "text-orange-400 hover:bg-orange-500/10"
            : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary/60"
        )}
        title="Tasks & requests"
      >
        <MessageSquare className="w-4 h-4" />
        {openCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-[8px] font-bold text-white">
            {openCount}
          </span>
        )}
      </button>

      {open && (
        <TaskPanel
          recordType={recordType}
          recordId={recordId}
          recordLabel={recordLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Task Panel (slide-out) ──────────────────────────────────────────────────
function TaskPanel({
  recordType, recordId, recordLabel, onClose,
}: {
  recordType: string; recordId: number; recordLabel?: string; onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [assignTo, setAssignTo] = useState<string>("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", recordType, recordId],
    queryFn: () => api(`/api/tasks/record/${recordType}/${recordId}`).then((r) => r.json()),
  });

  const { data: users = [] } = useQuery<TaskUser[]>({
    queryKey: ["users-list"],
    queryFn: () => api("/api/users").then((r) => r.json()),
  });

  const activeUsers = users.filter((u) => u.id !== user?.id);

  const createTask = useMutation({
    mutationFn: () =>
      api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType,
          recordId,
          recordLabel,
          assignedTo: Number(assignTo),
          note,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", recordType, recordId] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
      setNote("");
      setAssignTo("");
    },
  });

  const completeTask = useMutation({
    mutationFn: (id: number) => api(`/api/tasks/${id}/complete`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", recordType, recordId] }),
  });

  const reopenTask = useMutation({
    mutationFn: (id: number) => api(`/api/tasks/${id}/reopen`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", recordType, recordId] }),
  });

  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col bg-card border-l border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground capitalize">
                {recordType} Tasks
              </p>
              {recordLabel && <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{recordLabel}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 px-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-sm font-medium text-foreground">No tasks yet</p>
              <p className="text-xs text-muted-foreground">Assign a task below to request action from a teammate</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {/* Open tasks */}
              {openTasks.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Open</p>
                  {openTasks.map((t) => (
                    <TaskItem key={t.id} task={t} currentUserId={user?.id}
                      onComplete={() => completeTask.mutate(t.id)}
                      onReopen={() => reopenTask.mutate(t.id)}
                    />
                  ))}
                </div>
              )}
              {/* Done tasks */}
              {doneTasks.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Completed</p>
                  {doneTasks.map((t) => (
                    <TaskItem key={t.id} task={t} currentUserId={user?.id}
                      onComplete={() => completeTask.mutate(t.id)}
                      onReopen={() => reopenTask.mutate(t.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* New task form */}
        <div className="border-t border-border p-4 shrink-0 space-y-3 bg-secondary/10">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Assign a task
          </p>
          <Select value={assignTo} onValueChange={setAssignTo}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Who should action this?" />
            </SelectTrigger>
            <SelectContent>
              {activeUsers.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  <span className="flex items-center gap-2">
                    <span>{u.name}</span>
                    <span className="text-muted-foreground capitalize text-[10px]">({u.role})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="What needs to be done? e.g. Chase client for payment, Get TR8 from agent…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs resize-none h-20"
          />
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => createTask.mutate()}
            disabled={!assignTo || !note.trim() || createTask.isPending}
          >
            <Send className="w-3.5 h-3.5" />
            {createTask.isPending ? "Sending…" : "Send Task"}
          </Button>
        </div>
      </div>
    </>
  );
}

function TaskItem({ task, currentUserId, onComplete, onReopen }: {
  task: Task; currentUserId?: number;
  onComplete: () => void; onReopen: () => void;
}) {
  const done = task.status === "done";
  const isAssignedToMe = task.assignedTo.id === currentUserId;

  return (
    <div className={cn("px-4 py-3 hover:bg-secondary/10 transition-colors", done && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <button
          onClick={done ? onReopen : (isAssignedToMe ? onComplete : undefined)}
          className={cn(
            "mt-0.5 shrink-0 transition-colors",
            done ? "text-emerald-400 hover:text-muted-foreground" : isAssignedToMe ? "text-muted-foreground/40 hover:text-emerald-400" : "text-muted-foreground/20 cursor-default"
          )}
          title={done ? "Reopen task" : isAssignedToMe ? "Mark as done" : "Only the assignee can complete this"}
        >
          {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs text-foreground leading-snug", done && "line-through text-muted-foreground")}>{task.note}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground/60">
              {task.assignedBy.name} → <span className="text-primary/80">{task.assignedTo.name}</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{timeAgo(task.createdAt)}
            </span>
          </div>
          {done && task.completedAt && (
            <p className="text-[10px] text-emerald-400/70 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Done {timeAgo(task.completedAt)}
            </p>
          )}
        </div>
        {done && (
          <button onClick={onReopen} className="text-muted-foreground/30 hover:text-muted-foreground shrink-0" title="Reopen">
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
