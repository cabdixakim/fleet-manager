import { useState } from "react";
import { useLocation } from "wouter";
import { useGetInvoices, useCreateInvoice, useUpdateInvoice, useGetClients, useGetBatches } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Search, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Invoice = {
  id: number;
  invoiceNumber: string;
  clientId: number;
  clientName?: string;
  batchId?: number;
  batchName?: string;
  grossRevenue: number;
  netRevenue: number;
  status: string;
  issuedDate?: string;
  dueDate?: string;
  notes?: string | null;
};

const STATUS_FILTERS = ["all", "draft", "sent", "paid", "overdue", "cancelled"];

export default function Invoices() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ invoiceNumber: "", clientId: "", batchId: "", totalAmount: "", dueDate: "", notes: "" });
  const [confirmDelete, setConfirmDelete] = useState<Invoice | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;
  const { data: invoices = [], isLoading } = useGetInvoices(params);
  const { data: clients = [] } = useGetClients();
  const { data: batches = [] } = useGetBatches();
  const { mutateAsync: createInvoice, isPending: creating } = useCreateInvoice();
  const { mutateAsync: updateInvoice, isPending: updating } = useUpdateInvoice();

  const filtered = invoices.filter((inv: Invoice) =>
    !search ||
    inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    inv.clientName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    await createInvoice({
      data: {
        invoiceNumber: form.invoiceNumber,
        clientId: parseInt(form.clientId),
        batchId: form.batchId ? parseInt(form.batchId) : undefined,
        totalAmount: parseFloat(form.totalAmount),
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    setShowCreate(false);
    setForm({ invoiceNumber: "", clientId: "", batchId: "", totalAmount: "", dueDate: "", notes: "" });
  };

  const handleStatusChange = async (id: number, status: string) => {
    await updateInvoice({ id, data: { status: status as any } });
    qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    if (selectedInvoice) setSelectedInvoice({ ...selectedInvoice, status });
  };

  const handleDeleteInvoice = async () => {
    if (!confirmDelete) return;
    await fetch(`/api/invoices/${confirmDelete.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    setConfirmDelete(null);
    setSelectedInvoice(null);
  };

  const handleExport = () => {
    exportToExcel(
      filtered.map((inv: Invoice) => ({
        "Invoice #": inv.invoiceNumber,
        Client: inv.clientName,
        Batch: inv.batchName ?? "",
        Amount: inv.grossRevenue,
        Status: inv.status,
        "Issue Date": inv.issueDate ? formatDate(inv.issueDate) : "",
        "Due Date": inv.dueDate ? formatDate(inv.dueDate) : "",
      })),
      "invoices"
    );
  };

  const totals = {
    draft: filtered.filter((i: Invoice) => i.status === "draft").reduce((s: number, i: Invoice) => s + (i.grossRevenue ?? 0), 0),
    sent: filtered.filter((i: Invoice) => i.status === "sent").reduce((s: number, i: Invoice) => s + (i.grossRevenue ?? 0), 0),
    paid: filtered.filter((i: Invoice) => i.status === "paid").reduce((s: number, i: Invoice) => s + (i.grossRevenue ?? 0), 0),
    overdue: filtered.filter((i: Invoice) => i.status === "overdue").reduce((s: number, i: Invoice) => s + (i.grossRevenue ?? 0), 0),
  };

  return (
    <Layout>
      <PageHeader
        title="Invoices"
        subtitle="Client invoice management and payment tracking"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Invoice</Button>
          </>
        }
      />
      <PageContent>
        {/* Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Draft", value: totals.draft, color: "text-muted-foreground" },
            { label: "Sent / Awaiting", value: totals.sent, color: "text-primary" },
            { label: "Paid", value: totals.paid, color: "text-success" },
            { label: "Overdue", value: totals.overdue, color: "text-destructive" },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.color}`}>{formatCurrency(item.value)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          loading={isLoading}
          data={filtered as Record<string, unknown>[]}
          onRowClick={(row) => navigate(`/invoices/${(row as Invoice).id}`)}
          emptyMessage="No invoices yet."
          columns={[
            {
              key: "invoiceNumber", label: "Invoice #",
              render: (r) => (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono font-medium text-foreground">{(r as Invoice).invoiceNumber}</span>
                </div>
              ),
            },
            { key: "clientName", label: "Client", render: (r) => <span className="text-muted-foreground">{(r as Invoice).clientName}</span> },
            { key: "batchName", label: "Batch", render: (r) => <span className="text-xs text-muted-foreground">{(r as Invoice).batchName ?? "-"}</span> },
            { key: "grossRevenue", label: "Amount", render: (r) => <span className="font-semibold">{formatCurrency((r as Invoice).grossRevenue)}</span> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={(r as Invoice).status} /> },
            { key: "dueDate", label: "Due Date", render: (r) => <span className="text-xs text-muted-foreground">{(r as Invoice).dueDate ? formatDate((r as Invoice).dueDate!) : "-"}</span> },
          ]}
        />
      </PageContent>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Invoice Number *</Label><Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className="mt-1" placeholder="INV-2026-001" /></div>
            <div><Label>Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Batch (optional)</Label>
              <Select value={form.batchId || "none"} onValueChange={(v) => setForm({ ...form, batchId: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Link to batch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No batch</SelectItem>
                  {batches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Total Amount (USD) *</Label><Input type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} className="mt-1" /></div>
            <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1" /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.invoiceNumber || !form.clientId || !form.totalAmount}>
              {creating ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{selectedInvoice?.invoiceNumber}</DialogTitle></DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 py-2">
              {[
                ["Client", selectedInvoice.clientName],
                ["Batch", selectedInvoice.batchName ?? "-"],
                ["Amount", formatCurrency(selectedInvoice.grossRevenue)],
                ["Due Date", selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : "-"],
                ["Notes", selectedInvoice.notes ?? "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              <div><Label className="text-xs">Update Status</Label>
                <Select value={selectedInvoice.status} onValueChange={(v) => handleStatusChange(selectedInvoice.id, v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => { setConfirmDelete(selectedInvoice); }} className="text-destructive border-destructive/40 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
            </Button>
            <Button onClick={() => setSelectedInvoice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Invoice</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to delete invoice <strong>{confirmDelete?.invoiceNumber}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteInvoice}>Delete Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
