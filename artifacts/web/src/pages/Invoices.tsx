import { useState } from "react";
import { useLocation } from "wouter";
import { useGetInvoices } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { Download, Search, FileText } from "lucide-react";
import { TaskTrigger } from "@/components/TaskPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const params: Record<string, string> = {};
  if (statusFilter !== "all") params.status = statusFilter;
  const { data: invoices = [], isLoading } = useGetInvoices(params);

  const filtered = invoices.filter((inv: Invoice) =>
    !search ||
    inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    inv.clientName?.toLowerCase().includes(search.toLowerCase())
  );

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
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
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
            {
              key: "tasks", label: "",
              render: (r) => (
                <div onClick={(e) => e.stopPropagation()}>
                  <TaskTrigger
                    recordType="invoice"
                    recordId={(r as Invoice).id}
                    recordLabel={`${(r as Invoice).invoiceNumber} — ${(r as Invoice).clientName}`}
                  />
                </div>
              ),
            },
          ]}
        />
      </PageContent>

    </Layout>
  );
}
