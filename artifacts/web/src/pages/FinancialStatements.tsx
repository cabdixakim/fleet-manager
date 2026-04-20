import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import {
  format, startOfYear, startOfMonth, endOfMonth, startOfQuarter,
  subYears, subMonths,
} from "date-fns";
import { Download, Printer, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────
type TabKey = "pl" | "balance" | "trial" | "ar" | "ap" | "cashflow" | "expenses";
type Preset = "this-month" | "last-month" | "this-quarter" | "ytd" | "last-year" | "custom";

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (d: Date) => format(d, "yyyy-MM-dd");

function money(n: number | undefined | null, showZero = false) {
  if (n === undefined || n === null) return "—";
  if (n === 0 && !showZero) return "—";
  if (n < 0) return `(${formatCurrency(Math.abs(n))})`;
  return formatCurrency(n);
}

function pctStr(n: number | undefined) {
  if (n === undefined || n === null) return "";
  return `${n.toFixed(1)}%`;
}

function fmtDisplayDate(s: string) {
  if (!s) return "";
  try { return format(new Date(s), "d MMM yyyy"); } catch { return s; }
}

// ─── Period helpers ──────────────────────────────────────────────────────────
function computePeriod(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  switch (preset) {
    case "this-month": return { from: fmt(startOfMonth(now)), to: fmt(now) };
    case "last-month": { const lm = subMonths(now, 1); return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)) }; }
    case "this-quarter": return { from: fmt(startOfQuarter(now)), to: fmt(now) };
    case "ytd": return { from: fmt(startOfYear(now)), to: fmt(now) };
    case "last-year": { const ly = subYears(now, 1); return { from: fmt(startOfYear(ly)), to: `${ly.getFullYear()}-12-31` }; }
    default: return { from: customFrom, to: customTo };
  }
}

const api = (path: string) => fetch(path, { credentials: "include" }).then((r) => r.json());

// ─── Statement Layout Components ────────────────────────────────────────────

function StatementHeader({ title, period, company = "Optima Transport LLC" }: { title: string; period: string; company?: string }) {
  return (
    <div className="text-center py-5 border-b border-border/60 print:py-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{company}</p>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{period}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 pt-5 pb-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/80">{children}</span>
      <div className="flex-1 h-px bg-primary/20" />
    </div>
  );
}

function DetailRow({ label, amount, pct, code, noRule }: { label: string; amount?: number; pct?: number; code?: string; noRule?: boolean }) {
  return (
    <div className={cn("flex items-center px-6 py-1.5 hover:bg-secondary/10 group", !noRule && "border-b border-border/20")}>
      <span className="w-12 text-xs text-muted-foreground/50 font-mono shrink-0">{code}</span>
      <span className="flex-1 pl-2 text-sm text-foreground/80">{label}</span>
      {pct !== undefined && (
        <span className="w-16 text-right text-xs text-muted-foreground/60 tabular-nums shrink-0">{pctStr(pct)}</span>
      )}
      {amount !== undefined && (
        <span className="w-36 text-right text-sm font-mono tabular-nums text-foreground shrink-0">
          {amount === 0 ? <span className="text-muted-foreground/30">—</span> : money(amount)}
        </span>
      )}
    </div>
  );
}

function SubtotalRow({ label, amount, pct, level = 1 }: { label: string; amount: number; pct?: number; level?: 1 | 2 }) {
  return (
    <div className={cn(
      "flex items-center px-6 py-2.5 border-t",
      level === 1 ? "border-border/60 bg-secondary/10" : "border-border/40 bg-secondary/5"
    )}>
      <span className="w-12 shrink-0" />
      <span className={cn("flex-1 pl-2 text-sm font-semibold text-foreground")}>{label}</span>
      {pct !== undefined && (
        <span className="w-16 text-right text-xs font-semibold text-muted-foreground tabular-nums shrink-0">{pctStr(pct)}</span>
      )}
      <span className={cn("w-36 text-right text-sm font-bold font-mono tabular-nums shrink-0",
        amount >= 0 ? "text-foreground" : "text-red-400"
      )}>
        {money(amount, true)}
      </span>
    </div>
  );
}

