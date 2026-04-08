import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, TruckIcon, Printer } from "lucide-react";
import { getRouteLabel } from "@/lib/routes";

type Period = { id: number; name: string; startDate: string; endDate: string; isClosed: boolean };
type TripLine = {
  tripId: number; tripNumber: string; truckPlate: string; batchName: string; route: string;
  status: string; createdAt: string;
  gross: number; commission: number; shortCharge: number; chargeableShort: number; shortQty: number;
  tripExpenses: number; driverSalary: number; netPayable: number;
};
type OtherExpenseLine = { id: number; truckPlate: string; costType: string; description: string | null; amount: number; currency: string; expenseDate: string };
type Statement = {
  subcontractor: { id: number; name: string; commissionRate: number; openingBalance: string; contactEmail?: string };
  periodName: string; periodId: number | null;
  trips: TripLine[];
  transactions: { id: number; type: string; amount: number; description: string; transactionDate: string }[];
  otherExpenses: OtherExpenseLine[];
  summary: {
    gross: number; commission: number; shortCharges: number; tripExpenses: number;
    driverSalaries: number; otherExpenses: number; netPayable: number; openingBalance: number; totalPaid: number; closingBalance: number;
  };
};


const TX_LABEL: Record<string, string> = {
  net_payable: "Net Payable",
  advance_given: "Advance Given",
  payment_made: "Payment Made",
  driver_salary: "Driver Salary",
  adjustment: "Adjustment",
};

function WaterfallRow({ label, value, deduct, isSub, isTotal }: { label: string; value: number; deduct?: boolean; isSub?: boolean; isTotal?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between py-2.5",
      isTotal ? "border-t border-border pt-3 mt-1" : "border-b border-border/50",
      isSub && "pl-4"
    )}>
      <span className={cn("text-sm", isTotal ? "font-bold text-foreground" : isSub ? "text-muted-foreground" : "font-medium text-foreground")}>{label}</span>
      <span className={cn(
        "text-sm font-mono font-semibold tabular-nums",
        isTotal ? "text-base text-emerald-400" : deduct ? "text-red-400" : "text-foreground"
      )}>
        {deduct ? `− ${formatCurrency(value)}` : formatCurrency(value)}
      </span>
    </div>
  );
}

const C = (v: number) => formatCurrency(v);
const pRow = (label: string, value: string, deduct?: boolean, bold?: boolean, indent?: boolean) => `
  <tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:5px ${indent ? "6px 5px 20px" : "6px"};font-size:11px;color:${bold ? "#111827" : indent ? "#6b7280" : "#374151"};font-weight:${bold ? "700" : "400"};">${label}</td>
    <td style="padding:5px 6px;text-align:right;font-size:11px;font-weight:${bold ? "700" : "600"};color:${bold ? "#059669" : deduct ? "#dc2626" : "#111827"};">${deduct ? `− ${value}` : value}</td>
  </tr>`;

