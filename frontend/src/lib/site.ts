/** Route shown as a fallback sample in Query SQL when none is selected yet. */
export const DEFAULT_ROUTE = "83";

/** Archive files are served by Caddy from the mounted archive, outside the Astro build. */
export const DATA_ROOT = "/data/";

export const BRAND_TAGLINE =
  "Historical Metlink performance you can explore, compare, and download.";

export type NavKey = "overview" | "route" | "query";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

/** Primary text links only — Route uses an inline picker in the header. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "query", label: "Query", href: "/query/" },
];

export type AttributionKey = keyof typeof ATTRIBUTION;

export const ATTRIBUTION = {
  network:
    "Performance figures originate from Metlink / Greater Wellington Regional Council open data (typically CC-BY-4.0). Metlake is independent and unaffiliated.",
  route: "Metlink / GWRC open data. Metlake is independent and unaffiliated.",
  deep: "Built from Metlink open GTFS / GTFS-RT captures. Metlake is independent and unaffiliated.",
} as const;
