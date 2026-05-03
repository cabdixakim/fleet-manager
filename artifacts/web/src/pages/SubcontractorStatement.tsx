import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, TruckIcon, Printer } from "lucide-react";
import { getRouteLabel } from "@/lib/routes";
import { useAuth } from "@/contexts/AuthContext";

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
  net_payable:   "Net Payable",
  advance_given: "Advance Given",
  payment_made:  "Payment Made",
  driver_salary: "Driver Salary",
  adjustment:    "Adjustment",
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

function generateSubStatementHtml(statement: Statement, company: any, periodLabel: string, userName?: string): string {
  const s = statement.summary;
  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const now = new Date();
  const datePrinted = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  const C = (v: number) => `$${Math.abs(v).toFixed(2)}`;

  type Entry = { date: string; remark: string; mode: string; cashIn: number; cashOut: number };
  const rawEntries: Entry[] = [
    ...statement.trips.map((t) => ({
      date: t.createdAt,
      remark: `${t.truckPlate} — ${t.batchName}`,
      mode: "Trip",
      cashIn: t.netPayable,
      cashOut: 0,
    })),
    ...statement.transactions
      .filter((tx) => ["payment_made", "advance_given", "driver_salary"].includes(tx.type))
      .map((tx) => ({
        date: tx.transactionDate,
        remark: (TX_LABEL[tx.type] ?? tx.type) + (tx.description ? ` — ${tx.description}` : ""),
        mode: "Cash",
        cashIn: 0,
        cashOut: tx.amount,
      })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalIn = rawEntries.reduce((acc, e) => acc + e.cashIn, 0);
  const totalOut = rawEntries.reduce((acc, e) => acc + e.cashOut, 0);
  let balance = s.openingBalance;

  const rows = rawEntries.map((e, i) => {
    balance += e.cashIn - e.cashOut;
    const balLabel = balance < 0 ? `${C(Math.abs(balance))} cr` : C(balance);
    return `<tr style="border-bottom:1px solid #f0f0f0;background:${i % 2 === 0 ? "#fff" : "#fafafa"};">
      <td style="padding:5px 10px;white-space:nowrap;color:#444;">${formatDate(e.date)}</td>
      <td style="padding:5px 10px;">${e.remark}</td>
      <td style="padding:5px 10px;color:#666;">${e.mode}</td>
      <td style="padding:5px 10px;text-align:right;">${e.cashIn > 0 ? C(e.cashIn) : ""}</td>
      <td style="padding:5px 10px;text-align:right;">${e.cashOut > 0 ? C(e.cashOut) : ""}</td>
      <td style="padding:5px 10px;text-align:right;font-weight:600;">${balLabel}</td>
    </tr>`;
  }).join("");

  const finalBal = s.closingBalance;
  const finalStr = finalBal >= 0 ? `${C(finalBal)} payable` : `${C(Math.abs(finalBal))} credit`;

  const html = `<div style="font-family:Arial,sans-serif;color:#111;background:#fff;width:100%;max-width:780px;margin:0 auto;font-size:12px;">
  <div style="text-align:center;padding:20px 16px 14px;border-bottom:2px solid #111;">
    <div style="font-size:22px;font-weight:700;">${companyName}</div>
    ${companyAddress ? `<div style="font-size:10px;color:#666;margin-top:2px;">${companyAddress}${companyPhone ? ` &nbsp;·&nbsp; ${companyPhone}` : ""}</div>` : ""}
    <div style="font-size:12px;color:#444;margin-top:6px;font-weight:600;">Subcontractor Settlement Statement</div>
    <div style="font-size:10px;color:#888;margin-top:3px;">Generated On - ${datePrinted}, ${timeStr}${userName ? `. Generated by - ${userName}` : ""}</div>
  </div>
  <div style="padding:14px 16px 4px;">
    <div style="font-size:17px;font-weight:700;">${statement.subcontractor.name}</div>
    <div style="font-size:11px;color:#555;margin-top:3px;">&nbsp;Duration: ${periodLabel} &nbsp;·&nbsp; Commission Rate: ${statement.subcontractor.commissionRate}%</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ddd;margin:10px 16px 4px;border-radius:3px;overflow:hidden;">
    <div style="padding:12px 16px;text-align:center;border-right:1px solid #ddd;">
      <div style="font-size:10px;text-transform:uppercase;color:#888;margin-bottom:5px;">Total Earned</div>
      <div style="font-size:18px;font-weight:700;">${C(totalIn)}</div>
    </div>
    <div style="padding:12px 16px;text-align:center;border-right:1px solid #ddd;">
      <div style="font-size:10px;text-transform:uppercase;color:#888;margin-bottom:5px;">Total Paid</div>
      <div style="font-size:18px;font-weight:700;">${C(totalOut)}</div>
    </div>
    <div style="padding:12px 16px;text-align:center;">
      <div style="font-size:10px;text-transform:uppercase;color:#888;margin-bottom:5px;">Final Balance</div>
      <div style="font-size:18px;font-weight:700;">${C(Math.abs(finalBal))}</div>
    </div>
  </div>
  <div style="padding:4px 16px 8px;font-size:11px;color:#555;">${statement.trips.length} trip(s) · ${statement.transactions.filter((tx) => ["payment_made","advance_given","driver_salary"].includes(tx.type)).length} payment(s)</div>
  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;background:#f9f9f9;">
        <th style="padding:7px 10px;text-align:left;font-weight:600;white-space:nowrap;">Date</th>
        <th style="padding:7px 10px;text-align:left;font-weight:600;">Remark</th>
        <th style="padding:7px 10px;text-align:left;font-weight:600;white-space:nowrap;">Mode</th>
        <th style="padding:7px 10px;text-align:right;font-weight:600;white-space:nowrap;">Earned</th>
        <th style="padding:7px 10px;text-align:right;font-weight:600;white-space:nowrap;">Paid</th>
        <th style="padding:7px 10px;text-align:right;font-weight:600;white-space:nowrap;">Balance</th>
      </tr>
    </thead>
    <tbody>${rawEntries.length ? rows : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#888;">No entries for this period.</td></tr>`}</tbody>
    <tfoot>
      <tr style="border-top:2px solid #111;background:#f9f9f9;">
        <td colspan="5" style="padding:7px 10px;font-weight:700;">Final Balance</td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;">${finalStr}</td>
      </tr>
    </tfoot>
  </table>
  <div style="padding:12px 16px;text-align:center;font-size:10px;color:#888;border-top:1px solid #ddd;margin-top:8px;">Generated by ${companyName}.</div>
</div>`;

  return html;
}

export default function SubcontractorStatement() {
  const [, params] = useRoute("/subcontractors/:id/statement");
  const subId = params?.id;
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"statement" | "expenses">("statement");
  const { user } = useAuth();

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ["/api/periods"],
    queryFn: () => fetch("/api/periods", { credentials: "include" }).then((r) => r.json()),
  });

  const periodParam = selectedPeriodId !== "all" ? `?periodId=${selectedPeriodId}` : "";
  const { data: statement, isLoading } = useQuery<Statement>({
    queryKey: [`/api/subcontractors/${subId}/period-statement`, selectedPeriodId],
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
    if (!statement) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const html = generateSubStatementHtml(statement, company, periodLabel, (user as any)?.name ?? (user as any)?.email);
    const title = `${statement.subcontractor.name} — Settlement Statement`;
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>*{box-sizing:border-box;}body{margin:0;padding:0;background:#fff;}@media print{@page{size:A4;margin:8mm;}}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 350);
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
          <div className="space-y-6 max-w-5xl mx-auto">
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

    </Layout>
  );
}
