import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, Printer } from "lucide-react";

type Period = { id: number; name: string; startDate: string; endDate: string; isClosed: boolean };
type TxLine = {
  id: number;
  type: string;
  amount: number;
  reference: string | null;
  batchId: number | null;
  batchName: string | null;
  description: string | null;
  transactionDate: string;
  invoiceId: number | null;
};
type Statement = {
  client: { id: number; name: string; balance: number };
  periodName: string;
  periodId: number | null;
  transactions: TxLine[];
  summary: {
    totalInvoiced: number;
    totalAdvances: number;
    totalPayments: number;
    totalAdjustments: number;
    netBalance: number;
    openingBalance: number;
    closingBalance: number;
  };
};

const TX_LABELS: Record<string, { label: string; sign: 1 | -1; color: string }> = {
  invoice:     { label: "Invoice",      sign: 1,  color: "text-foreground" },
  advance:     { label: "Advance Rcvd", sign: -1, color: "text-green-400" },
  payment:     { label: "Payment Rcvd", sign: -1, color: "text-green-400" },
  adjustment:  { label: "Adjustment",   sign: 1,  color: "text-amber-400" },
};

function StatRow({ label, value, deduct, isSub, isTotal }: {
  label: string; value: number; deduct?: boolean; isSub?: boolean; isTotal?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between py-2.5",
      isTotal ? "border-t border-border pt-3 mt-1" : "border-b border-border/50",
      isSub && "pl-4"
    )}>
      <span className={cn("text-sm", isTotal ? "font-bold text-foreground" : isSub ? "text-muted-foreground" : "font-medium text-foreground")}>
        {label}
      </span>
      <span className={cn(
        "text-sm font-mono font-semibold tabular-nums",
        isTotal ? "text-base text-emerald-400" : deduct ? "text-green-400" : "text-foreground"
      )}>
        {deduct ? `− ${formatCurrency(value)}` : formatCurrency(value)}
      </span>
    </div>
  );
}

const C = (v: number) => formatCurrency(v);
const pRow = (label: string, value: string, deduct?: boolean, bold?: boolean, indent?: boolean, color?: string) => `
  <tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:5px ${indent ? "6px 5px 20px" : "6px"};font-size:11px;color:${bold ? "#111827" : indent ? "#6b7280" : "#374151"};font-weight:${bold ? "700" : "400"};">${label}</td>
    <td style="padding:5px 6px;text-align:right;font-size:11px;font-weight:${bold ? "700" : "600"};color:${color ?? (bold ? "#059669" : deduct ? "#059669" : "#111827")};">${deduct ? `− ${value}` : value}</td>
  </tr>`;