function GrandTotalRow({ label, amount, pct, color }: { label: string; amount: number; pct?: number; color?: "green" | "red" | "default" }) {
  const numColor = color === "green" ? "text-emerald-400" : color === "red" ? "text-red-400" : amount >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <div className="flex items-center px-6 py-4 border-t-2 border-border bg-secondary/20">
      <span className="w-12 shrink-0" />
      <span className="flex-1 pl-2 text-base font-bold text-foreground uppercase tracking-wide">{label}</span>
      {pct !== undefined && (
        <span className={cn("w-16 text-right text-sm font-bold tabular-nums shrink-0", numColor)}>{pctStr(pct)}</span>
      )}
      <span className={cn("w-36 text-right text-lg font-bold font-mono tabular-nums shrink-0", numColor)}>
        {money(amount, true)}
      </span>
    </div>
  );
}

function StatDivider() {
  return <div className="my-1 border-t border-dashed border-border/30 mx-6" />;
}

function ColHeader({ pctLabel }: { pctLabel?: string }) {
  return (
    <div className="flex items-center px-6 py-2 border-b border-border bg-secondary/30">
      <span className="w-12 shrink-0" />
      <span className="flex-1 pl-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</span>
      {pctLabel && <span className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">{pctLabel}</span>}
      <span className="w-36 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Amount</span>
    </div>
  );
}

// ─── Aging Table ─────────────────────────────────────────────────────────────
function AgingTable({ rows, nameLabel, summary, loading }: { rows: any[]; nameLabel: string; summary: any; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!rows || rows.length === 0) return <EmptyState />;

  const buckets = [
    { key: "current", label: "Current\n(0–30 days)", cls: "text-emerald-400" },
    { key: "d30", label: "1–30 days\noverdue", cls: "text-yellow-400" },
    { key: "d60", label: "31–60 days\noverdue", cls: "text-orange-400" },
    { key: "d90plus", label: "60+ days\noverdue", cls: "text-red-400" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/30 border-b border-border">
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nameLabel}</th>
            {buckets.map((b) => (
              <th key={b.key} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-pre-line">{b.label}</th>
            ))}
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-b border-border/30 hover:bg-secondary/10">
              <td className="px-5 py-3 font-medium text-foreground">{r.clientName ?? r.supplierName}</td>
              {buckets.map((b) => {
                const val = r[b.key] as number;
                return (
                  <td key={b.key} className={cn("px-4 py-3 text-right font-mono tabular-nums", val > 0 ? b.cls : "text-muted-foreground/30")}>
                    {val > 0 ? money(val) : "—"}
                  </td>
                );
              })}
              <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-foreground">{money(r.total ?? r.balance, true)}</td>
            </tr>
          ))}
        </tbody>
        {summary && (
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/30 font-bold">
              <td className="px-5 py-3 font-bold text-foreground">TOTAL</td>
              {buckets.map((b) => {
                const val = summary[b.key] as number;
                return (
                  <td key={b.key} className={cn("px-4 py-3 text-right font-mono font-bold tabular-nums", val > 0 ? b.cls : "text-muted-foreground/40")}>
                    {val > 0 ? money(val) : "—"}
                  </td>
                );
              })}
              <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-foreground text-base">{money(summary.total, true)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Loading / Empty ─────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      Loading report…
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <AlertCircle className="w-10 h-10 text-muted-foreground/20" />
      <p className="font-semibold text-foreground">No data for this period</p>
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

function PeriodSelector({ preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo }: {
  preset: Preset; onPreset: (p: Preset) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5 print:hidden">
      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => onPreset(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              preset === p.key
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary/40"
            )}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} className="h-7 text-xs w-36" />
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)} className="h-7 text-xs w-36" />
        </div>
      )}
    </div>
  );
}

