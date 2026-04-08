import { useState } from "react";
import { useGetCommissionReport, useGetDashboardAnalytics, useGetPnlReport, useGetEntityList, useGetEntityAnalytics, useGetCommissionBreakdown } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { exportToExcel, exportMultiSheet } from "@/lib/export";
import { getRouteChart } from "@/lib/routes";
import { Download, BarChart3, TrendingUp, TrendingDown, Filter, Printer, Truck, Users, Building2, UserCircle, CheckCircle2, XCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";

const PERIOD_TYPES = [
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
];

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
];

const QUARTERS = [
  { value: 1, label: "Q1 (Jan–Mar)" },
  { value: 2, label: "Q2 (Apr–Jun)" },
  { value: 3, label: "Q3 (Jul–Sep)" },
  { value: 4, label: "Q4 (Oct–Dec)" },
];

function buildYearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = 2026; y <= current; y++) years.push(y);
  return years;
}

function periodLabel(type: string, year: number, month: number, quarter: number) {
  if (type === "month") return `${MONTHS[month - 1]?.label ?? ""} ${year}`;
  if (type === "quarter") return `Q${quarter} ${year}`;
  return String(year);
}

const ENTITY_PERIODS = [
  { value: "all", label: "All Time" },
  { value: "year", label: "This Year" },
  { value: "quarter", label: "This Quarter" },
  { value: "month", label: "This Month" },
];

const ENTITY_TYPES = [
  { id: "truck", label: "Trucks", icon: Truck },
  { id: "subcontractor", label: "Subcontractors", icon: Users },
  { id: "client", label: "Clients", icon: Building2 },
  { id: "driver", label: "Drivers", icon: UserCircle },
];

const ENTITY_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#a855f7"];

function getMetricOptions(entityType: string) {
  if (entityType === "truck") return [
    { key: "tripsCompleted", label: "Trips", format: (v: number) => String(v) },
    { key: "totalDelivered", label: "MT Delivered", format: formatNumber },
    { key: "deliveryRate", label: "Delivery %", format: (v: number) => `${v}%` },
    { key: "revenue", label: "Revenue", format: formatCurrency },
    { key: "expenses", label: "Expenses", format: formatCurrency },
  ];
  if (entityType === "subcontractor") return [
    { key: "tripsCompleted", label: "Trips", format: (v: number) => String(v) },
    { key: "totalDelivered", label: "MT Delivered", format: formatNumber },
    { key: "grossRevenue", label: "Gross Rev.", format: formatCurrency },
    { key: "commission", label: "Commission", format: formatCurrency },
    { key: "netPayable", label: "Net Payable", format: formatCurrency },
  ];
  if (entityType === "client") return [
    { key: "batches", label: "Batches", format: (v: number) => String(v) },
    { key: "totalDelivered", label: "MT Delivered", format: formatNumber },
    { key: "invoiced", label: "Invoiced", format: formatCurrency },
    { key: "paid", label: "Paid", format: formatCurrency },
    { key: "outstanding", label: "Outstanding", format: formatCurrency },
  ];
  if (entityType === "driver") return [
    { key: "tripsCompleted", label: "Trips", format: (v: number) => String(v) },
    { key: "totalDelivered", label: "MT Delivered", format: formatNumber },
    { key: "deliveryRate", label: "Delivery %", format: (v: number) => `${v}%` },
    { key: "shortMT", label: "Short MT", format: formatNumber },
  ];
  return [];
}