function ClientStatementPrintDoc({ statement, company }: { statement: Statement; company: any }) {
  const s = statement.summary;
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`;

  const totalDebit = s.totalInvoiced + (s.totalAdjustments > 0 ? s.totalAdjustments : 0);
  const totalCredit = s.totalAdvances + s.totalPayments + (s.totalAdjustments < 0 ? Math.abs(s.totalAdjustments) : 0);

  const html = `
<div style="font-family:Arial,sans-serif;color:#111827;background:#fff;width:100%;max-width:780px;margin:0 auto;">

  <!-- Header band -->
  <div style="background:#0f172a;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoHtml}
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${companyName}</div>
        ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="color:#94a3b8;font-size:10px;">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#f1f5f9;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Client Account Statement</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${statement.periodName}</div>
    </div>
  </div>

  <!-- Client info row -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:2px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Client</div>
      <div style="font-size:13px;font-weight:700;">${statement.client.name}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Total Invoiced</div>
      <div style="font-size:13px;font-weight:700;">${C(s.totalInvoiced)}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Transactions</div>
      <div style="font-size:13px;font-weight:700;">${statement.transactions.length}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Date Printed</div>
      <div style="font-size:12px;font-weight:600;">${datePrinted}</div>
    </div>
  </div>

  <!-- Summary: Account waterfall + Settlement -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px solid #e5e7eb;">
    <div style="padding:14px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">Account Summary</div>
      <table style="width:100%;border-collapse:collapse;">
        ${pRow("Total Invoiced", C(s.totalInvoiced))}
        ${s.totalAdjustments !== 0 ? pRow("Adjustments", C(Math.abs(s.totalAdjustments)), s.totalAdjustments > 0 ? false : true, false, true) : ""}
        ${pRow("Advances Received", C(s.totalAdvances), true, false, true)}
        ${pRow("Payments Received", C(s.totalPayments), true, false, true)}
        ${pRow("Net Balance (Receivable)", C(s.netBalance), false, true)}
      </table>
    </div>
    <div style="padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">Settlement Summary</div>
      <table style="width:100%;border-collapse:collapse;">
        ${pRow("Opening Balance B/F", C(s.openingBalance))}
        ${pRow("Net This Period", C(s.netBalance))}
        <tr style="border-top:2px solid #111827;">
          <td style="padding:7px 6px;font-size:12px;font-weight:700;color:#111827;">Closing Balance</td>
          <td style="padding:7px 6px;text-align:right;font-size:13px;font-weight:700;color:${s.closingBalance > 0 ? "#dc2626" : "#059669"};">
            ${C(Math.abs(s.closingBalance))} <span style="font-size:10px;font-weight:400;">${s.closingBalance > 0 ? "receivable" : "credit"}</span>
          </td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Transaction Detail Table -->
  <div style="padding:14px 16px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">
      Transaction Detail — ${statement.transactions.length} entr${statement.transactions.length !== 1 ? "ies" : "y"}
    </div>
    ${statement.transactions.length === 0 ? `<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No transactions for this period.</div>` : `
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Date</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Type</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Batch / Description</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Reference</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#374151;">Debit</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#059669;">Credit</th>
        </tr>
      </thead>
      <tbody>
        ${statement.transactions.map((tx, i) => {
          const meta = TX_LABELS[tx.type] ?? { label: tx.type, sign: 1, color: "" };
          const isDebit = meta.sign === 1;
          const desc = tx.batchName ?? tx.description ?? "—";
          return `
          <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #f3f4f6;">
            <td style="padding:4px 6px;color:#6b7280;white-space:nowrap;">${formatDate(tx.transactionDate)}</td>
            <td style="padding:4px 6px;font-weight:600;">${meta.label}</td>
            <td style="padding:4px 6px;color:#6b7280;">${desc}</td>
            <td style="padding:4px 6px;font-family:monospace;color:#6b7280;">${tx.reference ?? "—"}</td>
            <td style="padding:4px 6px;text-align:right;font-family:monospace;">${isDebit ? C(tx.amount) : "—"}</td>
            <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#059669;">${!isDebit ? C(tx.amount) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="background:#f3f4f6;border-top:2px solid #d1d5db;">
          <td colspan="4" style="padding:5px 6px;font-size:10px;font-weight:700;">TOTAL (${statement.transactions.length} entries)</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;">${C(totalDebit)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#059669;">${C(totalCredit)}</td>
        </tr>
      </tfoot>
    </table>`}
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:9px;color:#9ca3af;">Generated by ${companyName} · ${datePrinted}</span>
    <span style="font-size:9px;color:#9ca3af;">Confidential — For recipient use only</span>
  </div>
</div>`;

  return (
    <div
      id="client-statement-print"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ position: "fixed", left: "-9999px", top: 0, width: "100%", background: "#fff" }}
    />
  );
}

