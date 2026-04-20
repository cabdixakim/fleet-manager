export interface RouteConfig {
  value: string;
  label: string;
  short: string;
  chart: string;
}

export const STATIC_ROUTES: RouteConfig[] = [
  { value: "dar_to_lubumbashi",   label: "Dar es Salaam → Lubumbashi", short: "Dar → Lub",       chart: "Dar→Lbm"   },
  { value: "beira_to_lubumbashi", label: "Beira → Lubumbashi",         short: "Beira → Lub",     chart: "Beira→Lbm" },
  { value: "ndola_lubumbashi",    label: "Ndola → Lubumbashi",         short: "Ndola → Lub",     chart: "Ndola→Lbm" },
  { value: "lusaka_lubumbashi",   label: "Lusaka → Lubumbashi",        short: "Lusaka → Lub",    chart: "Lsk→Lbm"   },
  { value: "dar_lusaka",          label: "Dar es Salaam → Lusaka",     short: "Dar → Lusaka",    chart: "Dar→Lsk"   },
  { value: "beira_lusaka",        label: "Beira → Lusaka",             short: "Beira → Lusaka",  chart: "Beira→Lsk" },
  { value: "durban_lusaka",       label: "Durban → Lusaka",            short: "Durban → Lusaka", chart: "Dur→Lsk"   },
  { value: "ndola_kolwezi",       label: "Ndola → Kolwezi",            short: "Ndola → Kolwezi", chart: "Ndl→Klw"   },
  { value: "lusaka_kolwezi",      label: "Lusaka → Kolwezi",           short: "Lusaka → Kolwezi",chart: "Lsk→Klw"   },
];

// Keep ROUTES as an alias used by Batches.tsx before dynamic load
export const ROUTES = STATIC_ROUTES;

let _cache: Record<string, RouteConfig> = Object.fromEntries(STATIC_ROUTES.map(r => [r.value, r]));

export function initLanes(lanes: RouteConfig[]) {
  if (lanes.length > 0) {
    _cache = Object.fromEntries(lanes.map(r => [r.value, r]));
  }
}

export function getLanesSnapshot(): RouteConfig[] {
  return Object.values(_cache);
}

export const getRouteLabel = (key: string): string => _cache[key]?.label ?? key;
export const getRouteShort = (key: string): string => _cache[key]?.short ?? key;
export const getRouteChart = (key: string): string => _cache[key]?.chart ?? key;

export const DEFAULT_ROUTE = STATIC_ROUTES[0].value;
