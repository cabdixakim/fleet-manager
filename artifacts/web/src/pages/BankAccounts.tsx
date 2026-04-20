import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Building2, Plus, Pencil, Trash2, ArrowRight, GitBranch } from "lucide-react";

const API = "/api/bank-accounts";

async function fetchBankAccounts() {
  const res = await fetch(API, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch bank accounts");
  return res.json();
}

export default function BankAccounts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: accounts = [], isLoading } = useQuery<any[]>({
    queryKey: [API],
    queryFn: fetchBankAccounts,
  });

  const emptyForm = { name: "", bankName: "", accountNumber: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { mutateAsync: saveAccount, isPending: saving } = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const url = editId ? `${API}/${editId}` : API;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
      setShowDialog(false);
      setForm(emptyForm);
      setEditId(null);
      toast({ title: editId ? "Bank account updated" : "Bank account added" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const { mutateAsync: deleteAccount } = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [API] });
      setDeleteId(null);
      toast({ title: "Bank account deactivated" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const openEdit = (a: any) => {
    setEditId(a.id);
    setForm({ name: a.name, bankName: a.bankName ?? "", accountNumber: a.accountNumber ?? "" });
    setShowDialog(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const totalBalance = (accounts as any[]).filter(a => a.isActive).reduce((s: number, a: any) => s + (a.glBalance ?? 0), 0);

  return (
    <Layout>
      <PageHeader
        title="Bank Accounts"
        subtitle="Bank accounts and balances"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Add Bank Account
          </Button>
        }
      />
      <PageContent>
        {/* Summary */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex flex-col min-w-[180px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Balance</span>
            <span className="text-2xl font-bold mt-1 text-emerald-400">{formatCurrency(totalBalance)}</span>
            </div>
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex flex-col min-w-[160px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Active Banks</span>
            <span className="text-2xl font-bold mt-1">{(accounts as any[]).filter(a => a.isActive).length}</span>
          </div>
        </div>

        {/* Bank Accounts List */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading...</div>
        ) : (accounts as any[]).filter(a => a.isActive).length === 0 ? (
          <div className="text-center text-muted-foreground py-20 flex flex-col items-center gap-3">
            <Building2 className="w-10 h-10 opacity-30" />
            <p className="font-medium">No bank accounts added yet</p>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Bank Account</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(accounts as any[]).filter(a => a.isActive).map((a: any) => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-border/80 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{a.name}</p>
                      {a.bankName && <p className="text-xs text-muted-foreground">{a.bankName}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!a.isDefault && (
                      <button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
                    <p className={`text-xl font-bold ${a.glBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(a.glBalance ?? 0)}
                    </p>
                    {a.accountNumber && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{a.accountNumber}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs h-8 gap-1"
                    onClick={() => navigate(`/bank-accounts/${a.id}/reconcile`)}
                  >
                    <GitBranch className="w-3 h-3" />
                    Reconcile
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>

                {a.isDefault && (
                  <p className="text-[10px] text-amber-400/80 bg-amber-400/10 rounded px-2 py-1">
                    Default — all untagged bank transactions are posted here
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </PageContent>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) { setForm(emptyForm); setEditId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Account Label *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Raw Bank — Operations Account"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Bank Name</Label>
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                placeholder="e.g. Raw Bank, Salam Bank, Access Bank"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Account Number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                placeholder="e.g. 1234567890"
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveAccount(form)} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : editId ? "Save Changes" : "Add Bank Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Deactivate Bank Account?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Existing transactions are preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteAccount(deleteId)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