// ─── Report Wrapper ──────────────────────────────────────────────────────────
function ReportSheet({ children, onExport, onPrint, maxW = "2xl" }: {
  children: React.ReactNode; onExport?: () => void; onPrint?: () => void; maxW?: string;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden shadow-sm", `max-w-${maxW}`)}>
      {(onExport || onPrint) && (
        <div className="flex justify-end gap-1 px-4 py-2 border-b border-border/50 bg-secondary/10 print:hidden">
          {onExport && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={onExport}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          )}
          {onPrint && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={onPrint}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
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
  const periodLabel = from && to ? `${fmtDisplayDate(from)} through ${fmtDisplayDate(to)}` : "";
  const agingTabs: TabKey[] = ["ar", "ap"];

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: pl, isLoading: plLoading } = useQuery({ queryKey: ["/api/gl/reports/pl", from, to], queryFn: () => api(`/api/gl/reports/pl?from=${from}&to=${to}`), enabled: tab === "pl" });
  const { data: bs, isLoading: bsLoading } = useQuery({ queryKey: ["/api/gl/reports/balance-sheet", to], queryFn: () => api(`/api/gl/reports/balance-sheet?asOf=${to}`), enabled: tab === "balance" });
  const { data: tb, isLoading: tbLoading } = useQuery({ queryKey: ["/api/gl/reports/trial-balance", from, to], queryFn: () => api(`/api/gl/reports/trial-balance?from=${from}&to=${to}`), enabled: tab === "trial" });
  const { data: ar, isLoading: arLoading } = useQuery({ queryKey: ["/api/gl/reports/ar-aging"], queryFn: () => api("/api/gl/reports/ar-aging"), enabled: tab === "ar" });
  const { data: ap, isLoading: apLoading } = useQuery({ queryKey: ["/api/gl/reports/ap-aging"], queryFn: () => api("/api/gl/reports/ap-aging"), enabled: tab === "ap" });
  const { data: cf, isLoading: cfLoading } = useQuery({ queryKey: ["/api/gl/reports/cash-flow", from, to], queryFn: () => api(`/api/gl/reports/cash-flow?from=${from}&to=${to}`), enabled: tab === "cashflow" });
  const { data: exp, isLoading: expLoading } = useQuery({ queryKey: ["/api/gl/reports/expense-breakdown", from, to], queryFn: () => api(`/api/gl/reports/expense-breakdown?from=${from}&to=${to}`), enabled: tab === "expenses" });

  const TABS = [
    { key: "pl" as TabKey, label: "Profit & Loss" },
    { key: "balance" as TabKey, label: "Balance Sheet" },
    { key: "trial" as TabKey, label: "Trial Balance" },
    { key: "ar" as TabKey, label: "AR Aging" },
    { key: "ap" as TabKey, label: "AP Aging" },
    { key: "cashflow" as TabKey, label: "Cash Flow" },
    { key: "expenses" as TabKey, label: "Expenses" },
  ];

  // ─── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rev = pl?.totalRevenue ?? 0;
    if (tab === "pl" && pl) {
      exportToExcel([
        ...(pl.revenueRows ?? []).map((r: any) => ({ Section: "Income", Code: r.code, Account: r.name, Amount: r.amount, "% of Income": rev > 0 ? ((r.amount / rev) * 100).toFixed(1) + "%" : "" })),
        { Section: "Total Income", Code: "", Account: "", Amount: pl.totalRevenue, "% of Income": "100%" },
        ...(pl.cogsRows ?? []).map((r: any) => ({ Section: "Cost of Goods Sold", Code: r.code, Account: r.name, Amount: r.amount, "% of Income": rev > 0 ? ((r.amount / rev) * 100).toFixed(1) + "%" : "" })),
        { Section: "Total COGS", Code: "", Account: "", Amount: pl.totalCogs, "% of Income": rev > 0 ? ((pl.totalCogs / rev) * 100).toFixed(1) + "%" : "" },
        { Section: "Gross Profit", Code: "", Account: "", Amount: pl.grossProfit, "% of Income": rev > 0 ? ((pl.grossProfit / rev) * 100).toFixed(1) + "%" : "" },
        ...(pl.opexRows ?? []).map((r: any) => ({ Section: "Expenses", Code: r.code, Account: r.name, Amount: r.amount, "% of Income": rev > 0 ? ((r.amount / rev) * 100).toFixed(1) + "%" : "" })),
        { Section: "Total Expenses", Code: "", Account: "", Amount: pl.totalOpex, "% of Income": rev > 0 ? ((pl.totalOpex / rev) * 100).toFixed(1) + "%" : "" },
        { Section: "NET INCOME", Code: "", Account: "", Amount: pl.netIncome, "% of Income": rev > 0 ? ((pl.netIncome / rev) * 100).toFixed(1) + "%" : "" },
      ], `profit-loss-${from}-${to}`);
    } else if (tab === "balance" && bs) {
      exportToExcel([
        ...(bs.assetRows ?? []).map((r: any) => ({ Section: "Assets", Code: r.code, Account: r.name, Balance: r.balance })),
        { Section: "Total Assets", Code: "", Account: "", Balance: bs.totalAssets },
        ...(bs.liabilityRows ?? []).map((r: any) => ({ Section: "Liabilities", Code: r.code, Account: r.name, Balance: r.balance })),
        { Section: "Total Liabilities", Code: "", Account: "", Balance: bs.totalLiabilities },
        ...(bs.equityRows ?? []).map((r: any) => ({ Section: "Equity", Code: r.code, Account: r.name, Balance: r.balance })),
        { Section: "Total Equity", Code: "", Account: "", Balance: bs.totalEquity },
      ], `balance-sheet-${to}`);
    } else if (tab === "trial" && tb) {
      exportToExcel((tb.rows ?? []).map((r: any) => ({ Code: r.code, Account: r.name, Type: r.type, Debit: r.totalDebit, Credit: r.totalCredit, Balance: r.totalDebit - r.totalCredit })), `trial-balance-${from}-${to}`);
    } else if (tab === "ar" && ar) {
      exportToExcel((ar.clients ?? []).map((c: any) => ({ Customer: c.clientName, "Current (0-30)": c.current, "31-60 days": c.d30, "61-90 days": c.d60, "90+ days": c.d90plus, Total: c.total })), `ar-aging-${fmt(now)}`);
    } else if (tab === "ap" && ap) {
      exportToExcel((ap.suppliers ?? []).map((s: any) => ({ Supplier: s.supplierName, "Current (0-30)": s.current, "31-60 days": s.d30, "61-90 days": s.d60, "90+ days": s.d90plus, Total: s.balance })), `ap-aging-${fmt(now)}`);
    } else if (tab === "cashflow" && cf) {
      exportToExcel([
        ...(cf.operating ?? []).map((r: any) => ({ Section: "Operating Activities", Item: r.label, Amount: r.amount })),
        { Section: "Net Operating Cash Flow", Item: "", Amount: (cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0) },
        ...(cf.financing ?? []).map((r: any) => ({ Section: "Financing Activities", Item: r.label, Amount: r.amount })),
        { Section: "Opening Cash", Item: "", Amount: cf.openingCash },
        { Section: "Closing Cash", Item: "", Amount: cf.closingCash },
      ], `cash-flow-${from}-${to}`);
    } else if (tab === "expenses" && exp) {
      exportToExcel((exp.accounts ?? []).map((r: any) => ({ Code: r.code, Account: r.accountName, Amount: r.net, "% of Total": r.pct?.toFixed(1) + "%" })), `expenses-${from}-${to}`);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Financial Statements"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        }
      />
      <PageContent>

        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="print:hidden border-b border-border mb-5 overflow-x-auto">
          <nav className="flex gap-0 -mb-px">
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}>
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Period Selector ─────────────────────────────────────────────── */}
        {!agingTabs.includes(tab) && (
          <PeriodSelector
            preset={preset} onPreset={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* P & L Statement                                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "pl" && (
          plLoading ? <LoadingState /> : !pl ? <EmptyState /> : (
            <ReportSheet onExport={handleExport} onPrint={() => window.print()}>
              <StatementHeader title="Profit & Loss Statement" period={periodLabel} />
              <ColHeader pctLabel="% Income" />

              {/* INCOME */}
              <SectionLabel>Income</SectionLabel>
              {(pl.revenueRows ?? []).map((r: any) => (
                <DetailRow key={r.code} code={r.code} label={r.name} amount={r.amount}
                  pct={pl.totalRevenue > 0 ? (r.amount / pl.totalRevenue) * 100 : undefined} />
              ))}
              {(pl.revenueRows ?? []).length === 0 && <DetailRow label="No income recorded" />}
              <SubtotalRow label="Total Income" amount={pl.totalRevenue ?? 0} pct={100} />
              <StatDivider />

              {/* COST OF GOODS SOLD */}
              {(pl.cogsRows ?? []).length > 0 && (
                <>
                  <SectionLabel>Cost of Goods Sold</SectionLabel>
                  {(pl.cogsRows ?? []).map((r: any) => (
                    <DetailRow key={r.code} code={r.code} label={r.name} amount={r.amount}
                      pct={pl.totalRevenue > 0 ? (r.amount / pl.totalRevenue) * 100 : undefined} />
                  ))}
                  <SubtotalRow label="Total Cost of Goods Sold" amount={pl.totalCogs ?? 0}
                    pct={pl.totalRevenue > 0 ? (pl.totalCogs / pl.totalRevenue) * 100 : undefined} />
                  <StatDivider />
                </>
              )}

              {/* GROSS PROFIT */}
              <GrandTotalRow label="Gross Profit"
                amount={pl.grossProfit ?? 0}
                pct={pl.totalRevenue > 0 ? (pl.grossProfit / pl.totalRevenue) * 100 : undefined}
                color={pl.grossProfit >= 0 ? "green" : "red"} />

              {/* EXPENSES */}
              {(pl.opexRows ?? []).length > 0 && (
                <>
                  <SectionLabel>Expenses</SectionLabel>
                  {(pl.opexRows ?? []).map((r: any) => (
                    <DetailRow key={r.code} code={r.code} label={r.name} amount={r.amount}
                      pct={pl.totalRevenue > 0 ? (r.amount / pl.totalRevenue) * 100 : undefined} />
                  ))}
                  <SubtotalRow label="Total Expenses" amount={pl.totalOpex ?? 0}
                    pct={pl.totalRevenue > 0 ? (pl.totalOpex / pl.totalRevenue) * 100 : undefined} />
                  <StatDivider />
                </>
              )}

              {/* NET INCOME */}
              <GrandTotalRow label="Net Income"
                amount={pl.netIncome ?? 0}
                pct={pl.totalRevenue > 0 ? (pl.netIncome / pl.totalRevenue) * 100 : undefined}
                color={pl.netIncome >= 0 ? "green" : "red"} />
              <div className="h-2" />
            </ReportSheet>
          )
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Balance Sheet                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "balance" && (
          bsLoading ? <LoadingState /> : !bs ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
              {/* ASSETS */}
              <ReportSheet onExport={handleExport} onPrint={() => window.print()} maxW="full">
                <StatementHeader title="Assets" period={`As of ${fmtDisplayDate(to)}`} />
                <ColHeader />
                <SectionLabel>Current Assets</SectionLabel>
                {(bs.assetRows ?? []).map((r: any) => (
                  <DetailRow key={r.code} code={r.code} label={r.name} amount={r.balance} />
                ))}
                {(bs.assetRows ?? []).length === 0 && <DetailRow label="No assets recorded" />}
                <GrandTotalRow label="Total Assets" amount={bs.totalAssets ?? 0} color="green" />
                <div className="h-2" />
              </ReportSheet>

              {/* LIABILITIES + EQUITY */}
              <ReportSheet maxW="full">
                <StatementHeader title="Liabilities & Equity" period={`As of ${fmtDisplayDate(to)}`} />
                <ColHeader />

                <SectionLabel>Liabilities</SectionLabel>
                {(bs.liabilityRows ?? []).map((r: any) => (
                  <DetailRow key={r.code} code={r.code} label={r.name} amount={r.balance} />
                ))}
                {(bs.liabilityRows ?? []).length === 0 && <DetailRow label="No liabilities recorded" />}
                <SubtotalRow label="Total Liabilities" amount={bs.totalLiabilities ?? 0} />
                <StatDivider />

                <SectionLabel>Equity</SectionLabel>
                {(bs.equityRows ?? []).map((r: any) => (
                  <DetailRow key={r.code} code={r.code} label={r.name} amount={r.balance} />
                ))}
                <DetailRow label="Current Period Earnings" amount={bs.currentPeriodEarnings ?? 0} />
                <SubtotalRow label="Total Equity" amount={bs.totalEquity ?? 0} />
                <StatDivider />

                <GrandTotalRow label="Total Liabilities + Equity" amount={(bs.totalLiabilities ?? 0) + (bs.totalEquity ?? 0)} color="green" />

                {Math.abs((bs.totalAssets ?? 0) - ((bs.totalLiabilities ?? 0) + (bs.totalEquity ?? 0))) < 1 && bs.totalAssets > 0 && (
                  <div className="px-6 py-2 text-xs text-emerald-400 text-center font-medium bg-emerald-500/5 border-t border-emerald-500/20">
                    ✓ Balance sheet is in balance
                  </div>
                )}
                <div className="h-2" />
              </ReportSheet>
            </div>
          )
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Trial Balance                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "trial" && (
          tbLoading ? <LoadingState /> : !tb || (tb.rows ?? []).length === 0 ? <EmptyState /> : (
            <ReportSheet onExport={handleExport} onPrint={() => window.print()} maxW="3xl">
              <StatementHeader title="Trial Balance" period={periodLabel} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/30 border-b border-border">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-16">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Type</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Debit</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tb.rows ?? []).map((r: any) => {
                      const net = r.totalDebit - r.totalCredit;
                      return (
                        <tr key={r.code} className="border-b border-border/30 hover:bg-secondary/10">
                          <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                          <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize hidden sm:table-cell">{r.type}</td>
                          <td className="px-5 py-2.5 text-right font-mono tabular-nums text-emerald-400 text-sm">
                            {r.totalDebit > 0 ? formatCurrency(r.totalDebit) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-5 py-2.5 text-right font-mono tabular-nums text-amber-400 text-sm">
                            {r.totalCredit > 0 ? formatCurrency(r.totalCredit) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className={cn("px-5 py-2.5 text-right font-mono font-semibold tabular-nums text-sm", net > 0 ? "text-foreground" : net < 0 ? "text-red-400" : "text-muted-foreground/30")}>
                            {net !== 0 ? money(net) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/30 font-bold">
                      <td colSpan={3} className="px-5 py-3 text-sm font-bold text-foreground text-right">TOTALS</td>
                      <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-emerald-400">{formatCurrency(tb.grandTotalDebit)}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-amber-400">{formatCurrency(tb.grandTotalCredit)}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-foreground">{money(tb.grandTotalDebit - tb.grandTotalCredit, true)}</td>
                    </tr>
                    {Math.abs(tb.grandTotalDebit - tb.grandTotalCredit) < 0.01 && tb.grandTotalDebit > 0 && (
                      <tr className="bg-emerald-500/5">
                        <td colSpan={6} className="px-5 py-2.5 text-xs text-emerald-400 text-center font-medium">✓ Ledger is balanced — Debits equal Credits</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </ReportSheet>
          )
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* AR Aging                                                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "ar" && (
          <ReportSheet onExport={handleExport} onPrint={() => window.print()} maxW="5xl">
            <StatementHeader title="Accounts Receivable Aging" period={`As of ${fmtDisplayDate(fmt(now))} — Outstanding customer invoices`} />
            <AgingTable rows={ar?.clients ?? []} nameLabel="Customer" summary={ar?.summary} loading={arLoading} />
          </ReportSheet>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* AP Aging                                                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "ap" && (
          <ReportSheet onExport={handleExport} onPrint={() => window.print()} maxW="5xl">
            <StatementHeader title="Accounts Payable Aging" period={`As of ${fmtDisplayDate(fmt(now))} — Outstanding supplier balances`} />
            <AgingTable rows={ap?.suppliers ?? []} nameLabel="Supplier" summary={ap?.summary} loading={apLoading} />
          </ReportSheet>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Cash Flow Statement                                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "cashflow" && (
          cfLoading ? <LoadingState /> : !cf ? <EmptyState /> : (
            <ReportSheet onExport={handleExport} onPrint={() => window.print()}>
              <StatementHeader title="Cash Flow Statement" period={periodLabel} />
              <ColHeader />

              {/* OPERATING */}
              <SectionLabel>Operating Activities</SectionLabel>
              {(cf.operating ?? []).length === 0 && <DetailRow label="No operating cash flows in this period" />}
              {(cf.operating ?? []).map((r: any, i: number) => (
                <DetailRow key={i} label={r.label} amount={r.amount} />
              ))}
              <SubtotalRow label="Net Cash from Operating Activities"
                amount={(cf.operating ?? []).reduce((s: number, r: any) => s + r.amount, 0)} />
              <StatDivider />

              {/* FINANCING */}
              {(cf.financing ?? []).length > 0 && (
                <>
                  <SectionLabel>Financing Activities</SectionLabel>
                  {(cf.financing ?? []).map((r: any, i: number) => (
                    <DetailRow key={i} label={r.label} amount={r.amount} />
                  ))}
                  <SubtotalRow label="Net Cash from Financing Activities"
                    amount={(cf.financing ?? []).reduce((s: number, r: any) => s + r.amount, 0)} />
                  <StatDivider />
                </>
              )}

              {/* NET + BALANCES */}
              <GrandTotalRow label="Net Change in Cash" amount={cf.netChange ?? 0}
                color={(cf.netChange ?? 0) >= 0 ? "green" : "red"} />
              <div className="flex items-center px-6 py-2.5 border-t border-border/40">
                <span className="w-12 shrink-0" />
                <span className="flex-1 pl-2 text-sm text-muted-foreground">Opening Cash Balance</span>
                <span className="w-36 text-right text-sm font-mono tabular-nums text-foreground">{money(cf.openingCash, true)}</span>
              </div>
              <div className="flex items-center px-6 py-3 border-t-2 border-border bg-secondary/20">
                <span className="w-12 shrink-0" />
                <span className="flex-1 pl-2 text-base font-bold text-foreground uppercase tracking-wide">Closing Cash Balance</span>
                <span className={cn("w-36 text-right text-lg font-bold font-mono tabular-nums", (cf.closingCash ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {money(cf.closingCash, true)}
                </span>
              </div>
              <div className="h-2" />
            </ReportSheet>
          )
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Expense Breakdown                                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "expenses" && (
          expLoading ? <LoadingState /> : !exp || (exp.accounts ?? []).length === 0 ? <EmptyState /> : (
            <ReportSheet onExport={handleExport} onPrint={() => window.print()} maxW="2xl">
              <StatementHeader title="Expense Breakdown by Account" period={periodLabel} />
              <div className="flex items-center px-6 py-2.5 border-b border-border bg-secondary/30">
                <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</span>
                <span className="flex-1 pl-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</span>
                <span className="w-48 mr-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share of Total</span>
                <span className="w-36 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</span>
              </div>
              {(exp.accounts ?? []).map((r: any) => (
                <div key={r.code} className="flex items-center px-6 py-2.5 border-b border-border/20 hover:bg-secondary/10">
                  <span className="w-12 shrink-0 text-xs font-mono text-muted-foreground/60">{r.code}</span>
                  <span className="flex-1 pl-2 text-sm text-foreground">{r.accountName}</span>
                  <div className="w-48 mr-5 flex items-center gap-2">
                    <div className="flex-1 bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{r.pct?.toFixed(1)}%</span>
                  </div>
                  <span className="w-36 text-right text-sm font-mono tabular-nums text-foreground">{money(r.net)}</span>
                </div>
              ))}
              <div className="flex items-center px-6 py-4 border-t-2 border-border bg-secondary/20">
                <span className="w-12 shrink-0" />
                <span className="flex-1 pl-2 text-base font-bold text-foreground uppercase tracking-wide">Total Expenses</span>
                <span className="w-48 mr-5 text-right text-sm font-semibold text-muted-foreground">100.0%</span>
                <span className="w-36 text-right text-lg font-bold font-mono tabular-nums text-foreground">{money(exp.total, true)}</span>
              </div>
              <div className="h-2" />
            </ReportSheet>
          )
        )}

      </PageContent>
    </Layout>
  );
}
