import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import {
  format, startOfYear, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  subYears, subMonths,
} from "date-fns";
import {
  Download, TrendingUp, TrendingDown, Scale, FileText, Users,
  Building2, Waves, BarChart3, Printer, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────
type TabKey = "pl" | "balance" | "trial" | "ar" | "ap" | "cashflow" | "expenses";
type Preset = "this-month" | "last-month" | "this-quarter" | "ytd" | "last-year" | "custom";

// ─── Number helpers ──────────────────────────────────────────────────────────
const money = (n: number | undefined) =>
  n === undefined ? "—" : (n < 0 ? `(${formatCurrency(Math.abs(n))})` : formatCurrency(n));

const pct = (n: number | undefined) =>
  n === undefined ? "" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// ─── Period helpers ──────────────────────────────────────────────────────────
const fmt = (d: Date) => format(d, "yyyy-MM-dd");

function computePeriod(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "this-month": return { from: fmt(startOfMonth(now)), to: fmt(now) };
    case "last-month": {
      const lm = subMonths(now, 1);
      return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)) };
    }
    case "this-quarter": return { from: fmt(startOfQuarter(now)), to: fmt(now) };
    case "ytd": return { from: fmt(startOfYear(now)), to: fmt(now) };
    case "last-year": {
      const ly = subYears(now, 1);
      return { from: fmt(startOfYear(ly)), to: `${ly.getFullYear()}-12-31` };
    }
    default: return { from: customFrom, to: customTo };
  }
}

function fmtDisplayDate(s: string) {
  if (!s) return "";
  try { return format(new Date(s), "d MMM yyyy"); } catch { return s; }
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────
const api = (path: string) => fetch(path, { credentials: "include" }).then((r) => r.json());

// ─── Shared UI primitives ───────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 pt-4 pb-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{children}</span>
      </td>
    </tr>
  );
}

function TotalRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn("border-t border-border bg-secondary/20 font-semibold", className)}>
      {children}
    </tr>
  );
}

function GrandTotalRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-t-2 border-border bg-secondary/40 font-bold text-base">
      {children}
    </tr>
  );
}

function Td({ children, right, bold, muted, positive, negative, className }: {
  children?: React.ReactNode; right?: boolean; bold?: boolean; muted?: boolean;
  positive?: boolean; negative?: boolean; className?: string;
}) {
  return (
    <td className={cn(
      "px-4 py-2 text-sm",
      right && "text-right font-mono tabular-nums",
      bold && "font-semibold",
      muted && "text-muted-foreground",
      positive && "text-emerald-400",
      negative && "text-red-400",
      className
    )}>
      {children}
    </td>
  );
}

function Th({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap", right && "text-right", className)}>
      {children}
    </th>
  );
}

function ReportCard({ title, subtitle, children, onExport, onPrint }: {
  title: string; subtitle: string; children: React.ReactNode;
  onExport?: () => void; onPrint?: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4 flex-wrap print:border-0">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          {onExport && (
            <Button variant="ghost" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          )}
          {onPrint && (
            <Button variant="ghost" size="sm" onClick={onPrint}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      Loading…
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText className="w-10 h-10 text-muted-foreground/20 mb-3" />
      <p className="text-foreground font-semibold mb-1">No data for this period</p>
      <p className="text-sm text-muted-foreground">Record transactions to populate this report.</p>
    </div>
  );
}

// ─── Period Selector ─────────────────────────────────────────────────────────
const PRESETS: { key: Preset; label: string }[] = [
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
  { key: "ytd", label: "Year to Date" },
  { key: "last-year", label: "Last Year" },
  { key: "custom", label: "Custom" },
];

function PeriodSelector({
  preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo,
}: {
  preset: Preset; onPreset: (p: Preset) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5 print:hidden">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              preset === p.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} className="h-7 text-xs w-34" />
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)} className="h-7 text-xs w-34" />
        </div>
      )}
    </div>
  );
}