function getMetricRows(entityType: string, metrics: any) {
  if (entityType === "truck") return [
    { label: "Trips Completed", value: metrics.tripsCompleted ?? 0 },
    { label: "Cancelled", value: metrics.tripsCancelled ?? 0 },
    { label: "AGO Trips", value: metrics.agoTrips ?? 0 },
    { label: "PMS Trips", value: metrics.pmsTrips ?? 0 },
    { label: "MT Loaded", value: formatNumber(metrics.totalLoaded ?? 0) },
    { label: "MT Delivered", value: formatNumber(metrics.totalDelivered ?? 0) },
    { label: "Short MT", value: formatNumber(metrics.shortMT ?? 0) },
    { label: "Delivery Rate", value: `${metrics.deliveryRate ?? 100}%` },
    { label: "Revenue", value: formatCurrency(metrics.revenue ?? 0) },
    { label: "Trip Expenses", value: formatCurrency(metrics.expenses ?? 0) },
  ];
  if (entityType === "subcontractor") return [
    { label: "Trips Completed", value: metrics.tripsCompleted ?? 0 },
    { label: "Cancelled", value: metrics.tripsCancelled ?? 0 },
    { label: "MT Loaded", value: formatNumber(metrics.totalLoaded ?? 0) },
    { label: "MT Delivered", value: formatNumber(metrics.totalDelivered ?? 0) },
    { label: "Short MT", value: formatNumber(metrics.shortMT ?? 0) },
    { label: "Delivery Rate", value: `${metrics.deliveryRate ?? 100}%` },
    { label: "Gross Revenue", value: formatCurrency(metrics.grossRevenue ?? 0) },
    { label: "Commission", value: formatCurrency(metrics.commission ?? 0) },
    { label: "Trip Expenses", value: formatCurrency(metrics.expenses ?? 0) },
    { label: "Net Payable", value: formatCurrency(metrics.netPayable ?? 0) },
  ];
  if (entityType === "client") return [
    { label: "Batches Invoiced", value: metrics.batches ?? 0 },
    { label: "MT Delivered", value: formatNumber(metrics.totalDelivered ?? 0) },
    { label: "Delivery Rate", value: `${metrics.deliveryRate ?? 100}%` },
    { label: "Total Invoiced", value: formatCurrency(metrics.invoiced ?? 0) },
    { label: "Total Paid", value: formatCurrency(metrics.paid ?? 0) },
    { label: "Advances", value: formatCurrency(metrics.advances ?? 0) },
    { label: "Outstanding", value: formatCurrency(metrics.outstanding ?? 0) },
  ];
  if (entityType === "driver") return [
    { label: "Trips Completed", value: metrics.tripsCompleted ?? 0 },
    { label: "Cancelled", value: metrics.tripsCancelled ?? 0 },
    { label: "AGO Trips", value: metrics.agoTrips ?? 0 },
    { label: "PMS Trips", value: metrics.pmsTrips ?? 0 },
    { label: "MT Delivered", value: formatNumber(metrics.totalDelivered ?? 0) },
    { label: "Delivery Rate", value: `${metrics.deliveryRate ?? 100}%` },
    { label: "Short MT", value: formatNumber(metrics.shortMT ?? 0) },
  ];
  return [];
}

const PIE_COLORS = ["hsl(var(--primary))", "#ff9800", "#4caf50", "#9c27b0", "#f44336", "#2196f3"];

const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};
const CHART_GRID_COLOR = "hsl(var(--border))";
const CHART_AXIS_COLOR = "hsl(var(--muted-foreground))";

