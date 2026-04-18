import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { format, startOfYear, endOfDay } from "date-fns";
import { Download, TrendingUp, TrendingDown, Scale, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab = "pl" | "balance" | "trial";

async function fetchPL(from: string, to: string) {
  const r = await fetch(`/api/gl/reports/pl?from=${from}&to=${to}`, { credentials: "include" });
  return r.json();
}
async function fetchBalanceSheet(asOf: string) {
  const r = await fetch(`/api/gl/reports/balance-sheet?asOf=${asOf}`, { credentials: "include" });
  return r.json();
}
async function fetchTrialBalance(from: string, to: string) {
  const r = await fetch(`/api/gl/reports/trial-balance?from=${from}&to=${to}`, { credentials: "include" });
  return r.json();
}

function SectionRow({ label, amount, bold, indent, positive, negative }: { label: string; amount?: number; bold?: boolean; indent?: boolean; positive?: boolean; negative?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-2", bold && "bg-secondary/20", indent && "pl-8")}>
      <span className={cn("text-sm", bold ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
      {amount !== undefined && (
        <span className={cn("text-sm font-mono", bold ? "font-bold" : "font-medium", positive && amount >= 0 ? "text-emerald-400" : "", negative && amount < 0 ? "text-red-400" : "", bold ? "text-foreground" : "text-muted-foreground")}>
          {amount < 0 ? `(${formatCurrency(Math.abs(amount))})` : formatCurrency(amount)}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/60 mx-4" />;
}

export default function FinancialStatements() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>("pl");
  const [from, setFrom] = useState(format(startOfYear(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(now, "yyyy-MM-dd"));

  const { data: pl, isLoading: plLoading } = useQuery({ queryKey: ["/api/gl/reports/pl", from, to], queryFn: () => fetchPL(from, to) });
  const { data: bs, isLoading: bsLoading } = useQuery({ queryKey: ["/api/gl/reports/balance-sheet", to], queryFn: () => fetchBalanceSheet(to) });
  const { data: tb, isLoading: tbLoading } = useQuery({ queryKey: ["/api/gl/reports/trial-balance", from, to], queryFn: () => fetchTrialBalance(from, to) });

  const TABS = [
    { key: "pl", label: "P&L Statement", icon: TrendingUp },
    { key: "balance", label: "Balance Sheet", icon: Scale },
    { key: "trial", label: "Trial Balance", icon: FileText },
  ] as const;

  const handleExport = () => {
    if (tab === "pl" && pl) {
      const rows = [
        { Section: "Revenue", Account: "", Amount: "" },
        ...(pl.revenueRows ?? []).map((r: any) => ({ Section: "Revenue", Account: `${r.code} ${r.name}`, Amount: r.amount })),
        { Section: "Total Revenue", Account: "", Amount: pl.totalRevenue },
        { Section: "Cost of Revenue", Account: "", Amount: "" },
        ...(pl.cogsRows ?? []).map((r: any) => ({ Section: "COGS", Account: `${r.code} ${r.name}`, Amount: r.amount })),
        { Section: "Gross Profit", Account: "", Amount: pl.grossProfit },
        { Section: "Operating Expenses", Account: "", Amount: "" },
        ...(pl.opexRows ?? []).map((r: any) => ({ Section: "OpEx", Account: `${r.code} ${r.name}`, Amount: r.amount })),
        { Section: "Net Income", Account: "", Amount: pl.netIncome },
      ];
      exportToExcel(rows, `pl-statement-${from}-${to}`);
    } else if (tab === "trial" && tb) {
      exportToExcel(
        (tb.rows ?? []).map((r: any) => ({ Code: r.code, Account: r.name, Type: r.type, Debit: r.totalDebit, Credit: r.totalCredit, Balance: r.balance })),
        `trial-balance-${from}-${to}`
      );
    } else if (tab === "balance" && bs) {
      const rows = [
        ...(bs.assetRows ?? []).map((r: any) => ({ Section: "Assets", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Total Assets", Account: "", Balance: bs.totalAssets },
        ...(bs.liabilityRows ?? []).map((r: any) => ({ Section: "Liabilities", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Total Liabilities", Account: "", Balance: bs.totalLiabilities },
        ...(bs.equityRows ?? []).map((r: any) => ({ Section: "Equity", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Current Period Earnings", Account: "", Balance: bs.currentPeriodEarnings },
        { Section: "Total Equity", Account: "", Balance: bs.totalEquity },
        { Section: "Total Liabilities + Equity", Account: "", Balance: bs.totalLiabilities + bs.totalEquity },
      ];
      exportToExcel(rows, `balance-sheet-${to}`);
    }
  };

  const noData = (tab === "pl" && !plLoading && !pl?.totalRevenue && !pl?.totalCogs) ||
    (tab === "trial" && !tbLoading && (!tb?.rows || tb.rows.length === 0)) ||
    (tab === "balance" && !bsLoading && !bs?.totalAssets);

  return (
    <Layout>
      <PageHeader
        title="Financial Statements"
        subtitle="P&L, Balance Sheet, and Trial Balance from your General Ledger"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export</span></Button>
        }
      />
      <PageContent>
        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-xl mb-5 w-fit">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Date controls */}
        <div className="flex flex-wrap gap-3 mb-5">
          {tab !== "balance" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-36" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">{tab === "balance" ? "As of" : "To"}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
        </div>

        {noData ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-semibold mb-1">No data for this period</p>
            <p className="text-sm text-muted-foreground">Raise invoices, record expenses, or run payroll to start building your General Ledger.</p>
          </div>
        ) : (
          <>
            {/* P&L Statement */}
            {tab === "pl" && pl && (
              <div className="bg-card border border-border rounded-xl overflow-hidden max-w-2xl">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-foreground">Profit & Loss Statement</h3>
                  <p className="text-xs text-muted-foreground">{format(new Date(from), "d MMM yyyy")} — {format(new Date(to), "d MMM yyyy")}</p>
                </div>

                <div className="py-1">
                  <div className="px-4 py-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Revenue</span></div>
                  {(pl.revenueRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.amount} indent />)}
                  <SectionRow label="Total Revenue" amount={pl.totalRevenue} bold positive />
                  <Divider />
                  <div className="px-4 py-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Cost of Revenue</span></div>
                  {(pl.cogsRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.amount} indent />)}
                  {pl.cogsRows?.length > 0 && <SectionRow label="Total Cost of Revenue" amount={pl.totalCogs} bold />}
                  <Divider />
                  <SectionRow label="Gross Profit" amount={pl.grossProfit} bold positive />
                  <Divider />
                  {pl.opexRows?.length > 0 && (
                    <>
                      <div className="px-4 py-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Operating Expenses</span></div>
                      {(pl.opexRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.amount} indent />)}
                      <SectionRow label="Total Operating Expenses" amount={pl.totalOpex} bold />
                      <Divider />
                    </>
                  )}
                  <SectionRow label="Net Income" amount={pl.netIncome} bold positive={pl.netIncome >= 0} negative={pl.netIncome < 0} />
                </div>
              </div>
            )}

            {/* Balance Sheet */}
            {tab === "balance" && bs && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="font-semibold text-foreground">Assets</h3>
                    <p className="text-xs text-muted-foreground">As of {format(new Date(to), "d MMM yyyy")}</p>
                  </div>
                  <div className="py-1">
                    {(bs.assetRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.balance} indent />)}
                    <Divider />
                    <SectionRow label="Total Assets" amount={bs.totalAssets} bold positive />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="font-semibold text-foreground">Liabilities & Equity</h3>
                    <p className="text-xs text-muted-foreground">As of {format(new Date(to), "d MMM yyyy")}</p>
                  </div>
                  <div className="py-1">
                    <div className="px-4 py-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Liabilities</span></div>
                    {(bs.liabilityRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.balance} indent />)}
                    <SectionRow label="Total Liabilities" amount={bs.totalLiabilities} bold />
                    <Divider />
                    <div className="px-4 py-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Equity</span></div>
                    {(bs.equityRows ?? []).map((r: any) => <SectionRow key={r.code} label={`${r.code} — ${r.name}`} amount={r.balance} indent />)}
                    <SectionRow label="Current Period Earnings" amount={bs.currentPeriodEarnings} indent positive={bs.currentPeriodEarnings >= 0} negative={bs.currentPeriodEarnings < 0} />
                    <SectionRow label="Total Equity" amount={bs.totalEquity} bold positive={bs.totalEquity >= 0} />
                    <Divider />
                    <SectionRow label="Total Liabilities + Equity" amount={bs.totalLiabilities + bs.totalEquity} bold positive />
                  </div>
                </div>
              </div>
            )}

            {/* Trial Balance */}
            {tab === "trial" && tb && (
              <div className="bg-card border border-border rounded-xl overflow-hidden max-w-3xl">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-foreground">Trial Balance</h3>
                  <p className="text-xs text-muted-foreground">{format(new Date(from), "d MMM yyyy")} — {format(new Date(to), "d MMM yyyy")}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/30 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Code</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Account</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Type</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Debit</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tb.rows ?? []).map((r: any) => (
                      <tr key={r.code} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.code}</td>
                        <td className="px-4 py-2 text-foreground">{r.name}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell capitalize">{r.type}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-emerald-400">{r.totalDebit > 0 ? formatCurrency(r.totalDebit) : ""}</td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-amber-400">{r.totalCredit > 0 ? formatCurrency(r.totalCredit) : ""}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-secondary/30">
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-foreground text-right">Totals</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(tb.grandTotalDebit)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">{formatCurrency(tb.grandTotalCredit)}</td>
                    </tr>
                    {Math.abs(tb.grandTotalDebit - tb.grandTotalCredit) < 0.01 && tb.grandTotalDebit > 0 && (
                      <tr className="bg-emerald-500/5">
                        <td colSpan={5} className="px-4 py-2 text-xs text-emerald-400 text-center font-medium">✓ Ledger is balanced</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PageContent>
    </Layout>
  );
}