function SubStatementPrintDoc({ statement, company, periodLabel }: { statement: Statement; company: any; periodLabel: string }) {
  const s = statement.summary;
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`;

  const txDebit = statement.transactions
    .filter((t) => !["payment_made", "advance_given", "driver_salary"].includes(t.type))
    .reduce((acc, t) => acc + t.amount, 0);
  const txCredit = statement.transactions
    .filter((t) => ["payment_made", "advance_given", "driver_salary"].includes(t.type))
    .reduce((acc, t) => acc + t.amount, 0);

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
      <div style="color:#f1f5f9;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Subcontractor Settlement</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${periodLabel}</div>
    </div>
  </div>

  <!-- Sub info row -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:2px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Subcontractor</div>
      <div style="font-size:13px;font-weight:700;">${statement.subcontractor.name}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Commission Rate</div>
      <div style="font-size:13px;font-weight:700;">${statement.subcontractor.commissionRate}%</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Delivered Trips</div>
      <div style="font-size:13px;font-weight:700;">${statement.trips.length}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Date Printed</div>
      <div style="font-size:12px;font-weight:600;">${datePrinted}</div>
    </div>
  </div>

  <!-- Summary: Waterfall + Settlement side by side -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px solid #e5e7eb;">
    <div style="padding:14px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">Deduction Waterfall</div>
      <table style="width:100%;border-collapse:collapse;">
        ${pRow("Gross Revenue (Loaded × Rate)", C(s.gross))}
        ${pRow("Commission ("+statement.subcontractor.commissionRate+"%)", C(s.commission), true, false, true)}
        ${pRow("Short Charges", C(s.shortCharges), true, false, true)}
        ${pRow("Trip Expenses", C(s.tripExpenses), true, false, true)}
        ${pRow("Driver Salaries", C(s.driverSalaries), true, false, true)}
        ${(s.otherExpenses ?? 0) > 0 ? pRow("Other Expenses", C(s.otherExpenses ?? 0), true, false, true) : ""}
        ${pRow("Net Payable to Subcontractor", C(s.netPayable), false, true)}
      </table>
    </div>
    <div style="padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">Settlement Summary</div>
      <table style="width:100%;border-collapse:collapse;">
        ${pRow("Opening Balance B/F", C(s.openingBalance))}
        ${pRow("Net Earned This Period", C(s.netPayable))}
        ${pRow("Payments Made to Sub", C(s.totalPaid), true, false, true)}
        <tr style="border-top:2px solid #111827;">
          <td style="padding:7px 6px;font-size:12px;font-weight:700;color:#111827;">Closing Balance</td>
          <td style="padding:7px 6px;text-align:right;font-size:13px;font-weight:700;color:${s.closingBalance >= 0 ? "#d97706" : "#059669"};">
            ${C(Math.abs(s.closingBalance))} <span style="font-size:10px;font-weight:400;">${s.closingBalance >= 0 ? "payable" : "credit"}</span>
          </td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Trip Breakdown Table -->
  <div style="padding:14px 16px 8px;border-bottom:2px solid #e5e7eb;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">
      Trip Breakdown — ${statement.trips.length} delivered trip${statement.trips.length !== 1 ? "s" : ""}
    </div>
    ${statement.trips.length === 0 ? `<div style="font-size:12px;color:#9ca3af;padding:8px 0;">No delivered trips for this period.</div>` : `
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Trip</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Truck</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Route</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#374151;">Gross</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#dc2626;">Comm.</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#dc2626;">Short</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#dc2626;">Expns.</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#dc2626;">Salary</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#059669;">Net</th>
        </tr>
      </thead>
      <tbody>
        ${statement.trips.map((t, i) => `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #f3f4f6;">
          <td style="padding:4px 6px;font-family:monospace;">${t.tripNumber ?? `#${t.tripId}`}</td>
          <td style="padding:4px 6px;font-family:monospace;color:#6b7280;">${t.truckPlate}</td>
          <td style="padding:4px 6px;color:#6b7280;white-space:nowrap;">${getRouteLabel(t.route ?? "")}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;">${C(t.gross)}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#dc2626;">${t.commission > 0 ? `−${C(t.commission)}` : "—"}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#dc2626;">${t.shortCharge > 0 ? `−${C(t.shortCharge)}` : "—"}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#dc2626;">${t.tripExpenses > 0 ? `−${C(t.tripExpenses)}` : "—"}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#dc2626;">${t.driverSalary > 0 ? `−${C(t.driverSalary)}` : "—"}</td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;font-weight:700;color:#059669;">${C(t.netPayable)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr style="background:#f3f4f6;border-top:2px solid #d1d5db;">
          <td colspan="3" style="padding:5px 6px;font-size:10px;font-weight:700;">TOTAL (${statement.trips.length} trips)</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;">${C(s.gross)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#dc2626;">−${C(s.commission)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#dc2626;">−${C(s.shortCharges)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#dc2626;">−${C(s.tripExpenses)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#dc2626;">−${C(s.driverSalaries)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#059669;">${C(s.netPayable)}</td>
        </tr>
      </tfoot>
    </table>`}
  </div>

  <!-- Ledger Transactions -->
  ${statement.transactions.length > 0 ? `
  <div style="padding:14px 16px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:0.08em;">
      Ledger Transactions (${statement.transactions.length})
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Date</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Type</th>
          <th style="padding:5px 6px;text-align:left;font-weight:600;color:#6b7280;">Description</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#374151;">Debit</th>
          <th style="padding:5px 6px;text-align:right;font-weight:600;color:#059669;">Credit</th>
        </tr>
      </thead>
      <tbody>
        ${statement.transactions.map((tx, i) => {
          const isCredit = ["payment_made", "advance_given", "driver_salary"].includes(tx.type);
          return `
          <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #f3f4f6;">
            <td style="padding:4px 6px;color:#6b7280;white-space:nowrap;">${formatDate(tx.transactionDate)}</td>
            <td style="padding:4px 6px;font-weight:600;">${TX_LABEL[tx.type] ?? tx.type}</td>
            <td style="padding:4px 6px;color:#6b7280;">${tx.description ?? "—"}</td>
            <td style="padding:4px 6px;text-align:right;font-family:monospace;">${!isCredit ? C(tx.amount) : "—"}</td>
            <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#059669;">${isCredit ? C(tx.amount) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="background:#f3f4f6;border-top:2px solid #d1d5db;">
          <td colspan="3" style="padding:5px 6px;font-size:10px;font-weight:700;">TOTAL</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;">${C(txDebit)}</td>
          <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700;color:#059669;">${C(txCredit)}</td>
        </tr>
      </tfoot>
    </table>
  </div>` : ""}

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:9px;color:#9ca3af;">Generated by ${companyName} · ${datePrinted}</span>
    <span style="font-size:9px;color:#9ca3af;">Confidential — For recipient use only</span>
  </div>
</div>`;

  return (
    <div
      id="sub-statement-print"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ position: "fixed", left: "-9999px", top: 0, width: "100%", background: "#fff" }}
    />
  );
}

export default function SubcontractorStatement() {
  const [, params] = useRoute("/subcontractors/:id/statement");
  const subId = Number(params?.id);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"statement" | "expenses">("statement");

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ["/api/periods"],
    queryFn: () => fetch("/api/periods", { credentials: "include" }).then((r) => r.json()),
  });

  const periodParam = selectedPeriodId !== "all" ? `?periodId=${selectedPeriodId}` : "";
  const { data: statement, isLoading } = useQuery<Statement>({
    queryKey: ["/api/subcontractors", subId, "period-statement", selectedPeriodId],
    queryFn: () =>
      fetch(`/api/subcontractors/${subId}/period-statement${periodParam}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!subId,
  });

  const { data: company } = useQuery({
    queryKey: ["/api/company-settings"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
  });

  const selectedPeriod = selectedPeriodId !== "all"
    ? (periods as Period[]).find((p) => String(p.id) === selectedPeriodId)
    : null;
  const periodLabel = selectedPeriod
    ? `${formatDate(selectedPeriod.startDate)} – ${formatDate(selectedPeriod.endDate)}`
    : "All Time";

  const handlePrint = () => {
    const prev = document.title;
    document.title = `${statement?.subcontractor?.name ?? "Sub"} — Settlement Statement — ${periodLabel}`;
    window.print();
    document.title = prev;
  };

  if (!subId) return (
    <Layout>
      <PageContent>
        <div className="text-center py-16 text-muted-foreground">Invalid subcontractor link.</div>
      </PageContent>
    </Layout>
  );

  return (
    <Layout>
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body * { visibility: hidden !important; }
          #sub-statement-print, #sub-statement-print * { visibility: visible !important; }
          #sub-statement-print {
            display: block !important;
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            background: #fff !important;
          }
        }
      `}</style>

      <PageHeader
        title={statement?.subcontractor?.name ?? "Subcontractor Statement"}
        subtitle={`Settlement Statement — ${periodLabel}`}
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
            <Link href="/subcontractors">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />Back
              </Button>
            </Link>
          </div>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Calculating statement, please wait...</div>
        ) : !statement ? (
          <div className="text-center py-16 text-muted-foreground">Failed to load statement.</div>
        ) : (
          <div className="space-y-6 max-w-5xl">
            {/* Tabs */}
            <div className="flex border-b border-border gap-1">
              {(["statement", "expenses"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "statement" ? "Statement" : `Other Expenses${statement.otherExpenses?.length ? ` (${statement.otherExpenses.length})` : ""}`}
                </button>
              ))}
            </div>

            {activeTab === "expenses" && (
              <div className="space-y-4">
                {!statement.otherExpenses?.length ? (
                  <div className="bg-card border border-border rounded-xl py-12 text-center text-muted-foreground text-sm">No non-trip expenses recorded for this period.</div>
                ) : (() => {
                  const byTruck = statement.otherExpenses.reduce<Record<string, typeof statement.otherExpenses>>((acc, e) => {
                    const k = e.truckPlate || "Unknown";
                    if (!acc[k]) acc[k] = [];
                    acc[k].push(e);
                    return acc;
                  }, {});
                  return (
                    <>
                      {Object.entries(byTruck).map(([plate, rows]) => {
                        const truckTotal = rows.reduce((s, e) => s + e.amount, 0);
                        return (
                          <div key={plate} className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                              <span className="text-sm font-semibold font-mono text-foreground">{plate}</span>
                              <span className="text-sm font-mono font-semibold text-red-400">{formatCurrency(truckTotal)}</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                                    <th className="px-4 py-2.5 text-left">Date</th>
                                    <th className="px-4 py-2.5 text-left">Category</th>
                                    <th className="px-4 py-2.5 text-left">Description</th>
                                    <th className="px-4 py-2.5 text-right">Amount</th>
                                    <th className="px-4 py-2.5 text-center">Currency</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {rows.map((e) => (
                                    <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                                      <td className="px-4 py-2.5 text-xs"><span className="capitalize bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{e.costType}</span></td>
                                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.description ?? "—"}</td>
                                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-400">{formatCurrency(e.amount)}</td>
                                      <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{e.currency}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                      <div className="bg-muted/10 border border-border rounded-xl px-5 py-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Grand Total — Other Expenses</span>
                        <span className="text-sm font-mono font-semibold text-red-400">{formatCurrency(statement.summary.otherExpenses ?? 0)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            {activeTab === "statement" && (
            <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Commission Rate</p>
                <p className="text-2xl font-bold text-foreground">{statement.subcontractor.commissionRate}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Delivered Trips</p>
                <p className="text-2xl font-bold text-foreground">{statement.trips.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Opening Balance</p>
                <p className={cn("text-xl font-bold", statement.summary.openingBalance >= 0 ? "text-foreground" : "text-red-400")}>
                  {formatCurrency(Math.abs(statement.summary.openingBalance))}
                  <span className="text-xs font-normal ml-1">{statement.summary.openingBalance < 0 ? "owed" : "b/f"}</span>
                </p>
              </div>
              <div className={cn("rounded-xl p-4 border", statement.summary.closingBalance >= 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-green-500/10 border-green-500/20")}>
                <p className="text-xs text-muted-foreground mb-1">Closing Balance</p>
                <p className={cn("text-xl font-bold", statement.summary.closingBalance >= 0 ? "text-amber-400" : "text-green-400")}>
                  {formatCurrency(Math.abs(statement.summary.closingBalance))}
                  <span className="text-xs font-normal ml-1">{statement.summary.closingBalance >= 0 ? "payable" : "credit"}</span>
                </p>
              </div>
            </div>

            {/* Waterfall + Settlement */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Deduction Waterfall</p>
                <WaterfallRow label="Freight Revenue (Loaded × Rate)" value={statement.summary.gross} />
                <WaterfallRow label="Commission" value={statement.summary.commission} deduct isSub />
                <WaterfallRow label="Short Charges" value={statement.summary.shortCharges} deduct isSub />
                <WaterfallRow label="Trip Expenses" value={statement.summary.tripExpenses} deduct isSub />
                <WaterfallRow label="Driver Salaries" value={statement.summary.driverSalaries} deduct isSub />
                {(statement.summary.otherExpenses ?? 0) > 0 && (
                  <WaterfallRow label="Other Expenses" value={statement.summary.otherExpenses ?? 0} deduct isSub />
                )}
                <WaterfallRow label="Net Payable to Subcontractor" value={statement.summary.netPayable} isTotal />
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-4">Settlement Summary</p>
                <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Opening Balance B/F</span>
                  <span className="text-sm font-mono font-semibold">{formatCurrency(statement.summary.openingBalance)}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Net Earned This Period</span>
                  <span className="text-sm font-mono font-semibold">{formatCurrency(statement.summary.netPayable)}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <span className="text-sm text-red-400">Payments Made to Sub</span>
                  <span className="text-sm font-mono font-semibold text-red-400">− {formatCurrency(statement.summary.totalPaid)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
                  <span className="text-sm font-bold text-foreground">Closing Balance</span>
                  <span className={cn("text-base font-bold font-mono", statement.summary.closingBalance >= 0 ? "text-amber-400" : "text-green-400")}>
                    {formatCurrency(statement.summary.closingBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Trip-by-Trip Detail */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Trip Breakdown — {statement.trips.length} delivered trips</h3>
              </div>
              {statement.trips.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <TruckIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No delivered trips found for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Trip #</th>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Truck</th>
                        <th className="px-3 py-3 text-left font-medium text-muted-foreground">Route</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground">Freight Rev.</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground text-red-400">Comm.</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground text-red-400">Short</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground text-red-400">Expns.</th>
                        <th className="px-3 py-3 text-right font-medium text-muted-foreground text-red-400">Salary</th>
                        <th className="px-3 py-3 text-right font-medium text-emerald-400">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {statement.trips.map((t) => (
                        <tr key={t.tripId} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2.5">
                            <Link href={`/trips/${t.tripId}`}>
                              <span className="font-mono text-primary hover:underline cursor-pointer">{t.tripNumber ?? `#${t.tripId}`}</span>
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">{t.truckPlate}</td>
                          <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{getRouteLabel(t.route ?? "")}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(t.gross)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400">{t.commission > 0 ? `−${formatCurrency(t.commission)}` : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400">{t.shortCharge > 0 ? `−${formatCurrency(t.shortCharge)}` : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400">{t.tripExpenses > 0 ? `−${formatCurrency(t.tripExpenses)}` : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400">{t.driverSalary > 0 ? `−${formatCurrency(t.driverSalary)}` : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(t.netPayable)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-secondary/50">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-xs font-bold text-foreground">TOTAL ({statement.trips.length} trips)</td>
                        <td className="px-3 py-3 text-right font-mono font-bold">{formatCurrency(statement.summary.gross)}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-red-400">−{formatCurrency(statement.summary.commission)}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-red-400">−{formatCurrency(statement.summary.shortCharges)}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-red-400">−{formatCurrency(statement.summary.tripExpenses)}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-red-400">−{formatCurrency(statement.summary.driverSalaries)}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(statement.summary.netPayable)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Transactions in period */}
            {statement.transactions.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Ledger Transactions ({statement.transactions.length})</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {statement.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.transactionDate)} · <span className="capitalize">{TX_LABEL[tx.type] ?? tx.type.replace(/_/g, " ")}</span></p>
                      </div>
                      <span className={cn(
                        "text-sm font-mono font-semibold tabular-nums",
                        tx.type === "payment_made" ? "text-red-400" : tx.type === "driver_salary" ? "text-red-400" : "text-foreground"
                      )}>
                        {["payment_made", "driver_salary", "advance_given"].includes(tx.type) ? `− ${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            )}
          </div>
        )}

      </PageContent>

      {statement && <SubStatementPrintDoc statement={statement} company={company} periodLabel={periodLabel} />}
    </Layout>
  );
}
