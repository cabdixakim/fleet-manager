import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetClients, useCreateClient, useUpdateClient, useDeleteClient, useGetClient,
  useGetClientTransactions, useCreateClientTransaction,
  useGetBatches,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Download, Search, ChevronLeft, Building2, ArrowRight, Package, Pencil, Trash2, Lock, Unlock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Client = {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  agoShortChargeRate?: number;
  pmsShortChargeRate?: number;
  openingBalance?: number | string;
  obLocked?: boolean;
  balance?: number;
  status?: string;
};

const BATCH_STATUSES = ["all", "nominated", "loaded", "in_transit", "delivered", "invoiced"] as const;
const STATUS_LABELS: Record<string, string> = {
  all: "All", nominated: "Nominated", loaded: "Loaded",
  in_transit: "In Transit", delivered: "Delivered", invoiced: "Invoiced",
};

function ClientDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canAdjustOB = user?.role === "owner" || user?.role === "admin" || user?.role === "manager";

  const { data: client } = useGetClient(id);
  const { data: txData } = useGetClientTransactions(id);
  const transactions: any[] = Array.isArray(txData) ? txData : (txData as any)?.transactions ?? [];
  const { data: allBatches = [] } = useGetBatches({ clientId: id });
  const { mutateAsync: createTx, isPending } = useCreateClientTransaction();
  const { mutateAsync: updateClient, isPending: updating } = useUpdateClient();
  const { mutateAsync: deleteClient, isPending: deleting } = useDeleteClient();

  const [showTx, setShowTx] = useState(false);
  const [txForm, setTxForm] = useState({ type: "payment", amount: "", description: "", reference: "", batchId: "" });
  const [mainTab, setMainTab] = useState<"ledger" | "batches">("ledger");
  const [batchStatus, setBatchStatus] = useState("all");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [showAdjustOB, setShowAdjustOB] = useState(false);
  const [adjustOBForm, setAdjustOBForm] = useState({ newBalance: "", reason: "" });
  const [adjustingOB, setAdjustingOB] = useState(false);

  const obLocked = (client as any)?.obLocked ?? false;

  const openEdit = () => {
    if (!client) return;
    setEditForm({
      name: client.name,
      contactPerson: (client as any).contactPerson ?? "",
      email: (client as any).email ?? "",
      phone: (client as any).phone ?? "",
      address: (client as any).address ?? "",
      agoShortChargeRate: String((client as any).agoShortChargeRate ?? "0.50"),
      pmsShortChargeRate: String((client as any).pmsShortChargeRate ?? "0.80"),
      openingBalance: String((client as any).openingBalance ?? "0"),
    });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!editForm) return;
    await updateClient({
      id,
      data: {
        ...editForm,
        agoShortChargeRate: parseFloat(editForm.agoShortChargeRate),
        pmsShortChargeRate: parseFloat(editForm.pmsShortChargeRate),
        openingBalance: parseFloat(editForm.openingBalance),
      },
    });
    qc.invalidateQueries({ queryKey: [`/api/clients/${id}`] });
    qc.invalidateQueries({ queryKey: ["/api/clients"] });
    setShowEdit(false);
  };

  const handleDelete = async () => {
    await deleteClient({ id });
    qc.invalidateQueries({ queryKey: ["/api/clients"] });
    onBack();
  };

  const handleTx = async () => {
    await createTx({ id, data: {
      type: txForm.type as any,
      amount: parseFloat(txForm.amount),
      description: txForm.description,
      reference: txForm.reference,
      ...(txForm.batchId ? { batchId: parseInt(txForm.batchId) } : {}),
    } });
    qc.invalidateQueries({ queryKey: [`/api/clients/${id}/transactions`] });
    qc.invalidateQueries({ queryKey: [`/api/clients/${id}`] });
    setShowTx(false);
    setTxForm({ type: "payment", amount: "", description: "", reference: "", batchId: "" });
  };

  const handleAdjustOB = async () => {
    setAdjustingOB(true);
    try {
      const res = await fetch(`/api/clients/${id}/adjust-opening-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newBalance: parseFloat(adjustOBForm.newBalance), reason: adjustOBForm.reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to adjust opening balance");
        return;
      }
      qc.invalidateQueries({ queryKey: [`/api/clients/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      setShowAdjustOB(false);
      setAdjustOBForm({ newBalance: "", reason: "" });
    } finally {
      setAdjustingOB(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      transactions.map((t: any) => ({
        Date: formatDate(t.transactionDate),
        Type: t.type,
        Description: t.description ?? "",
        Amount: t.type === "payment" || t.type === "advance" ? -t.amount : t.amount,
        Reference: t.reference ?? "",
      })),
      `client-${client?.name}-ledger`
    );
  };

  if (!client) return null;

  const balance = (client as any).balance ?? 0;
  const openingBalance = parseFloat(String((client as any).openingBalance ?? "0"));
  const filteredBatches = batchStatus === "all"
    ? (allBatches as any[])
    : (allBatches as any[]).filter((b: any) => b.status === batchStatus);

  const statusColor: Record<string, string> = {
    nominated: "bg-blue-500/20 text-blue-400",
    loaded: "bg-yellow-500/20 text-yellow-400",
    in_transit: "bg-orange-500/20 text-orange-400",
    delivered: "bg-teal-500/20 text-teal-400",
    invoiced: "bg-purple-500/20 text-purple-400",
    completed: "bg-green-500/20 text-green-400",
  };

  return (
    <div>
      {/* Profile Header */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <div className="flex items-start gap-4">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            {/* Name + OB badge row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-foreground">{client.name}</h2>
              {obLocked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-default">
                      <Lock className="w-3 h-3" />OB Locked
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Opening balance is locked after period close. Admins and managers can adjust it.</TooltipContent>
                </Tooltip>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  <Unlock className="w-3 h-3" />OB Open
                </span>
              )}
            </div>
            {/* Contact row */}
            <p className="text-sm text-muted-foreground">
              {[(client as any).contactPerson, (client as any).email, (client as any).phone, (client as any).address].filter(Boolean).join(" · ") || "No contact info"}
            </p>
            {/* Rate chips */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {(client as any).agoShortChargeRate && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">AGO short: ${parseFloat((client as any).agoShortChargeRate).toFixed(2)}/MT</span>
              )}
              {(client as any).pmsShortChargeRate && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">PMS short: ${parseFloat((client as any).pmsShortChargeRate).toFixed(2)}/MT</span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">OB: {formatCurrency(openingBalance)}</span>
            </div>

            {/* Balance — mobile inline */}
            <div className="sm:hidden mt-3">
              <p className="text-2xl font-bold tabular-nums" style={{ color: balance >= 0 ? 'var(--destructive)' : '#4ade80' }}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-muted-foreground font-medium">{balance >= 0 ? "Total Receivable" : "Credit Balance"}</p>
            </div>
            <div className="sm:hidden flex flex-wrap gap-1.5 mt-3">
              <Button size="sm" onClick={() => setShowTx(true)}><Plus className="w-3.5 h-3.5 mr-1" />Record Tx</Button>
              <Link href={`/clients/${id}/statement`}>
                <Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1" />Statement</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /></Button>
              {obLocked && canAdjustOB && (
                <Button variant="outline" size="sm" onClick={() => { setAdjustOBForm({ newBalance: String(openingBalance), reason: "" }); setShowAdjustOB(true); }} className="text-amber-400 border-amber-500/40 hover:bg-amber-500/10">
                  <Lock className="w-3.5 h-3.5" />
                </Button>
              )}
              {(client as any).isActive !== false ? (
                <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-amber-500 border-amber-500/40 hover:bg-amber-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
              ) : (
                <Button variant="outline" size="sm" onClick={async () => { await fetch(`/api/clients/${id}/reactivate`, { method: "POST", credentials: "include" }); qc.invalidateQueries({ queryKey: [`/api/clients/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/clients"] }); }} className="text-green-500 border-green-500/40 hover:bg-green-500/10">Reactivate</Button>
              )}
            </div>
          </div>

          {/* Balance + actions right side — desktop */}
          <div className="hidden sm:flex flex-col items-end gap-3 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums" style={{ color: balance >= 0 ? 'var(--destructive)' : '#4ade80' }}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-muted-foreground font-medium">{balance >= 0 ? "Total Receivable" : "Credit Balance"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <Button size="sm" onClick={() => setShowTx(true)}><Plus className="w-3.5 h-3.5 mr-1" />Record Tx</Button>
              <Link href={`/clients/${id}/statement`}>
                <Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1" />Statement</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /></Button>
              {obLocked && canAdjustOB && (
                <Button variant="outline" size="sm" onClick={() => { setAdjustOBForm({ newBalance: String(openingBalance), reason: "" }); setShowAdjustOB(true); }} className="text-amber-400 border-amber-500/40 hover:bg-amber-500/10">
                  <Lock className="w-3.5 h-3.5" />
                </Button>
              )}
              {(client as any).isActive !== false ? (
                <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-amber-500 border-amber-500/40 hover:bg-amber-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
              ) : (
                <Button variant="outline" size="sm" onClick={async () => { await fetch(`/api/clients/${id}/reactivate`, { method: "POST", credentials: "include" }); qc.invalidateQueries({ queryKey: [`/api/clients/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/clients"] }); }} className="text-green-500 border-green-500/40 hover:bg-green-500/10">Reactivate</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-border">
        {(["ledger", "batches"] as const).map((tab) => (
          <button key={tab} onClick={() => setMainTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${mainTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "ledger" ? "Account Ledger" : `Batches (${(allBatches as any[]).length})`}
          </button>
        ))}
      </div>

      {mainTab === "ledger" && (
        <>
          {/* Mobile ledger cards */}
          <div className="sm:hidden space-y-2">
            {transactions.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 text-center text-muted-foreground text-sm">No transactions yet</div>
            ) : transactions.map((t: any) => {
              const isPayment = t.type === "payment" || t.type === "advance";
              const isInvoice = t.type === "invoice" && t.invoiceId;
              return (
                <div key={t.id}
                  className={`bg-card border border-border rounded-xl px-4 py-3 ${isInvoice ? "cursor-pointer active:opacity-70" : ""}`}
                  onClick={isInvoice ? () => navigate(`/invoices/${t.invoiceId}`) : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold capitalize ${isPayment ? "text-green-400" : isInvoice ? "text-primary" : "text-foreground"}`}>
                        {t.type.replace(/_/g, " ")}{isInvoice && " ↗"}
                      </span>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.transactionDate)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isPayment ? "text-green-400" : "text-foreground"}`}>
                        {isPayment ? `(${formatCurrency(t.amount)})` : formatCurrency(t.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">Bal: {formatCurrency(t.runningBalance ?? 0)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop ledger table */}
          <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50">
                {["Date", "Type", "Description", "Reference", "Amount", "Running Balance"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet</td></tr>
                ) : transactions.map((t: any) => {
                  const isPayment = t.type === "payment" || t.type === "advance";
                  const isInvoice = t.type === "invoice" && t.invoiceId;
                  return (
                  <tr key={t.id}
                    className={`border-b border-border/50 last:border-0 hover:bg-secondary/20 ${isInvoice ? "cursor-pointer" : ""}`}
                    onClick={isInvoice ? () => navigate(`/invoices/${t.invoiceId}`) : undefined}
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(t.transactionDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`capitalize text-xs font-medium ${isInvoice ? "text-primary" : ""}`}>
                        {t.type.replace(/_/g, " ")}{isInvoice && " ↗"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.description ?? "-"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{t.reference ?? "-"}</td>
                    <td className={`px-4 py-3 font-medium ${isPayment ? "text-green-400" : "text-foreground"}`}>
                      {isPayment ? `(${formatCurrency(t.amount)})` : formatCurrency(t.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrency(t.runningBalance ?? 0)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mainTab === "batches" && (
        <div>
          <div className="flex gap-1 flex-wrap mb-4">
            {BATCH_STATUSES.map((s) => {
              const cnt = s === "all" ? (allBatches as any[]).length : (allBatches as any[]).filter((b: any) => b.status === s).length;
              return (
                <button key={s} onClick={() => setBatchStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${batchStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {STATUS_LABELS[s]} ({cnt})
                </button>
              );
            })}
          </div>
          {filteredBatches.length === 0 ? (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No {batchStatus === "all" ? "" : STATUS_LABELS[batchStatus] + " "}batches for this client</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBatches.map((b: any) => (
                <div key={b.id} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{b.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[b.status] ?? "bg-secondary text-muted-foreground"}`}>{b.status?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {b.route && <span>{b.route}</span>}
                      {b.productType && <><span>·</span><span>{b.productType}</span></>}
                      {b.loadDate && <><span>·</span><span>Load: {formatDate(b.loadDate)}</span></>}
                      {b.estimatedDeliveryDate && <><span>·</span><span>ETA: {formatDate(b.estimatedDeliveryDate)}</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {b.grossRevenue && <p className="text-sm font-semibold text-foreground">{formatCurrency(b.grossRevenue)}</p>}
                    {b.totalLitres && <p className="text-xs text-muted-foreground">{b.totalLitres?.toLocaleString()} L</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Record Transaction Dialog */}
      <Dialog open={showTx} onOpenChange={setShowTx}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Client Transaction</DialogTitle>
            <DialogDescription>Add a payment, advance, or adjustment to this client's ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Type *</Label>
              <Select value={txForm.type} onValueChange={(v) => setTxForm({ ...txForm, type: v, batchId: "" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="payment">Payment Received</SelectItem>
                  <SelectItem value="advance">Advance Received</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {txForm.type === "advance" && (
              <div>
                <Label>Link to Batch <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={txForm.batchId || "none"} onValueChange={(v) => setTxForm({ ...txForm, batchId: v === "none" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No batch — general advance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No batch — general advance</SelectItem>
                    {(allBatches as any[]).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Batch-linked advances appear on the batch invoice and client statement together.</p>
              </div>
            )}
            <div><Label>Amount (USD) *</Label><Input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} className="mt-1" /></div>
            <div><Label>Description</Label><Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} className="mt-1" /></div>
            <div><Label>Reference</Label><Input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTx(false)}>Cancel</Button>
            <Button onClick={handleTx} disabled={isPending || !txForm.amount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client — {client.name}</DialogTitle>
            <DialogDescription>Update client details. Opening balance is {obLocked ? "locked — use Adjust OB to change it." : "editable until first period close."}</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div><Label>Company Name *</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Contact Person</Label><Input value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1" /></div>
                <div><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" /></div>
              </div>
              <div><Label>Address</Label><Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>AGO Short Charge ($/MT)</Label><Input type="number" value={editForm.agoShortChargeRate} onChange={(e) => setEditForm({ ...editForm, agoShortChargeRate: e.target.value })} className="mt-1" /></div>
                <div><Label>PMS Short Charge ($/MT)</Label><Input type="number" value={editForm.pmsShortChargeRate} onChange={(e) => setEditForm({ ...editForm, pmsShortChargeRate: e.target.value })} className="mt-1" /></div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  Opening Balance (USD)
                  {obLocked && <Lock className="w-3 h-3 text-amber-400" />}
                </Label>
                <Input
                  type="number"
                  value={editForm.openingBalance}
                  onChange={(e) => setEditForm({ ...editForm, openingBalance: e.target.value })}
                  disabled={obLocked}
                  className={`mt-1 ${obLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  placeholder="0.00"
                />
                {obLocked && (
                  <p className="text-xs text-amber-400/80 mt-1">Opening balance is locked. {canAdjustOB ? "Use the Adjust OB button to override." : "Contact an admin or manager to adjust."}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updating || !editForm?.name}>{updating ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Opening Balance Dialog (admin/manager + locked) */}
      <Dialog open={showAdjustOB} onOpenChange={setShowAdjustOB}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Opening Balance</DialogTitle>
            <DialogDescription>Override the locked opening balance for {client.name}. This action is audited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Current Opening Balance</Label>
              <p className="text-sm font-medium text-foreground mt-1">{formatCurrency(openingBalance)}</p>
            </div>
            <div>
              <Label>New Opening Balance (USD) *</Label>
              <Input type="number" value={adjustOBForm.newBalance} onChange={(e) => setAdjustOBForm({ ...adjustOBForm, newBalance: e.target.value })} className="mt-1" placeholder="0.00" />
            </div>
            <div>
              <Label>Reason for Adjustment *</Label>
              <Input value={adjustOBForm.reason} onChange={(e) => setAdjustOBForm({ ...adjustOBForm, reason: e.target.value })} className="mt-1" placeholder="e.g. Correcting migration error" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustOB(false)}>Cancel</Button>
            <Button onClick={handleAdjustOB} disabled={adjustingOB || !adjustOBForm.newBalance || !adjustOBForm.reason}>
              {adjustingOB ? "Adjusting..." : "Confirm Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Client</DialogTitle>
            <DialogDescription>This will hide this client from the active list. All data is preserved.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will hide <strong>{client.name}</strong> from the active clients list. All ledger data and history is preserved and the client can be reactivated at any time.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Keep Active</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deactivating..." : "Deactivate Client"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Clients() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", contactPerson: "", email: "", phone: "", address: "",
    agoShortChargeRate: "0.50", pmsShortChargeRate: "0.80",
    openingBalance: "0",
  });

  const { data: clients = [], isLoading } = useGetClients();
  const { mutateAsync: createClient, isPending } = useCreateClient();

  const filtered = (clients as Client[]).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    await createClient({
      data: {
        ...form,
        agoShortChargeRate: parseFloat(form.agoShortChargeRate),
        pmsShortChargeRate: parseFloat(form.pmsShortChargeRate),
        openingBalance: parseFloat(form.openingBalance),
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/clients"] });
    setShowCreate(false);
    setForm({ name: "", contactPerson: "", email: "", phone: "", address: "", agoShortChargeRate: "0.50", pmsShortChargeRate: "0.80", openingBalance: "0" });
  };

  const handleExport = () => {
    exportToExcel(
      filtered.map((c) => ({
        Name: c.name,
        "Contact Person": c.contactPerson ?? "",
        Email: c.email ?? "",
        Phone: c.phone ?? "",
        "Opening Balance": c.openingBalance ?? 0,
        "AGO Short Charge": c.agoShortChargeRate,
        "PMS Short Charge": c.pmsShortChargeRate,
        Balance: c.balance ?? 0,
      })),
      "clients"
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Clients"
        subtitle="Client accounts and running ledgers"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Client</Button>
          </>
        }
      />
      <PageContent>
        {selectedId ? (
          <ClientDetail id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm w-52" />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-16 text-muted-foreground">Loading clients...</div>
              ) : filtered.length === 0 ? (
                <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
                  <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground font-medium">No clients yet</p>
                  <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Client</Button>
                </div>
              ) : filtered.map((c) => {
                const balance = c.balance ?? 0;
                return (
                  <div key={c.id} onClick={() => setSelectedId(c.id)}
                    className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all group">
                    <div className="w-1 h-10 rounded-full bg-teal-500/40 group-hover:bg-teal-400 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{c.name}</span>
                        {c.obLocked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-default">
                                <Lock className="w-2.5 h-2.5" />OB Locked
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Opening balance locked</TooltipContent>
                          </Tooltip>
                        )}
                        {c.contactPerson && <span className="text-xs text-muted-foreground">· {c.contactPerson}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {c.email && <span>{c.email}</span>}
                        {c.phone && <><span>·</span><span>{c.phone}</span></>}
                        <span>·</span>
                        <span>OB: {formatCurrency(parseFloat(String(c.openingBalance ?? "0")))}</span>
                        <span>·</span>
                        <span>AGO {formatCurrency(c.agoShortChargeRate ?? 0)}/MT · PMS {formatCurrency(c.pmsShortChargeRate ?? 0)}/MT</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className={`text-base font-bold ${balance >= 0 ? "text-destructive" : "text-green-400"}`}>{formatCurrency(Math.abs(balance))}</span>
                        <p className="text-xs text-muted-foreground">{balance >= 0 ? "Receivable" : "Credit"}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PageContent>

      {/* Create Client Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Client</DialogTitle>
            <DialogDescription>Add a new client. Set the opening balance if this client has a pre-existing balance from before using this system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Company Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="e.g. Engen Zimbabwe" /></div>
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>AGO Short Charge ($/MT)</Label><Input type="number" value={form.agoShortChargeRate} onChange={(e) => setForm({ ...form, agoShortChargeRate: e.target.value })} className="mt-1" /></div>
              <div><Label>PMS Short Charge ($/MT)</Label><Input type="number" value={form.pmsShortChargeRate} onChange={(e) => setForm({ ...form, pmsShortChargeRate: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label>Opening Balance (USD)</Label>
              <Input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} className="mt-1" placeholder="0.00" />
              <p className="text-xs text-muted-foreground mt-1">Enter the client's pre-existing balance (positive = they owe you, negative = you owe them). This can be edited until the first accounting period is closed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending || !form.name}>{isPending ? "Creating..." : "Create Client"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