// ─── Aging Table (shared for AR and AP) ──────────────────────────────────────
function AgingTable({
  rows, nameLabel, summary, loading,
}: {
  rows: any[]; nameLabel: string; summary: any; loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!rows || rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-secondary/30 border-b border-border">
          <Th>{nameLabel}</Th>
          <Th right>Current (0–30)</Th>
          <Th right>31–60 days</Th>
          <Th right>61–90 days</Th>
          <Th right>90+ days</Th>
          <Th right>Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => (
          <tr key={i} className="border-b border-border/40 hover:bg-secondary/10">
            <Td>{r.clientName ?? r.supplierName}</Td>
            <Td right muted={r.current === 0}>{r.current > 0 ? money(r.current) : "—"}</Td>
            <Td right muted={r.d30 === 0}>{r.d30 > 0 ? money(r.d30) : "—"}</Td>
            <Td right muted={r.d60 === 0}>{r.d60 > 0 ? money(r.d60) : "—"}</Td>
            <Td right muted={r.d90plus === 0} negative={r.d90plus > 0}>{r.d90plus > 0 ? money(r.d90plus) : "—"}</Td>
            <Td right bold>{money(r.total ?? r.balance)}</Td>
          </tr>
        ))}
        {summary && (
          <GrandTotalRow>
            <Td bold>Total</Td>
            <Td right bold>{money(summary.current)}</Td>
            <Td right bold>{money(summary.d30)}</Td>
            <Td right bold>{money(summary.d60)}</Td>
            <Td right bold negative={summary.d90plus > 0}>{money(summary.d90plus)}</Td>
            <Td right bold>{money(summary.total)}</Td>
          </GrandTotalRow>
        )}
      </tbody>
    </table>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FinancialStatements() {
  const now = new Date();
  const [tab, setTab] = useState<TabKey>("pl");
  const [preset, setPreset] = useState<Preset>("ytd");
  const [customFrom, setCustomFrom] = useState(fmt(startOfYear(now)));
  const [customTo, setCustomTo] = useState(fmt(now));

  const { from, to } = computePeriod(preset, customFrom, customTo);

  // Queries
  const { data: pl, isLoading: plLoading } = useQuery({
    queryKey: ["/api/gl/reports/pl", from, to],
    queryFn: () => api(`/api/gl/reports/pl?from=${from}&to=${to}`),
    enabled: tab === "pl",
  });
  const { data: bs, isLoading: bsLoading } = useQuery({
    queryKey: ["/api/gl/reports/balance-sheet", to],
    queryFn: () => api(`/api/gl/reports/balance-sheet?asOf=${to}`),
    enabled: tab === "balance",
  });
  const { data: tb, isLoading: tbLoading } = useQuery({
    queryKey: ["/api/gl/reports/trial-balance", from, to],
    queryFn: () => api(`/api/gl/reports/trial-balance?from=${from}&to=${to}`),
    enabled: tab === "trial",
  });
  const { data: ar, isLoading: arLoading } = useQuery({
    queryKey: ["/api/gl/reports/ar-aging"],
    queryFn: () => api("/api/gl/reports/ar-aging"),
    enabled: tab === "ar",
  });
  const { data: ap, isLoading: apLoading } = useQuery({
    queryKey: ["/api/gl/reports/ap-aging"],
    queryFn: () => api("/api/gl/reports/ap-aging"),
    enabled: tab === "ap",
  });
  const { data: cf, isLoading: cfLoading } = useQuery({
    queryKey: ["/api/gl/reports/cash-flow", from, to],
    queryFn: () => api(`/api/gl/reports/cash-flow?from=${from}&to=${to}`),
    enabled: tab === "cashflow",
  });
  const { data: exp, isLoading: expLoading } = useQuery({
    queryKey: ["/api/gl/reports/expense-breakdown", from, to],
    queryFn: () => api(`/api/gl/reports/expense-breakdown?from=${from}&to=${to}`),
    enabled: tab === "expenses",
  });

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "pl", label: "P&L", icon: TrendingUp },
    { key: "balance", label: "Balance Sheet", icon: Scale },
    { key: "trial", label: "Trial Balance", icon: FileText },
    { key: "ar", label: "AR Aging", icon: Users },
    { key: "ap", label: "AP Aging", icon: Building2 },
    { key: "cashflow", label: "Cash Flow", icon: Waves },
    { key: "expenses", label: "Expenses", icon: BarChart3 },
  ];

  const periodLabel = from && to ? `${fmtDisplayDate(from)} — ${fmtDisplayDate(to)}` : "";
  const agingTabs: TabKey[] = ["ar", "ap"];
  const showPeriod = !agingTabs.includes(tab);

  // Export handlers
  const handleExport = () => {
    if (tab === "pl" && pl) {
      const rows = [
        ...(pl.revenueRows ?? []).map((r: any) => ({ Section: "Revenue", Account: `${r.code} ${r.name}`, Amount: r.amount, Pct: pl.totalRevenue > 0 ? ((r.amount / pl.totalRevenue) * 100).toFixed(1) + "%" : "" })),
        { Section: "Total Revenue", Account: "", Amount: pl.totalRevenue, Pct: "100%" },
        ...(pl.cogsRows ?? []).map((r: any) => ({ Section: "Cost of Revenue", Account: `${r.code} ${r.name}`, Amount: r.amount, Pct: pl.totalRevenue > 0 ? ((r.amount / pl.totalRevenue) * 100).toFixed(1) + "%" : "" })),
        { Section: "Gross Profit", Account: "", Amount: pl.grossProfit, Pct: pl.totalRevenue > 0 ? ((pl.grossProfit / pl.totalRevenue) * 100).toFixed(1) + "%" : "" },
        ...(pl.opexRows ?? []).map((r: any) => ({ Section: "Operating Expenses", Account: `${r.code} ${r.name}`, Amount: r.amount, Pct: pl.totalRevenue > 0 ? ((r.amount / pl.totalRevenue) * 100).toFixed(1) + "%" : "" })),
        { Section: "Net Income", Account: "", Amount: pl.netIncome, Pct: pl.totalRevenue > 0 ? ((pl.netIncome / pl.totalRevenue) * 100).toFixed(1) + "%" : "" },
      ];
      exportToExcel(rows, `pl-${from}-${to}`);
    } else if (tab === "trial" && tb) {
      exportToExcel(
        (tb.rows ?? []).map((r: any) => ({ Code: r.code, Account: r.name, Type: r.type, Debit: r.totalDebit, Credit: r.totalCredit })),
        `trial-balance-${from}-${to}`
      );
    } else if (tab === "balance" && bs) {
      const rows = [
        ...(bs.assetRows ?? []).map((r: any) => ({ Section: "Assets", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Total Assets", Account: "", Balance: bs.totalAssets },
        ...(bs.liabilityRows ?? []).map((r: any) => ({ Section: "Liabilities", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Total Liabilities", Account: "", Balance: bs.totalLiabilities },
        ...(bs.equityRows ?? []).map((r: any) => ({ Section: "Equity", Account: `${r.code} ${r.name}`, Balance: r.balance })),
        { Section: "Total Equity", Account: "", Balance: bs.totalEquity },
        { Section: "Total Liab + Equity", Account: "", Balance: bs.totalLiabilities + bs.totalEquity },
      ];
      exportToExcel(rows, `balance-sheet-${to}`);
    } else if (tab === "ar" && ar) {
      exportToExcel(
        (ar.clients ?? []).map((c: any) => ({
          Customer: c.clientName, "Current (0-30)": c.current, "31-60 days": c.d30,
          "61-90 days": c.d60, "90+ days": c.d90plus, Total: c.total,
        })),
        `ar-aging-${fmt(now)}`
      );
    } else if (tab === "ap" && ap) {
      exportToExcel(
        (ap.suppliers ?? []).map((s: any) => ({
          Supplier: s.supplierName, "Current (0-30)": s.current, "31-60 days": s.d30,
          "61-90 days": s.d60, "90+ days": s.d90plus, Total: s.balance,
        })),
        `ap-aging-${fmt(now)}`
      );
    } else if (tab === "cashflow" && cf) {
      const rows = [
        { Section: "Operating Activities", Item: "", Amount: "" },
        ...(cf.operating ?? []).map((r: any) => ({ Section: "Operating", Item: r.label, Amount: r.amount })),
        { Section: "Net Operating", Item: "", Amount: (cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0) },
        { Section: "Financing Activities", Item: "", Amount: "" },
        ...(cf.financing ?? []).map((r: any) => ({ Section: "Financing", Item: r.label, Amount: r.amount })),
        { Section: "Opening Cash", Item: "", Amount: cf.openingCash },
        { Section: "Closing Cash", Item: "", Amount: cf.closingCash },
      ];
      exportToExcel(rows, `cash-flow-${from}-${to}`);
    } else if (tab === "expenses" && exp) {
      exportToExcel(
        (exp.accounts ?? []).map((r: any) => ({ Code: r.code, Account: r.accountName, Amount: r.net, Pct: r.pct?.toFixed(1) + "%" })),
        `expenses-${from}-${to}`
      );
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Financial Statements"
        subtitle="GL-driven financial reports — P&L, Balance Sheet, Aging, Cash Flow"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export</span>
          </Button>
        }
      />
      <PageContent>
        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap bg-secondary/40 p-1 rounded-xl mb-4 w-fit print:hidden">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Period selector (not for aging tabs) */}
        {showPeriod && (
          <PeriodSelector
            preset={preset} onPreset={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
          />
        )}

        {/* ── P&L Statement ─────────────────────────────────────────── */}
        {tab === "pl" && (
          plLoading ? <Loading /> : !pl ? <Empty /> : (
            <ReportCard
              title="Profit & Loss Statement"
              subtitle={periodLabel}
              onExport={handleExport}
              onPrint={() => window.print()}
            >
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <Th>Account</Th>
                  <Th right>Amount</Th>
                  <Th right>% of Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <SectionHeader>Revenue</SectionHeader>
                {(pl.revenueRows ?? []).map((r: any) => (
                  <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                    <Td muted className="pl-8">{r.code} — {r.name}</Td>
                    <Td right>{money(r.amount)}</Td>
                    <Td right muted>{pl.totalRevenue > 0 ? pct((r.amount / pl.totalRevenue) * 100) : ""}</Td>
                  </tr>
                ))}
                <TotalRow>
                  <Td bold className="pl-4">Total Revenue</Td>
                  <Td right bold positive>{money(pl.totalRevenue)}</Td>
                  <Td right bold>100.0%</Td>
                </TotalRow>

                {/* COGS */}
                {(pl.cogsRows ?? []).length > 0 && (
                  <>
                    <SectionHeader>Cost of Revenue</SectionHeader>
                    {(pl.cogsRows ?? []).map((r: any) => (
                      <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                        <Td muted className="pl-8">{r.code} — {r.name}</Td>
                        <Td right>{money(r.amount)}</Td>
                        <Td right muted>{pl.totalRevenue > 0 ? pct((r.amount / pl.totalRevenue) * 100) : ""}</Td>
                      </tr>
                    ))}
                    <TotalRow>
                      <Td bold className="pl-4">Total Cost of Revenue</Td>
                      <Td right bold>{money(pl.totalCogs)}</Td>
                      <Td right bold muted>{pl.totalRevenue > 0 ? pct((pl.totalCogs / pl.totalRevenue) * 100) : ""}</Td>
                    </TotalRow>
                  </>
                )}

                {/* Gross Profit */}
                <GrandTotalRow>
                  <Td bold>Gross Profit</Td>
                  <Td right bold positive={pl.grossProfit >= 0} negative={pl.grossProfit < 0}>{money(pl.grossProfit)}</Td>
                  <Td right bold>{pl.totalRevenue > 0 ? pct((pl.grossProfit / pl.totalRevenue) * 100) : ""}</Td>
                </GrandTotalRow>

                {/* OpEx */}
                {(pl.opexRows ?? []).length > 0 && (
                  <>
                    <SectionHeader>Operating Expenses</SectionHeader>
                    {(pl.opexRows ?? []).map((r: any) => (
                      <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                        <Td muted className="pl-8">{r.code} — {r.name}</Td>
                        <Td right>{money(r.amount)}</Td>
                        <Td right muted>{pl.totalRevenue > 0 ? pct((r.amount / pl.totalRevenue) * 100) : ""}</Td>
                      </tr>
                    ))}
                    <TotalRow>
                      <Td bold className="pl-4">Total Operating Expenses</Td>
                      <Td right bold>{money(pl.totalOpex)}</Td>
                      <Td right bold muted>{pl.totalRevenue > 0 ? pct((pl.totalOpex / pl.totalRevenue) * 100) : ""}</Td>
                    </TotalRow>
                  </>
                )}

                {/* Net Income */}
                <GrandTotalRow>
                  <Td bold>Net Income</Td>
                  <Td right bold positive={pl.netIncome >= 0} negative={pl.netIncome < 0}>{money(pl.netIncome)}</Td>
                  <Td right bold positive={pl.netIncome >= 0} negative={pl.netIncome < 0}>
                    {pl.totalRevenue > 0 ? pct((pl.netIncome / pl.totalRevenue) * 100) : ""}
                  </Td>
                </GrandTotalRow>
              </tbody>
            </ReportCard>
          )
        )}

        {/* ── Balance Sheet ──────────────────────────────────────────── */}
        {tab === "balance" && (
          bsLoading ? <Loading /> : !bs ? <Empty /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
              {/* Assets */}
              <ReportCard title="Assets" subtitle={`As of ${fmtDisplayDate(to)}`} onExport={handleExport} onPrint={() => window.print()}>
                <thead>
                  <tr className="bg-secondary/30 border-b border-border">
                    <Th>Account</Th>
                    <Th right>Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {(bs.assetRows ?? []).map((r: any) => (
                    <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                      <Td muted className="pl-6">{r.code} — {r.name}</Td>
                      <Td right>{money(r.balance)}</Td>
                    </tr>
                  ))}
                  <GrandTotalRow>
                    <Td bold>Total Assets</Td>
                    <Td right bold positive>{money(bs.totalAssets)}</Td>
                  </GrandTotalRow>
                </tbody>
              </ReportCard>

              {/* Liabilities + Equity */}
              <ReportCard title="Liabilities & Equity" subtitle={`As of ${fmtDisplayDate(to)}`}>
                <thead>
                  <tr className="bg-secondary/30 border-b border-border">
                    <Th>Account</Th>
                    <Th right>Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  <SectionHeader>Liabilities</SectionHeader>
                  {(bs.liabilityRows ?? []).map((r: any) => (
                    <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                      <Td muted className="pl-6">{r.code} — {r.name}</Td>
                      <Td right>{money(r.balance)}</Td>
                    </tr>
                  ))}
                  <TotalRow>
                    <Td bold className="pl-4">Total Liabilities</Td>
                    <Td right bold>{money(bs.totalLiabilities)}</Td>
                  </TotalRow>
                  <SectionHeader>Equity</SectionHeader>
                  {(bs.equityRows ?? []).map((r: any) => (
                    <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                      <Td muted className="pl-6">{r.code} — {r.name}</Td>
                      <Td right>{money(r.balance)}</Td>
                    </tr>
                  ))}
                  <tr className="border-b border-border/30 hover:bg-secondary/10">
                    <Td muted className="pl-6">Current Period Earnings</Td>
                    <Td right positive={bs.currentPeriodEarnings >= 0} negative={bs.currentPeriodEarnings < 0}>{money(bs.currentPeriodEarnings)}</Td>
                  </tr>
                  <TotalRow>
                    <Td bold className="pl-4">Total Equity</Td>
                    <Td right bold positive={bs.totalEquity >= 0}>{money(bs.totalEquity)}</Td>
                  </TotalRow>
                  <GrandTotalRow>
                    <Td bold>Total Liabilities + Equity</Td>
                    <Td right bold positive>{money(bs.totalLiabilities + bs.totalEquity)}</Td>
                  </GrandTotalRow>
                  {Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)) < 1 && bs.totalAssets > 0 && (
                    <tr className="bg-emerald-500/5">
                      <td colSpan={2} className="px-4 py-2 text-xs text-emerald-400 text-center font-medium">
                        ✓ Balance sheet balances
                      </td>
                    </tr>
                  )}
                </tbody>
              </ReportCard>
            </div>
          )
        )}

        {/* ── Trial Balance ──────────────────────────────────────────── */}
        {tab === "trial" && (
          tbLoading ? <Loading /> : !tb || (tb.rows ?? []).length === 0 ? <Empty /> : (
            <ReportCard title="Trial Balance" subtitle={periodLabel} onExport={handleExport} onPrint={() => window.print()}>
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <Th className="w-16">Code</Th>
                  <Th>Account</Th>
                  <Th className="hidden sm:table-cell">Type</Th>
                  <Th right>Debit</Th>
                  <Th right>Credit</Th>
                  <Th right>Net Balance</Th>
                </tr>
              </thead>
              <tbody>
                {(tb.rows ?? []).map((r: any) => {
                  const net = r.totalDebit - r.totalCredit;
                  return (
                    <tr key={r.code} className="border-b border-border/40 hover:bg-secondary/10">
                      <Td muted className="font-mono text-xs">{r.code}</Td>
                      <Td>{r.name}</Td>
                      <Td muted className="hidden sm:table-cell capitalize text-xs">{r.type}</Td>
                      <Td right className="text-emerald-400">{r.totalDebit > 0 ? money(r.totalDebit) : "—"}</Td>
                      <Td right className="text-amber-400">{r.totalCredit > 0 ? money(r.totalCredit) : "—"}</Td>
                      <Td right bold positive={net > 0} negative={net < 0}>{money(net)}</Td>
                    </tr>
                  );
                })}
                <GrandTotalRow>
                  <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-right">Totals</td>
                  <Td right bold className="text-emerald-400">{money(tb.grandTotalDebit)}</Td>
                  <Td right bold className="text-amber-400">{money(tb.grandTotalCredit)}</Td>
                  <Td right bold>{money(tb.grandTotalDebit - tb.grandTotalCredit)}</Td>
                </GrandTotalRow>
                {Math.abs(tb.grandTotalDebit - tb.grandTotalCredit) < 0.01 && tb.grandTotalDebit > 0 && (
                  <tr className="bg-emerald-500/5">
                    <td colSpan={6} className="px-4 py-2 text-xs text-emerald-400 text-center font-medium">
                      ✓ Ledger is balanced
                    </td>
                  </tr>
                )}
              </tbody>
            </ReportCard>
          )
        )}

        {/* ── AR Aging ───────────────────────────────────────────────── */}
        {tab === "ar" && (
          <div>
            <div className="text-xs text-muted-foreground mb-3 print:hidden">
              Showing all outstanding invoices (status: sent or overdue) as of today
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4 flex-wrap print:border-0">
                <div>
                  <h3 className="font-semibold text-foreground">Accounts Receivable Aging</h3>
                  <p className="text-xs text-muted-foreground">As of {fmtDisplayDate(fmt(now))}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button variant="ghost" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
                  <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <AgingTable rows={ar?.clients ?? []} nameLabel="Customer" summary={ar?.summary} loading={arLoading} />
              </div>
            </div>
          </div>
        )}

        {/* ── AP Aging ───────────────────────────────────────────────── */}
        {tab === "ap" && (
          <div>
            <div className="text-xs text-muted-foreground mb-3 print:hidden">
              Showing all suppliers with outstanding balances as of today
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4 flex-wrap print:border-0">
                <div>
                  <h3 className="font-semibold text-foreground">Accounts Payable Aging</h3>
                  <p className="text-xs text-muted-foreground">As of {fmtDisplayDate(fmt(now))}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button variant="ghost" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
                  <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <AgingTable rows={ap?.suppliers ?? []} nameLabel="Supplier" summary={ap?.summary} loading={apLoading} />
              </div>
            </div>
          </div>
        )}

        {/* ── Cash Flow Statement ─────────────────────────────────────── */}
        {tab === "cashflow" && (
          cfLoading ? <Loading /> : !cf ? <Empty /> : (
            <ReportCard title="Cash Flow Statement" subtitle={periodLabel} onExport={handleExport} onPrint={() => window.print()}>
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <Th>Item</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {/* Operating */}
                <SectionHeader>Operating Activities</SectionHeader>
                {(cf.operating ?? []).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-secondary/10">
                    <Td muted className="pl-8">{r.label}</Td>
                    <Td right positive={r.amount > 0} negative={r.amount < 0}>{money(r.amount)}</Td>
                  </tr>
                ))}
                {(cf.operating ?? []).length === 0 && (
                  <tr><Td muted className="pl-8">No operating cash flows</Td><Td right>—</Td></tr>
                )}
                <TotalRow>
                  <Td bold className="pl-4">Net Cash from Operating Activities</Td>
                  <Td right bold positive={(cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0) >= 0} negative={(cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0) < 0}>
                    {money((cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0))}
                  </Td>
                </TotalRow>

                {/* Financing */}
                {(cf.financing ?? []).length > 0 && (
                  <>
                    <SectionHeader>Financing Activities</SectionHeader>
                    {(cf.financing ?? []).map((r: any, i: number) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-secondary/10">
                        <Td muted className="pl-8">{r.label}</Td>
                        <Td right positive={r.amount > 0} negative={r.amount < 0}>{money(r.amount)}</Td>
                      </tr>
                    ))}
                    <TotalRow>
                      <Td bold className="pl-4">Net Cash from Financing Activities</Td>
                      <Td right bold positive={(cf.financing ?? []).reduce((s: number, r: any) => s + r.amount, 0) >= 0} negative={(cf.financing ?? []).reduce((s: number, r: any) => s + r.amount, 0) < 0}>
                        {money((cf.financing ?? []).reduce((s: number, r: any) => s + r.amount, 0))}
                      </Td>
                    </TotalRow>
                  </>
                )}

                {/* Summary */}
                <GrandTotalRow>
                  <Td bold>Net Change in Cash</Td>
                  <Td right bold positive={cf.netChange >= 0} negative={cf.netChange < 0}>{money(cf.netChange)}</Td>
                </GrandTotalRow>
                <tr className="border-b border-border/30">
                  <Td muted className="pl-6">Opening Cash Balance</Td>
                  <Td right>{money(cf.openingCash)}</Td>
                </tr>
                <GrandTotalRow>
                  <Td bold>Closing Cash Balance</Td>
                  <Td right bold positive={cf.closingCash >= 0}>{money(cf.closingCash)}</Td>
                </GrandTotalRow>
              </tbody>
            </ReportCard>
          )
        )}

        {/* ── Expense Breakdown ──────────────────────────────────────── */}
        {tab === "expenses" && (
          expLoading ? <Loading /> : !exp || (exp.accounts ?? []).length === 0 ? <Empty /> : (
            <ReportCard title="Expense Breakdown by Account" subtitle={periodLabel} onExport={handleExport} onPrint={() => window.print()}>
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <Th className="w-16">Code</Th>
                  <Th>Account</Th>
                  <Th right>Amount</Th>
                  <Th right>% of Total</Th>
                </tr>
              </thead>
              <tbody>
                {(exp.accounts ?? []).map((r: any) => (
                  <tr key={r.code} className="border-b border-border/40 hover:bg-secondary/10">
                    <Td muted className="font-mono text-xs">{r.code}</Td>
                    <Td>{r.accountName}</Td>
                    <Td right>{money(r.net)}</Td>
                    <Td right>
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">{r.pct?.toFixed(1)}%</span>
                      </div>
                    </Td>
                  </tr>
                ))}
                <GrandTotalRow>
                  <td colSpan={2} className="px-4 py-2.5 text-sm font-bold">Total Expenses</td>
                  <Td right bold>{money(exp.total)}</Td>
                  <Td right bold>100.0%</Td>
                </GrandTotalRow>
              </tbody>
            </ReportCard>
          )
        )}
      </PageContent>
    </Layout>
  );
}
