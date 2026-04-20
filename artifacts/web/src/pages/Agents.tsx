import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAgents, useCreateAgent, useUpdateAgent,
  useGetAgentTransactions, useCreateAgentTransaction, useDeleteAgentTransaction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2, Loader2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/apiError";
import { useClosedPeriodConfirm } from "@/hooks/useClosedPeriodConfirm";

const TXN_TYPE_LABEL: Record<string, string> = {
  fee_earned: "Fee Earned",
  payment: "Payment",
  adjustment: "Adjustment",
};

const TXN_TYPE_COLOR: Record<string, string> = {
  fee_earned: "bg-blue-500/15 text-blue-400",
  payment: "bg-green-500/15 text-green-400",
  adjustment: "bg-amber-500/15 text-amber-400",
};

function AgentLedger({ agentId }: { agentId: number }) {
  const { toast } = useToast();
  const { data: txns = [], isLoading } = useGetAgentTransactions(agentId);
  const { mutateAsync: createTxn, isPending: creating } = useCreateAgentTransaction(agentId);
  const { mutateAsync: deleteTxn } = useDeleteAgentTransaction();
  const handleDeleteTxn = async (txnId: number) => {
    try {
      await deleteTxn({ txnId, agentId });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't delete transaction", description: getErrorMessage(e, "Failed to delete transaction") });
    }
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "payment", amount: "", description: "", transactionDate: new Date().toISOString().slice(0, 10) });
  const { confirm: confirmClosedPeriod, dialog: closedPeriodDialog } = useClosedPeriodConfirm();

  const handleSubmit = async () => {
    if (!form.amount) return;
    if (!(await confirmClosedPeriod(form.transactionDate))) return;
    let result: any;
    try {
      result = await createTxn({ ...form, amount: parseFloat(form.amount) });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't save transaction", description: getErrorMessage(e, "Failed to save transaction") });
      return;
    }
    if (result?.posting?.bumped) {
      toast({
        title: `Posted to ${result.posting.date}`,
        description: `${result.posting.closedPeriodName} is closed — original date ${result.posting.originalDate} preserved in description.`,
      });
    }
    setForm({ type: "payment", amount: "", description: "", transactionDate: new Date().toISOString().slice(0, 10) });
    setShowForm(false);
  };

  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground">Loading ledger…</div>;

  return (
    <div className="border-t border-border mt-3 pt-3">
      {closedPeriodDialog}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ledger</span>
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" /> Record
        </Button>
      </div>

      {showForm && (
        <div className="bg-secondary/40 rounded-lg p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="fee_earned">Fee Earned</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount (USD)</Label>
              <Input className="h-8 text-xs" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input className="h-8 text-xs" type="date" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input className="h-8 text-xs" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={creating}>
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}

      {txns.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 py-2">No transactions yet.</p>
      ) : (
        <div className="space-y-1">
          {txns.map((txn: any) => (
            <div key={txn.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/30 group">
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0", TXN_TYPE_COLOR[txn.type] ?? "bg-secondary text-secondary-foreground")}>
                {TXN_TYPE_LABEL[txn.type] ?? txn.type}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">{txn.description || txn.batchName || "—"}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(txn.transactionDate)}</span>
              <span className={cn("text-xs font-semibold shrink-0", txn.type === "payment" ? "text-green-400" : "text-foreground")}>
                {txn.type === "payment" ? "-" : "+"}{formatCurrency(Math.abs(parseFloat(txn.amount)))}
              </span>
              <span className="text-xs text-muted-foreground/60 shrink-0">{formatCurrency(txn.runningBalance)}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                onClick={() => handleDeleteTxn(txn.id)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrokerCard({ agent }: { agent: any }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: agent.name, contactEmail: agent.contactEmail ?? "", contactPhone: agent.contactPhone ?? "", notes: agent.notes ?? "" });
  const { mutateAsync: updateAgent, isPending: updating } = useUpdateAgent(agent.id);

  const handleUpdate = async () => {
    await updateAgent(editForm);
    setEditOpen(false);
  };

  const balanceColor = agent.balance > 0 ? "text-amber-400" : agent.balance < 0 ? "text-green-400" : "text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <UserCheck className="w-4 h-4 text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground">{agent.name}</div>
          <div className="text-xs text-muted-foreground">{agent.contactEmail || agent.contactPhone || "No contact info"}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={cn("text-sm font-semibold", balanceColor)}>{formatCurrency(agent.balance)}</div>
          <div className="text-[10px] text-muted-foreground">{agent.balance >= 0 ? "balance due" : "credit"}</div>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
          onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          {agent.notes && <p className="text-xs text-muted-foreground mb-2">{agent.notes}</p>}
          <AgentLedger agentId={agent.id} />
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Broker</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={editForm.contactEmail} onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={editForm.contactPhone} onChange={(e) => setEditForm((f) => ({ ...f, contactPhone: e.target.value }))} /></div>
            <div><Label>Notes</Label><Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updating}>{updating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Agents() {
  const { data: agents = [], isLoading } = useGetAgents();
  const { mutateAsync: createAgent, isPending: creating } = useCreateAgent();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contactEmail: "", contactPhone: "", notes: "" });

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await createAgent(form);
    setForm({ name: "", contactEmail: "", contactPhone: "", notes: "" });
    setAddOpen(false);
  };

  const totalBalance = agents.reduce((sum: number, a: any) => sum + (a.balance ?? 0), 0);

  return (
    <Layout>
      <PageHeader
        title="Brokers"
        subtitle="Business introducers and commission tracking"
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Broker
          </Button>
        }
      />
      <PageContent>
        {agents.length > 0 && (
          <div className="mb-4 p-3 bg-secondary/30 rounded-lg flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{agents.length} broker{agents.length !== 1 ? "s" : ""} · Total outstanding</span>
            <span className={cn("text-sm font-semibold", totalBalance > 0 ? "text-amber-400" : "text-green-400")}>
              {formatCurrency(totalBalance)}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserCheck className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No brokers yet</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add First Broker
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {agents.map((agent: any) => (
              <BrokerCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </PageContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Broker</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Broker name" /></div>
            <div><Label>Email</Label><Input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="agent@example.com" /></div>
            <div><Label>Phone</Label><Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="+263…" /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.name.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Broker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