export default function ClientStatement() {
  const [, params] = useRoute("/clients/:id/statement");
  const [, navigate] = useLocation();
  const clientId = Number(params?.id);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("all");

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ["/api/periods"],
    queryFn: () => fetch("/api/periods", { credentials: "include" }).then((r) => r.json()),
  });

  const periodParam = selectedPeriodId !== "all" ? `?periodId=${selectedPeriodId}` : "";
  const { data: statement, isLoading } = useQuery<Statement>({
    queryKey: ["/api/clients", clientId, "period-statement", selectedPeriodId],
    queryFn: () =>
      fetch(`/api/clients/${clientId}/period-statement${periodParam}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId,
  });

  const { data: company } = useQuery({
    queryKey: ["/api/company-settings"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
  });

  const handlePrint = () => {
    const prev = document.title;
    document.title = `${statement?.client?.name ?? "Client"} — Account Statement — ${statement?.periodName ?? "All Time"}`;
    window.print();
    document.title = prev;
  };

  if (!clientId) return (
    <Layout>
      <PageContent>
        <div className="text-center py-16 text-muted-foreground">Invalid client link.</div>
      </PageContent>
    </Layout>
  );

  const { summary } = statement ?? {};

  return (
    <Layout>
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body * { visibility: hidden !important; }
          #client-statement-print, #client-statement-print * { visibility: visible !important; }
          #client-statement-print {
            display: block !important;
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            background: #fff !important;
          }
        }
      `}</style>

      <PageHeader
        title={statement?.client?.name ?? "Client Statement"}
        subtitle={`Account Statement — ${statement?.periodName ?? "All Time"}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {(periods as Period[]).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5" disabled={!statement}>
              <Printer className="w-3.5 h-3.5" />Print
            </Button>
            <Link href={`/clients`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />Back
              </Button>
            </Link>
          </div>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading statement...</div>
        ) : !statement ? (
          <div className="text-center py-16 text-muted-foreground">Failed to load statement.</div>
        ) : (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Transactions</p>
                <p className="text-2xl font-bold text-foreground">{statement.transactions.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Invoiced</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(summary!.totalInvoiced)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Opening Balance</p>
                <p className={cn("text-xl font-bold", summary!.openingBalance >= 0 ? "text-foreground" : "text-green-400")}>
                  {formatCurrency(Math.abs(summary!.openingBalance))}
                  <span className="text-xs font-normal ml-1">{summary!.openingBalance >= 0 ? "owed" : "credit"}</span>
                </p>
              </div>
              <div className={cn("rounded-xl p-4 border",
                summary!.closingBalance > 0 ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"
              )}>
                <p className="text-xs text-muted-foreground mb-1">Closing Balance</p>
                <p className={cn("text-xl font-bold", summary!.closingBalance > 0 ? "text-red-400" : "text-green-400")}>
                  {formatCurrency(Math.abs(summary!.closingBalance))}
                  <span className="text-xs font-normal ml-1">{summary!.closingBalance > 0 ? "receivable" : "credit"}</span>
                </p>
              </div>
            </div>

            {/* Waterfall + settlement */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Account Summary</p>
                <StatRow label="Total Invoiced" value={summary!.totalInvoiced} />
                {summary!.totalAdjustments !== 0 && (
                  <StatRow label="Adjustments" value={summary!.totalAdjustments} isSub />
                )}
                <StatRow label="Advances Received" value={summary!.totalAdvances} deduct isSub />
                <StatRow label="Payments Received" value={summary!.totalPayments} deduct isSub />
                <StatRow label="Net Balance (Receivable)" value={summary!.netBalance} isTotal />
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Settlement Summary</p>
                <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Opening Balance B/F</span>
                  <span className="text-sm font-mono font-semibold">{formatCurrency(summary!.openingBalance)}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Net This Period</span>
                  <span className="text-sm font-mono font-semibold">{formatCurrency(summary!.netBalance)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
                  <span className="text-sm font-bold text-foreground">Closing Balance</span>
                  <span className={cn(
                    "text-base font-bold font-mono",
                    summary!.closingBalance > 0 ? "text-red-400" : "text-green-400"
                  )}>
                    {formatCurrency(Math.abs(summary!.closingBalance))}
                    <span className="text-xs font-normal ml-1">{summary!.closingBalance > 0 ? "receivable" : "credit"}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Transaction Detail — {statement.transactions.length} entries
                </h3>
              </div>
              {statement.transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No transactions found for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Batch / Description</th>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Reference</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground">Debit</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {statement.transactions.map((tx) => {
                        const meta = TX_LABELS[tx.type] ?? { label: tx.type, sign: 1, color: "text-foreground" };
                        const isDebit = meta.sign === 1;
                        const isInvoice = tx.type === "invoice" && tx.invoiceId;
                        return (
                          <tr
                            key={tx.id}
                            className={cn("hover:bg-secondary/30 transition-colors", isInvoice && "cursor-pointer")}
                            onClick={isInvoice ? () => navigate(`/invoices/${tx.invoiceId}`) : undefined}
                          >
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(tx.transactionDate)}</td>
                            <td className="px-3 py-2.5">
                              <span className={cn("font-medium", meta.color)}>{meta.label}</span>
                              {isInvoice && <span className="ml-1.5 text-xs text-primary opacity-60">↗</span>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {tx.batchName ? (
                                <span className="font-medium text-foreground">{tx.batchName}</span>
                              ) : tx.description ? (
                                <span>{tx.description}</span>
                              ) : <span className="opacity-40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{tx.reference ?? <span className="opacity-40">—</span>}</td>
                            <td className="px-3 py-2.5 text-right font-mono">
                              {isDebit ? formatCurrency(tx.amount) : <span className="opacity-30">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-green-400">
                              {!isDebit ? formatCurrency(tx.amount) : <span className="opacity-30">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-secondary/50">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-xs font-bold text-foreground">
                          TOTAL ({statement.transactions.length} entries)
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold">
                          {formatCurrency(summary!.totalInvoiced + summary!.totalAdjustments)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-green-400">
                          {formatCurrency(summary!.totalAdvances + summary!.totalPayments)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </PageContent>

      {statement && <ClientStatementPrintDoc statement={statement} company={company} />}
    </Layout>
  );
}