export default function Reports() {
  const now = new Date();
  const [period, setPeriod] = useState("month");
  const [activeReport, setActiveReport] = useState<"commission" | "analytics" | "pnl" | "entities">("pnl");
  const [entityType, setEntityType] = useState("truck");
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>([]);
  const [entityPeriod, setEntityPeriod] = useState("all");
  const [analyticMetric, setAnalyticMetric] = useState("tripsCompleted");

  // P&L-specific time selectors
  const [pnlPeriodType, setPnlPeriodType] = useState("month");
  const [pnlYear, setPnlYear] = useState(now.getFullYear());
  const [pnlMonth, setPnlMonth] = useState(now.getMonth() + 1);
  const [pnlQuarter, setPnlQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  // Derive the `month` param sent to the backend:
  // - for monthly: the selected month number (1–12)
  // - for quarterly: the quarter number 1–4 (backend interprets it as quarter index)
  // - for yearly: undefined
  const pnlMonthParam = pnlPeriodType === "month" ? pnlMonth : pnlPeriodType === "quarter" ? pnlQuarter : undefined;

  const yearOptions = buildYearOptions();

  const { data: analytics, isLoading: analyticsLoading } = useGetDashboardAnalytics({ period });
  const { data: commissionData, isLoading: commLoading } = useGetCommissionReport({ period });
  const { data: pnl, isLoading: pnlLoading } = useGetPnlReport({ period: pnlPeriodType, year: pnlYear, month: pnlMonthParam });
  const { data: breakdown, isLoading: breakdownLoading } = useGetCommissionBreakdown({ period });
  const { data: entityList } = useGetEntityList();
  const { data: entityAnalytics, isLoading: entityLoading } = useGetEntityAnalytics({
    entity: entityType,
    ids: selectedEntityIds,
    period: entityPeriod,
    year: new Date().getFullYear(),
  });

  const toggleEntity = (id: number) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const entityOptions: { id: number; label: string; sub?: string }[] = (() => {
    if (!entityList) return [];
    if (entityType === "truck") return (entityList.trucks ?? []).map((t: any) => ({ id: t.id, label: t.label, sub: t.sub }));
    if (entityType === "subcontractor") return (entityList.subcontractors ?? []).map((s: any) => ({ id: s.id, label: s.label }));
    if (entityType === "client") return (entityList.clients ?? []).map((c: any) => ({ id: c.id, label: c.label }));
    if (entityType === "driver") return (entityList.drivers ?? []).map((d: any) => ({ id: d.id, label: d.label }));
    return [];
  })();

  const metricOptions = getMetricOptions(entityType);
  const activeMetricOpt = metricOptions.find((m) => m.key === analyticMetric) ?? metricOptions[0];

  const comparisonChartData = (entityAnalytics?.entities ?? []).map((ent: any, i: number) => ({
    name: ent.name,
    value: ent.metrics?.[activeMetricOpt?.key ?? "tripsCompleted"] ?? 0,
    color: ENTITY_COLORS[i],
  }));

  const trendChartData = (() => {
    const entities = entityAnalytics?.entities ?? [];
    if (entities.length === 0) return [];
    const allMonths = Array.from(new Set(entities.flatMap((e: any) => (e.trend ?? []).map((t: any) => t.month)))).sort();
    return allMonths.map((month) => {
      const row: any = { month };
      entities.forEach((ent: any, i: number) => {
        const found = (ent.trend ?? []).find((t: any) => t.month === month);
        row[ent.name] = found?.value ?? 0;
      });
      return row;
    });
  })();

  const handleExport = () => {
    const sheets: { name: string; data: Record<string, unknown>[] }[] = [];

    if (analytics?.commissionByPeriod) {
      sheets.push({
        name: "Commission Trend",
        data: analytics.commissionByPeriod.map((p: any) => ({ Period: p.label, Commission: p.commission, Revenue: p.revenue })),
      });
    }
    if (analytics?.revenueByRoute) {
      sheets.push({
        name: "Revenue by Route",
        data: analytics.revenueByRoute.map((r: any) => ({ Route: r.route, Revenue: r.revenue, Commission: r.commission, Trips: r.trips })),
      });
    }
    if (analytics?.revenueByClient) {
      sheets.push({
        name: "Revenue by Client",
        data: analytics.revenueByClient.map((c: any) => ({ Client: c.clientName, Revenue: c.revenue, Commission: c.commission })),
      });
    }
    if (commissionData?.commissionBySubcontractor) {
      sheets.push({
        name: "Top Subcontractors",
        data: commissionData.commissionBySubcontractor.map((s: any) => ({ Subcontractor: s.subcontractorName, "Commission Rate": `${s.commissionRate}%`, "Commission": s.commission, Trips: s.trips })),
      });
    }

    if (sheets.length) exportMultiSheet(sheets, `reports-${period}`);
  };

  return (
    <Layout>
      <PageHeader
        title="P&L & Reports"
        subtitle="Profit & loss, revenue analytics and commission reporting"
        actions={
          <>
            {activeReport === "pnl" ? (
              <>
                {/* Period type */}
                <Select value={pnlPeriodType} onValueChange={setPnlPeriodType}>
                  <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{PERIOD_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
                {/* Month picker — only for monthly */}
                {pnlPeriodType === "month" && (
                  <Select value={String(pnlMonth)} onValueChange={(v) => setPnlMonth(Number(v))}>
                    <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {/* Quarter picker — only for quarterly */}
                {pnlPeriodType === "quarter" && (
                  <Select value={String(pnlQuarter)} onValueChange={(v) => setPnlQuarter(Number(v))}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{QUARTERS.map((q) => <SelectItem key={q.value} value={String(q.value)}>{q.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {/* Year picker */}
                <Select value={String(pnlYear)} onValueChange={(v) => setPnlYear(Number(v))}>
                  <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </>
            ) : (
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIOD_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          </>
        }
      />
      <PageContent>
        {/* Print-only header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {activeReport === "pnl" && "Profit & Loss Report"}
            {activeReport === "analytics" && "Revenue Analytics Report"}
            {activeReport === "commission" && "Commission Report"}
            {activeReport === "entities" && "Entity Analytics Report"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Period: {activeReport === "pnl"
              ? periodLabel(pnlPeriodType, pnlYear, pnlMonth, pnlQuarter)
              : period === "month" ? "This Month" : period === "quarter" ? "This Quarter" : "This Year"
            } · Printed {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Tab */}
        <div className="print:hidden flex flex-wrap gap-1 mb-6 bg-secondary/50 p-1 rounded-lg w-fit">
          {[{ id: "pnl", label: "Profit & Loss" }, { id: "analytics", label: "Revenue Analytics" }, { id: "commission", label: "Commission" }, { id: "entities", label: "Entity Analytics" }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveReport(tab.id as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeReport === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeReport === "pnl" && (
          <div className="space-y-5">
            {pnlLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading P&L...</div>
            ) : !pnl ? (
              <div className="text-center py-16 text-muted-foreground">No data available</div>
            ) : (
              <>
                {/* KPI cards */}
                {(() => {
                  const p = pnl as any;
                  const netProfit = p.netProfit ?? 0;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Gross Revenue", value: p.totalGrossRevenue ?? 0, sub: "Total billed to clients", color: "text-foreground", Icon: TrendingUp },
                        { label: "Commission Earned", value: p.totalCommission ?? 0, sub: "Our income from trips", color: "text-primary", Icon: TrendingUp },
                        { label: "Company Overheads", value: p.totalCompanyOverheads ?? 0, sub: "Office, admin & staff costs", color: "text-orange-400", Icon: TrendingDown },
                        { label: "Net Profit / Loss", value: netProfit, sub: "Commission minus overheads", color: netProfit >= 0 ? "text-green-400" : "text-destructive", Icon: netProfit >= 0 ? TrendingUp : TrendingDown },
                      ].map((item) => (
                        <div key={item.label} className="bg-card border border-border rounded-xl p-5">
                          <div className="flex items-center gap-2 mb-1">
                            <item.Icon className={`w-3.5 h-3.5 ${item.color}`} />
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                          </div>
                          <p className={`text-xl font-bold ${item.color} mb-0.5`}>{formatCurrency(item.value)}</p>
                          <p className="text-[11px] text-muted-foreground/60">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Income Statement — simplified */}
                {(() => {
                  const p = pnl as any;
                  const commission = p.totalCommission ?? 0;
                  const grossRev = p.totalGrossRevenue ?? 0;
                  const subShort = p.totalSubShortPenalties ?? 0;
                  const clientShort = p.totalClientShortCredits ?? 0;
                  const netShort = p.netShortIncome ?? (p.totalShortCharges ?? 0);
                  const totalIncome = p.totalCompanyIncome ?? (commission + netShort);
                  const overheads = p.totalCompanyOverheads ?? 0;
                  const netProfit = p.netProfit ?? 0;
                  const avgCommRate = grossRev > 0 ? ((commission / grossRev) * 100).toFixed(1) : "0";
                  return (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">Income Statement</h3>
                        <span className="text-xs text-muted-foreground">{periodLabel(pnlPeriodType, pnlYear, pnlMonth, pnlQuarter)}</span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {/* Commission */}
                        <div className="px-5 py-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Commission Earned</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {avgCommRate}% avg commission on {formatCurrency(grossRev)} gross revenue
                            </p>
                          </div>
                          <p className="text-base font-bold text-primary tabular-nums shrink-0">{formatCurrency(commission)}</p>
                        </div>

                        {/* Short Charge Income */}
                        <div className="px-5 py-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Short Charge Income</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatCurrency(subShort)} collected from subs
                              {clientShort > 0 ? ` − ${formatCurrency(clientShort)} credited to clients` : ""}
                            </p>
                          </div>
                          <p className={`text-base font-bold tabular-nums shrink-0 ${netShort >= 0 ? "text-green-400" : "text-destructive"}`}>
                            {netShort >= 0 ? "+" : "−"}{formatCurrency(Math.abs(netShort))}
                          </p>
                        </div>

                        {/* Total income separator */}
                        <div className="px-5 py-3 flex items-center justify-between bg-secondary/30">
                          <p className="text-sm font-semibold text-foreground">Total Company Income</p>
                          <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(totalIncome)}</p>
                        </div>

                        {/* Overheads */}
                        <div className="px-5 py-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Company Overheads</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Office, admin & other operating costs</p>
                          </div>
                          <p className="text-base font-bold text-orange-400 tabular-nums shrink-0">−{formatCurrency(overheads)}</p>
                        </div>

                        {/* Net profit */}
                        <div className={`px-5 py-4 flex items-center justify-between ${netProfit >= 0 ? "bg-green-500/5" : "bg-destructive/5"}`}>
                          <p className="text-base font-bold text-foreground">Net Profit / Loss</p>
                          <p className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? "text-green-400" : "text-destructive"}`}>
                            {netProfit >= 0 ? "" : "−"}{formatCurrency(Math.abs(netProfit))}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Monthly trend */}
                {Array.isArray((pnl as any).commissionByMonth) && (pnl as any).commissionByMonth.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Monthly Trend</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-5 py-2 text-left text-xs text-muted-foreground">Period</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Commission</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Trip Expenses</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Driver Salaries</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Overheads</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pnl as any).commissionByMonth.map((row: any) => (
                          <tr key={row.label} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            <td className="px-5 py-3 text-foreground font-medium">{row.label}</td>
                            <td className="px-5 py-3 text-right text-primary">{formatCurrency(row.commission)}</td>
                            <td className="px-5 py-3 text-right text-orange-400">{formatCurrency(row.tripExpenses ?? 0)}</td>
                            <td className="px-5 py-3 text-right text-yellow-500">{formatCurrency(row.driverSalaries ?? 0)}</td>
                            <td className="px-5 py-3 text-right text-red-400">{formatCurrency(row.overheads ?? 0)}</td>
                            <td className={`px-5 py-3 text-right font-bold ${row.netProfit >= 0 ? "text-green-400" : "text-destructive"}`}>{formatCurrency(row.netProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Revenue by client */}
                {Array.isArray((pnl as any).byClient) && (pnl as any).byClient.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Revenue by Client</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border">
                        <th className="px-5 py-2 text-left text-xs text-muted-foreground">Client</th>
                        <th className="px-5 py-2 text-right text-xs text-muted-foreground">Trips</th>
                        <th className="px-5 py-2 text-right text-xs text-muted-foreground">Gross Revenue</th>
                        <th className="px-5 py-2 text-right text-xs text-muted-foreground">Commission</th>
                      </tr></thead>
                      <tbody>
                        {(pnl as any).byClient.map((c: any) => (
                          <tr key={c.name} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{c.trips}</td>
                            <td className="px-5 py-3 text-right text-foreground">{formatCurrency(c.gross)}</td>
                            <td className="px-5 py-3 text-right text-primary font-medium">{formatCurrency(c.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Expenses by category */}
                {Array.isArray((pnl as any).expensesByCategory) && (pnl as any).expensesByCategory.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {["overhead", "trip"].map((type) => {
                      const rows = (pnl as any).expensesByCategory.filter((r: any) => r.type === type);
                      if (!rows.length) return null;
                      return (
                        <div key={type} className="bg-card border border-border rounded-xl overflow-hidden">
                          <div className="px-5 py-4 border-b border-border">
                            <h3 className="text-sm font-semibold text-foreground">{type === "overhead" ? "Company Overheads by Category" : "Trip Expenses by Category"}</h3>
                          </div>
                          <table className="w-full text-sm">
                            <tbody>
                              {rows.map((row: any) => (
                                <tr key={row.category} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                                  <td className="px-5 py-3 text-muted-foreground capitalize">{String(row.category).replace(/_/g, " ")}</td>
                                  <td className="px-5 py-3 text-right text-destructive font-medium">{formatCurrency(row.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Commission by subcontractor */}
                {Array.isArray(commissionData?.commissionBySubcontractor) && commissionData.commissionBySubcontractor.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Commission by Subcontractor</h3>
                      <span className="text-xs text-muted-foreground">{commissionData.commissionBySubcontractor.length} subcontractors</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-5 py-2 text-left text-xs text-muted-foreground">Subcontractor</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Rate</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Trips</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Gross Revenue</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Commission Earned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionData.commissionBySubcontractor.map((s: any) => (
                          <tr key={s.subcontractorName} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            <td className="px-5 py-3 font-medium text-foreground">{s.subcontractorName}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{s.commissionRate}%</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{s.trips}</td>
                            <td className="px-5 py-3 text-right text-foreground">{formatCurrency(s.grossRevenue)}</td>
                            <td className="px-5 py-3 text-right text-primary font-medium">{formatCurrency(s.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Revenue by route */}
                {Array.isArray(analytics?.revenueByRoute) && analytics.revenueByRoute.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Profitability by Route</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-5 py-2 text-left text-xs text-muted-foreground">Route</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Trips</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Revenue</th>
                          <th className="px-5 py-2 text-right text-xs text-muted-foreground">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.revenueByRoute.map((r: any) => (
                          <tr key={r.route} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            <td className="px-5 py-3 font-medium text-foreground">{r.route}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{r.trips}</td>
                            <td className="px-5 py-3 text-right text-foreground">{formatCurrency(r.revenue)}</td>
                            <td className="px-5 py-3 text-right text-primary font-medium">{formatCurrency(r.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeReport === "analytics" && (
          <div className="space-y-6">
            {analyticsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
            ) : (
              <>
                {/* Commission Trend */}
                {analytics?.commissionByPeriod && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Commission & Revenue Trend</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={analytics.commissionByPeriod}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00bcd4" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#00bcd4" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="commGrad2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4caf50" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }} />
                        <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                        <Area type="monotone" dataKey="revenue" stroke="#00bcd4" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                        <Area type="monotone" dataKey="commission" stroke="#4caf50" fill="url(#commGrad2)" strokeWidth={2} name="Commission" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Route */}
                  {analytics?.revenueByRoute && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-4">Revenue by Route</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={analytics.revenueByRoute}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                          <XAxis dataKey="route" tick={{ fontSize: 9, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => getRouteChart(v)} />
                          <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                          <Bar dataKey="revenue" fill="#00bcd4" radius={[4, 4, 0, 0]} name="Revenue" />
                          <Bar dataKey="commission" fill="#4caf50" radius={[4, 4, 0, 0]} name="Commission" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* By Client Pie */}
                  {analytics?.revenueByClient && analytics.revenueByClient.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-4">Revenue by Client</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={analytics.revenueByClient}
                            dataKey="revenue"
                            nameKey="clientName"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ clientName, percent }: any) => `${clientName} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {analytics.revenueByClient.map((_: any, index: number) => (
                              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Short Charge Trend */}
                {analytics?.shortChargeTrend && analytics.shortChargeTrend.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Short Charges & Losses Trend</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={analytics.shortChargeTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }} />
                        <YAxis tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                        <Bar dataKey="totalShortCharge" fill="#ff9800" radius={[4, 4, 0, 0]} name="Short Charges" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeReport === "commission" && (
          <div className="space-y-6">
            {commLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading commission report...</div>
            ) : !commissionData ? (
              <div className="text-center py-12 text-muted-foreground">No commission data available</div>
            ) : (
              <>
                {/* Summary Boxes */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Commission", value: formatCurrency(commissionData.totalCommission) },
                    { label: "Total Gross Revenue", value: formatCurrency(commissionData.totalGrossRevenue) },
                    { label: "Avg Commission Rate", value: `${commissionData.avgCommissionRate?.toFixed(2) ?? 0}%` },
                    { label: "Total Trips", value: commissionData.totalTrips ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="bg-card border border-border rounded-xl p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <p className="text-xl font-bold text-foreground mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* By Subcontractor */}
                {commissionData.commissionBySubcontractor && commissionData.commissionBySubcontractor.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Commission by Subcontractor</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-secondary/50">
                        {["Subcontractor", "Commission Rate", "Gross Revenue", "Commission Earned", "Net Payable to Sub", "Trips"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {commissionData.commissionBySubcontractor.map((s: any) => (
                          <tr key={s.subcontractorName} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                            <td className="px-4 py-3 font-medium text-foreground">{s.subcontractorName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{s.commissionRate}%</td>
                            <td className="px-4 py-3 text-foreground">{formatCurrency(s.grossRevenue)}</td>
                            <td className="px-4 py-3 text-primary font-semibold">{formatCurrency(s.commission)}</td>
                            <td className="px-4 py-3 text-green-400 font-medium">{formatCurrency(s.netPayable ?? 0)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{s.trips}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Commission by Client */}
                {Array.isArray((commissionData as any)?.commissionByClient) && (commissionData as any).commissionByClient.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Commission by Client</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-secondary/50">
                        {["Client", "Trips", "Gross Revenue", "Effective Rate", "Commission Earned"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(commissionData as any).commissionByClient.map((c: any) => (
                          <tr key={c.clientName} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                            <td className="px-4 py-3 font-medium text-foreground">{c.clientName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{c.trips}</td>
                            <td className="px-4 py-3 text-foreground">{formatCurrency(c.grossRevenue)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{c.commissionRate}%</td>
                            <td className="px-4 py-3 text-primary font-semibold">{formatCurrency(c.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Also add Batch breakdown */}
                {Array.isArray(commissionData?.commissionByBatch) && commissionData.commissionByBatch.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Commission by Batch</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-secondary/50">
                        {["Batch", "Client", "Route", "Gross Revenue", "Commission"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {commissionData.commissionByBatch.map((b: any) => (
                          <tr key={b.batchName} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                            <td className="px-4 py-3 font-medium text-foreground">{b.batchName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{b.clientName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{b.route}</td>
                            <td className="px-4 py-3 text-foreground">{formatCurrency(b.grossRevenue)}</td>
                            <td className="px-4 py-3 text-primary font-semibold">{formatCurrency(b.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Trip-Level Commission Breakdown ── */}
                {breakdownLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Loading breakdown…</div>
                ) : Array.isArray((breakdown as any)?.trips) && (breakdown as any).trips.length > 0 && (() => {
                  const trips = (breakdown as any).trips as any[];
                  const shortTrips = trips.filter((t) => t.chargeableShort != null && t.chargeableShort > 0);

                  return (
                    <div className="space-y-5">
                      {/* Commission breakdown per trip */}
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Commission Breakdown — Per Trip</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Commission = Loaded Qty × Rate/MT × Commission %
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">{trips.length} trips</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-secondary/50">
                                {["Trip #", "Batch", "Route", "Truck / Sub", "Product", "Loaded (MT)", "Rate/MT", "Gross Rev.", "Comm %", "Commission"].map((h) => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {trips.map((t: any) => (
                                <tr key={t.tripId} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{t.tripId}</td>
                                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{t.batchName}</td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{String(t.route).replace(/_/g, " ")}</td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="font-medium text-foreground">{t.truckPlate}</span>
                                    {t.subcontractorName && <span className="block text-xs text-muted-foreground">{t.subcontractorName}</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.product === "AGO" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"}`}>{t.product}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(t.loadedQty ?? 0)}</td>
                                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">${(t.ratePerMt ?? 0).toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatCurrency(t.grossRevenue)}</td>
                                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{(t.commissionRatePct ?? 0).toFixed(1)}%</td>
                                  <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">{formatCurrency(t.commission ?? 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-border bg-secondary/30">
                                <td colSpan={9} className="px-4 py-3 font-semibold text-foreground text-right">Total Commission</td>
                                <td className="px-4 py-3 text-right font-bold text-primary tabular-nums">
                                  {formatCurrency(trips.reduce((s: number, t: any) => s + (t.commission ?? 0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Short Charge Income breakdown — only shown if any trip has chargeable short */}
                      {shortTrips.length > 0 && (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                          <div className="px-5 py-4 border-b border-border">
                            <h3 className="text-sm font-semibold text-foreground">Short Charge Income — Per Trip</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Chargeable short = Short Qty − Allowance. Sub penalty deducted from sub; client credit owed to client.
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border bg-secondary/50">
                                  {["Trip #", "Batch", "Short MT", "Allowance MT", "Chargeable MT", "Sub Rate", "Sub Penalty", "Client Rate", "Client Credit", "Net Income"].map((h) => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {shortTrips.map((t: any) => {
                                  const net = (t.netShortIncome ?? 0);
                                  return (
                                    <tr key={t.tripId} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{t.tripId}</td>
                                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{t.batchName}</td>
                                      <td className="px-4 py-3 text-right text-orange-400 tabular-nums">{formatNumber(t.shortQty ?? 0)}</td>
                                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                                        {formatNumber(t.allowanceQty ?? 0)}
                                        <span className="text-xs text-muted-foreground/60 ml-1">({t.allowancePct ?? 0}%)</span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">{formatNumber(t.chargeableShort ?? 0)}</td>
                                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">${(t.subShortChargeRate ?? 0).toFixed(2)}/MT</td>
                                      <td className="px-4 py-3 text-right text-green-400 font-medium tabular-nums">+{formatCurrency(t.subPenalty ?? 0)}</td>
                                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">${(t.clientShortChargeRate ?? 0).toFixed(2)}/MT</td>
                                      <td className="px-4 py-3 text-right text-destructive font-medium tabular-nums">−{formatCurrency(t.clientCredit ?? 0)}</td>
                                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${net >= 0 ? "text-green-400" : "text-destructive"}`}>
                                        {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-border bg-secondary/30">
                                  <td colSpan={6} className="px-4 py-3 font-semibold text-foreground text-right">Totals</td>
                                  <td className="px-4 py-3 text-right font-bold text-green-400 tabular-nums">
                                    +{formatCurrency(shortTrips.reduce((s: number, t: any) => s + (t.subPenalty ?? 0), 0))}
                                  </td>
                                  <td />
                                  <td className="px-4 py-3 text-right font-bold text-destructive tabular-nums">
                                    −{formatCurrency(shortTrips.reduce((s: number, t: any) => s + (t.clientCredit ?? 0), 0))}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-green-400 tabular-nums">
                                    +{formatCurrency(shortTrips.reduce((s: number, t: any) => s + (t.netShortIncome ?? 0), 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
        {/* Entity Analytics Tab */}
        {activeReport === "entities" && (
          <div className="space-y-5">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Entity type selector */}
              <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg">
                {ENTITY_TYPES.map((et) => (
                  <button key={et.id}
                    onClick={() => { setEntityType(et.id); setSelectedEntityIds([]); setAnalyticMetric(getMetricOptions(et.id)[0]?.key ?? ""); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${entityType === et.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <et.icon className="w-3.5 h-3.5" />{et.label}
                  </button>
                ))}
              </div>
              {/* Period selector */}
              <Select value={entityPeriod} onValueChange={setEntityPeriod}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{ENTITY_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Two-pane layout */}
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-start">
              {/* Entity picker */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">Select {ENTITY_TYPES.find((e) => e.id === entityType)?.label}</h4>
                  <span className="text-xs text-muted-foreground">{selectedEntityIds.length}/4</span>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {entityOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
                  ) : entityOptions.map((opt, i) => {
                    const isSelected = selectedEntityIds.includes(opt.id);
                    const colorIdx = selectedEntityIds.indexOf(opt.id);
                    return (
                      <button key={opt.id} onClick={() => toggleEntity(opt.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0 border-2"
                          style={{ backgroundColor: isSelected ? ENTITY_COLORS[colorIdx] : "transparent", borderColor: isSelected ? ENTITY_COLORS[colorIdx] : "hsl(var(--border))" }} />
                        <span className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{opt.label}</span>
                          {opt.sub && <span className="text-xs text-muted-foreground/70 truncate block">{opt.sub}</span>}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                {selectedEntityIds.length > 0 && (
                  <button onClick={() => setSelectedEntityIds([])}
                    className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                    Clear selection
                  </button>
                )}
              </div>

              {/* Results */}
              {selectedEntityIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground bg-card border border-border rounded-xl">
                  <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">Select up to 4 {ENTITY_TYPES.find((e) => e.id === entityType)?.label?.toLowerCase()} to compare</p>
                </div>
              ) : entityLoading ? (
                <div className="flex items-center justify-center py-24 text-muted-foreground bg-card border border-border rounded-xl">
                  <p className="text-sm">Loading analytics...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Metric selector */}
                  <div className="flex flex-wrap gap-2">
                    {metricOptions.map((m) => (
                      <button key={m.key} onClick={() => setAnalyticMetric(m.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${analyticMetric === m.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Comparison bar chart */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">
                      {activeMetricOpt?.label} Comparison
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={comparisonChartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
                        <XAxis type="number" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [activeMetricOpt?.format ? activeMetricOpt.format(v) : v, activeMetricOpt?.label]} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={32}>
                          {comparisonChartData.map((entry, i) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Entity metric cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(entityAnalytics?.entities ?? []).map((ent: any, i: number) => (
                      <div key={ent.id} className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-border flex items-center gap-2.5" style={{ borderLeftWidth: 3, borderLeftColor: ENTITY_COLORS[i] }}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{ent.name}</p>
                            {ent.subName && <p className="text-xs text-muted-foreground">{ent.subName}</p>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0">
                          {getMetricRows(entityType, ent.metrics ?? {}).map((row, j) => (
                            <div key={row.label} className={`px-4 py-2.5 ${j % 2 === 0 ? "border-r border-border/50" : ""} ${j < getMetricRows(entityType, ent.metrics ?? {}).length - 2 ? "border-b border-border/50" : ""}`}>
                              <p className="text-[11px] text-muted-foreground mb-0.5">{row.label}</p>
                              <p className="text-sm font-semibold text-foreground">{row.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Monthly trend chart */}
                  {trendChartData.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Trend</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={trendChartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                          <XAxis dataKey="month" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
                          {(entityAnalytics?.entities ?? []).map((ent: any, i: number) => (
                            <Line key={ent.name} type="monotone" dataKey={ent.name} stroke={ENTITY_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
