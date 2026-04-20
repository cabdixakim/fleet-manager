import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Plus, BookOpen, Pencil, ChevronDown, ChevronRight, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const TYPES = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABEL: Record<string, string> = {
  asset: "Asset", liability: "Liability", equity: "Equity", revenue: "Revenue", expense: "Expense",
};
const TYPE_COLOR: Record<string, string> = {
  asset: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  liability: "text-red-400 bg-red-500/10 border-red-500/20",
  equity: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  revenue: "text-primary bg-primary/10 border-primary/20",
  expense: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};
const SUBTYPES: Record<string, { value: string; label: string }[]> = {
  asset: [
    { value: "current_asset", label: "Current Asset" },
    { value: "fixed_asset", label: "Fixed Asset" },
    { value: "other_asset", label: "Other Asset" },
  ],
  liability: [
    { value: "current_liability", label: "Current Liability" },
    { value: "long_term_liability", label: "Long-Term Liability" },
  ],
  equity: [{ value: "equity", label: "Equity" }],
  revenue: [
    { value: "operating", label: "Operating Revenue" },
    { value: "other_income", label: "Other Income" },
  ],
  expense: [
    { value: "cogs", label: "Cost of Revenue" },
    { value: "operating_expense", label: "Operating Expense" },
    { value: "other_expense", label: "Other Expense" },
  ],
};

const SUBTYPE_LABEL: Record<string, string> = {
  current_asset: "Current Asset", fixed_asset: "Fixed Asset", other_asset: "Other Asset",
  current_liability: "Current Liability", long_term_liability: "Long-Term Liability",
  equity: "Equity", operating: "Operating Revenue", other_income: "Other Income",
  cogs: "Cost of Revenue", operating_expense: "Operating Expense", other_expense: "Other Expense",
};

async function fetchAccounts() {
  const r = await fetch("/api/gl/accounts", { credentials: "include" });
  return r.json();
}

export default function ChartOfAccounts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editAccount, setEditAccount] = useState<any | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(TYPES));
  const [form, setForm] = useState({ code: "", name: "", type: "asset", subtype: "current_asset", description: "" });

  const { data: accounts = [], isLoading } = useQuery({ queryKey: ["/api/gl/accounts"], queryFn: fetchAccounts });

  const { mutateAsync: seedAccounts, isPending: seeding } = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/gl/seed", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/gl/accounts"] });
      toast({ title: `Chart of accounts loaded`, description: `${data.seeded} accounts added, ${data.skipped} already existed.` });
    },
  });

  const { mutateAsync: createAccount, isPending: creating } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/gl/accounts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gl/accounts"] }); setShowCreate(false); setForm({ code: "", name: "", type: "asset", subtype: "current_asset", description: "" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const { mutateAsync: updateAccount, isPending: updating } = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await fetch(`/api/gl/accounts/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gl/accounts"] }); setEditAccount(null); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const grouped = TYPES.reduce((acc, type) => {
    acc[type] = (accounts as any[]).filter((a: any) => a.type === type).sort((a: any, b: any) => a.code.localeCompare(b.code));
    return acc;
  }, {} as Record<string, any[]>);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const isEmpty = (accounts as any[]).length === 0;

  return (
    <Layout>
      <PageHeader
        title="Chart of Accounts"
        subtitle={`${(accounts as any[]).length} accounts`}
        actions={
          <>
            {isEmpty && (
              <Button variant="outline" size="sm" onClick={() => seedAccounts()} disabled={seeding}>
                {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Load Default Accounts
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Add Account</span>
            </Button>
          </>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-secondary/30 animate-pulse rounded-xl" />)}</div>
        ) : isEmpty ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/20 mb-4" />
            <p className="text-foreground font-semibold mb-1">No accounts yet</p>
            <Button onClick={() => seedAccounts()} disabled={seeding}>
              {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Load Default Chart of Accounts
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {TYPES.map((type) => {
              const typeAccounts = grouped[type] ?? [];
              const expanded = expandedTypes.has(type);
              if (typeAccounts.length === 0) return null;
              return (
                <div key={type} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleType(type)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", TYPE_COLOR[type])}>
                        {TYPE_LABEL[type]}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{TYPE_LABEL[type]} Accounts</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{typeAccounts.length} accounts</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Code</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Name</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Sub-type</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Description</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeAccounts.map((account: any) => (
                            <tr key={account.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground font-semibold">{account.code}</td>
                              <td className="px-4 py-2.5 font-medium text-foreground">{account.name}
                                {account.isSystem && <span className="ml-2 text-[10px] text-muted-foreground/50 font-normal">system</span>}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{SUBTYPE_LABEL[account.subtype] ?? account.subtype ?? "—"}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell truncate max-w-xs">{account.description ?? "—"}</td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => setEditAccount(account)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* Create Account */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Account Code *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 font-mono" placeholder="e.g. 1001" />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, subtype: SUBTYPES[v]?.[0]?.value ?? "" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Account Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="e.g. Cash at Bank" />
            </div>
            <div>
              <Label>Sub-type</Label>
              <Select value={form.subtype} onValueChange={(v) => setForm({ ...form, subtype: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{(SUBTYPES[form.type] ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createAccount(form)} disabled={creating || !form.code || !form.name}>
              {creating ? "Adding..." : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account */}
      <Dialog open={!!editAccount} onOpenChange={() => setEditAccount(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Account — {editAccount?.code}</DialogTitle></DialogHeader>
          {editAccount && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Account Name</Label>
                <Input value={editAccount.name} onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })} className="mt-1" disabled={editAccount.isSystem} />
                {editAccount.isSystem && <p className="text-xs text-muted-foreground mt-1">System account name cannot be changed.</p>}
              </div>
              <div>
                <Label>Sub-type</Label>
                <Select value={editAccount.subtype ?? ""} onValueChange={(v) => setEditAccount({ ...editAccount, subtype: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{(SUBTYPES[editAccount.type] ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={editAccount.description ?? ""} onChange={(e) => setEditAccount({ ...editAccount, description: e.target.value })} className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" checked={editAccount.active} onChange={(e) => setEditAccount({ ...editAccount, active: e.target.checked })} className="w-4 h-4" disabled={editAccount.isSystem} />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
            <Button onClick={() => updateAccount(editAccount)} disabled={updating}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
