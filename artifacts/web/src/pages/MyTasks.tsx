import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, isPast, isToday, parseISO } from "date-fns";
import { CheckCircle2, Circle, Clock, AlertTriangle, CalendarDays, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

type TaskUser = { id: number; name: string; role: string };
type Task = {
  id: number;
  note: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  assignedBy: TaskUser;
  recordType: string | null;
  recordId: number | null;
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  normal: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  low: "bg-secondary text-muted-foreground border-border",
};

function priorityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function timeAgo(s: string) {
  try { return formatDistanceToNow(new Date(s), { addSuffix: true }); } catch { return ""; }
}

function dueBucket(dueDate: string | null): "overdue" | "today" | "upcoming" | "none" {
  if (!dueDate) return "none";
  const d = parseISO(dueDate);
  if (isToday(d)) return "today";
  if (isPast(d)) return "overdue";
  return "upcoming";
}

function TaskCard({ task, onComplete, onReopen }: { task: Task; onComplete: () => void; onReopen: () => void }) {
  const done = task.status === "done";
  const bucket = dueBucket(task.dueDate);

  return (
    <div className={cn("bg-card border border-border rounded-xl p-4 flex gap-3 hover:border-primary/30 transition-colors", done && "opacity-60")}>
      <button
        onClick={done ? onReopen : onComplete}
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          done ? "text-emerald-400 hover:text-muted-foreground" : "text-muted-foreground/40 hover:text-emerald-400"
        )}
        title={done ? "Reopen" : "Mark done"}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm text-foreground leading-snug", done && "line-through text-muted-foreground")}>
          {task.note}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 border", PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal)}>
            {priorityLabel(task.priority)}
          </Badge>
          {task.dueDate && (
            <span className={cn(
              "flex items-center gap-1 text-[11px]",
              bucket === "overdue" ? "text-red-500" : bucket === "today" ? "text-orange-400" : "text-muted-foreground"
            )}>
              {bucket === "overdue" && <AlertTriangle className="w-3 h-3" />}
              {bucket === "today" && <CalendarDays className="w-3 h-3" />}
              {bucket === "upcoming" && <Clock className="w-3 h-3" />}
              {bucket === "overdue" ? "Overdue · " : bucket === "today" ? "Due today · " : ""}{task.dueDate}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/60">
            From <span className="text-foreground/70">{task.assignedBy.name}</span> · {timeAgo(task.createdAt)}
          </span>
          {task.recordType && (
            <span className="text-[11px] text-primary/70 capitalize">{task.recordType} #{task.recordId}</span>
          )}
        </div>
        {done && task.completedAt && (
          <p className="text-[11px] text-emerald-400/70 mt-1">✓ Completed {timeAgo(task.completedAt)}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, tasks, icon: Icon, onComplete, onReopen }: {
  title: string; tasks: Task[]; icon: any;
  onComplete: (id: number) => void; onReopen: (id: number) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onComplete={() => onComplete(t.id)} onReopen={() => onReopen(t.id)} />
        ))}
      </div>
    </div>
  );
}

export default function MyTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showDone, setShowDone] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["my-tasks"],
    queryFn: () => api("/api/tasks/mine").then((r) => r.json()),
  });

  const completeTask = useMutation({
    mutationFn: (id: number) => api(`/api/tasks/${id}/complete`, { method: "PUT" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
      toast({ title: "Task marked done" });
    },
    onError: () => toast({ variant: "destructive", title: "Couldn't update task" }),
  });

  const reopenTask = useMutation({
    mutationFn: (id: number) => api(`/api/tasks/${id}/reopen`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-tasks"] }),
  });

  const openTasks = tasks.filter((t) => t.status === "open").sort((a, b) => {
    const ap = PRIORITY_ORDER[a.priority] ?? 2;
    const bp = PRIORITY_ORDER[b.priority] ?? 2;
    if (ap !== bp) return ap - bp;
    const bucketOrder = { overdue: 0, today: 1, upcoming: 2, none: 3 };
    return (bucketOrder[dueBucket(a.dueDate)] ?? 3) - (bucketOrder[dueBucket(b.dueDate)] ?? 3);
  });

  const doneTasks = tasks.filter((t) => t.status === "done");

  const overdue  = openTasks.filter((t) => dueBucket(t.dueDate) === "overdue");
  const today    = openTasks.filter((t) => dueBucket(t.dueDate) === "today");
  const upcoming = openTasks.filter((t) => dueBucket(t.dueDate) === "upcoming");
  const noDate   = openTasks.filter((t) => dueBucket(t.dueDate) === "none");

  return (
    <Layout>
      <PageHeader
        title="My Tasks"
        subtitle="All tasks assigned to you across the system"
        actions={
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {showDone ? "Hide completed" : `Show completed (${doneTasks.length})`}
          </button>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading your tasks…
          </div>
        ) : openTasks.length === 0 && doneTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <Inbox className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="text-sm text-muted-foreground">You have no tasks assigned to you right now.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {overdue.length > 0 && (
              <Section title="Overdue" tasks={overdue} icon={AlertTriangle}
                onComplete={(id) => completeTask.mutate(id)} onReopen={(id) => reopenTask.mutate(id)} />
            )}
            {today.length > 0 && (
              <Section title="Due Today" tasks={today} icon={CalendarDays}
                onComplete={(id) => completeTask.mutate(id)} onReopen={(id) => reopenTask.mutate(id)} />
            )}
            {upcoming.length > 0 && (
              <Section title="Upcoming" tasks={upcoming} icon={Clock}
                onComplete={(id) => completeTask.mutate(id)} onReopen={(id) => reopenTask.mutate(id)} />
            )}
            {noDate.length > 0 && (
              <Section title="No Due Date" tasks={noDate} icon={Inbox}
                onComplete={(id) => completeTask.mutate(id)} onReopen={(id) => reopenTask.mutate(id)} />
            )}
            {showDone && doneTasks.length > 0 && (
              <Section title="Completed" tasks={doneTasks} icon={CheckCircle2}
                onComplete={(id) => completeTask.mutate(id)} onReopen={(id) => reopenTask.mutate(id)} />
            )}
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
