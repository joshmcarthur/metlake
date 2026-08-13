import type { RouteCatalogEntry } from "./types";

export type RouteModeGroup = "Bus" | "Train" | "Ferry" | "Cable car" | "Other";

export const MODE_GROUP_ORDER: readonly RouteModeGroup[] = [
  "Bus",
  "Train",
  "Ferry",
  "Cable car",
  "Other",
];

export interface GroupedRoutes {
  group: RouteModeGroup;
  routes: RouteCatalogEntry[];
}

export function modeGroupFor(routeType: number | null): RouteModeGroup {
  switch (routeType) {
    case 3:
      return "Bus";
    case 2:
      return "Train";
    case 4:
      return "Ferry";
    case 5:
      return "Cable car";
    default:
      return "Other";
  }
}

export function routeCode(entry: RouteCatalogEntry): string {
  return entry.route_short_name ?? entry.route;
}

export function filterRoutes(
  routes: readonly RouteCatalogEntry[],
  query: string,
): RouteCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...routes];
  return routes.filter((entry) => {
    const id = routeCode(entry).toLowerCase();
    const name = (entry.route_long_name ?? "").toLowerCase();
    return id.includes(q) || name.includes(q) || entry.route.toLowerCase().includes(q);
  });
}

export function groupRoutes(routes: readonly RouteCatalogEntry[]): GroupedRoutes[] {
  const buckets = new Map<RouteModeGroup, RouteCatalogEntry[]>();
  for (const group of MODE_GROUP_ORDER) {
    buckets.set(group, []);
  }
  for (const entry of routes) {
    const group = modeGroupFor(entry.route_type);
    buckets.get(group)?.push(entry);
  }
  return MODE_GROUP_ORDER.map((group) => ({
    group,
    routes: buckets.get(group) ?? [],
  })).filter((section) => section.routes.length > 0);
}
