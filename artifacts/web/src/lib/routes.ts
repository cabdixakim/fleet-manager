export interface RouteConfig {
  value: string;
  label: string;
  short: string;
  chart: string;
}

export const ROUTES: RouteConfig[] = [
  { value: "dar_to_lubumbashi",   label: "Dar es Salaam → Lubumbashi", short: "Dar → Lub",          chart: "Dar→Lbm"   },
  { value: "beira_to_lubumbashi", label: "Beira → Lubumbashi",         short: "Beira → Lub",        chart: "Beira→Lbm" },
  { value: "ndola_lubumbashi",    label: "Ndola → Lubumbashi",         short: "Ndola → Lub",        chart: "Ndola→Lbm" },
  { value: "lusaka_lubumbashi",   label: "Lusaka → Lubumbashi",        short: "Lusaka → Lub",       chart: "Lsk→Lbm"   },
  { value: "dar_lusaka",          label: "Dar es Salaam → Lusaka",     short: "Dar → Lusaka",       chart: "Dar→Lsk"   },
  { value: "beira_lusaka",        label: "Beira → Lusaka",             short: "Beira → Lusaka",     chart: "Beira→Lsk" },
  { value: "durban_lusaka",       label: "Durban → Lusaka",            short: "Durban → Lusaka",    chart: "Dur→Lsk"   },
  { value: "ndola_kolwezi",       label: "Ndola → Kolwezi",            short: "Ndola → Kolwezi",    chart: "Ndl→Klw"   },
  { value: "lusaka_kolwezi",      label: "Lusaka → Kolwezi",           short: "Lusaka → Kolwezi",   chart: "Lsk→Klw"   },
];

const LABEL_MAP: Record<string, string> = Object.fromEntries(ROUTES.map((r) => [r.value, r.label]));
const SHORT_MAP: Record<string, string> = Object.fromEntries(ROUTES.map((r) => [r.value, r.short]));
const CHART_MAP: Record<string, string> = Object.fromEntries(ROUTES.map((r) => [r.value, r.chart]));

export const getRouteLabel = (key: string): string => LABEL_MAP[key] ?? key;
export const getRouteShort = (key: string): string => SHORT_MAP[key] ?? key;
export const getRouteChart = (key: string): string => CHART_MAP[key] ?? key;

export const DEFAULT_ROUTE = ROUTES[0].value;
