/** Route shown as a fallback sample in Query SQL when none is selected yet. */
export const DEFAULT_ROUTE = "83";

/** Query page URL, optionally scoped to a route for the sample SQL. */
export function queryPageHref(route?: string): string {
  const trimmed = route?.trim() ?? "";
  if (!trimmed || trimmed === "__any__") {
    return "/query/";
  }
  return `/query/?route=${encodeURIComponent(trimmed)}`;
}

/** Route code from `/query/?route=…`, if present. */
export function routeFromQuerySearch(search: string): string | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const route = params.get("route")?.trim();
  return route || undefined;
}

/** Historical map replay URL for an Overview (or custom) period. */
export function replayPageHref(opts: {
  from: string;
  to: string;
  t?: string;
  /** Reserved for a later route filter; ignored by replay today. */
  route?: string;
}): string {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);
  if (opts.t) params.set("t", opts.t);
  const route = opts.route?.trim();
  if (route && route !== "__any__") {
    params.set("route", route);
  }
  return `/replay/?${params.toString()}`;
}

/** Archive files are served by Caddy from the mounted archive, outside the Astro build. */
export const DATA_ROOT = "/data/";

export const BRAND_TAGLINE =
  "Open-source data lake of historical Metlink performance data you can explore, compare and download.";

export type NavKey = "overview" | "route" | "query" | "replay";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

/** Primary text links only — Route uses a dialog opened from the header. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "query", label: "Query", href: "/query/" },
  { key: "replay", label: "Replay", href: "/replay/" },
];

export type AttributionKey = keyof typeof ATTRIBUTION;

export const ATTRIBUTION = {
  network:
    "Performance figures originate from Metlink / Greater Wellington Regional Council open data (typically CC-BY-4.0). Metlake is independent and unaffiliated.",
  route: "Metlink / GWRC open data. Metlake is independent and unaffiliated.",
  deep: "Built from Metlink open GTFS / GTFS-RT captures. Metlake is independent and unaffiliated.",
} as const;
