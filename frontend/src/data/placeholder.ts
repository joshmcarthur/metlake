/**
 * Structural placeholders so the scaffold renders the same shapes as
 * `frontend/prototypes/`. Every value here is replaced by DuckDB-WASM queries
 * against `/data/` in a later task — none of it is real performance data.
 */

export interface RouteRef {
  route: string;
  name: string;
}

export const PLACEHOLDER_ROUTES: RouteRef[] = [
  { route: "83", name: "Eastbourne — Lower Hutt — Petone — Wellington" },
  { route: "2", name: "Karori South — Wellington" },
  { route: "60", name: "Porirua — Tawa — Johnsonville" },
  { route: "N1", name: "After Midnight · Island Bay" },
  { route: "1", name: "Island Bay — Wellington — Grenada North" },
  { route: "110", name: "Upper Hutt — Petone — Wellington" },
];

export function findRoute(route: string): RouteRef {
  return PLACEHOLDER_ROUTES.find((entry) => entry.route === route) ?? { route, name: "" };
}

/** Leaderboard slots — ordering comes from the query layer once it exists. */
export const BEST_ROUTES: RouteRef[] = ["2", "60", "N1"].map(findRoute);
export const ATTENTION_ROUTES: RouteRef[] = ["83", "1", "110"].map(findRoute);

export const PLACEHOLDER_PERIOD = {
  from: "2026-08-01",
  to: "2026-08-12",
  label: "1 Aug 2026 → 12 Aug 2026 · NZST",
} as const;

export interface Tile {
  kicker: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
}

const AWAITING_DATA = "—";

export const NETWORK_TILES: Tile[] = [
  { kicker: "Reliability", value: AWAITING_DATA, delta: "— vs prior", trend: "flat" },
  { kicker: "Punctuality", value: AWAITING_DATA, delta: "— vs prior", trend: "flat" },
  { kicker: "Cancellations", value: AWAITING_DATA, delta: "— vs prior", trend: "flat" },
  { kicker: "Scheduled trips", value: AWAITING_DATA, delta: "— vs prior", trend: "flat" },
];

export const ROUTE_TILES: Tile[] = [
  { kicker: "Punctuality", value: AWAITING_DATA, delta: "— vs prior month", trend: "flat" },
  { kicker: "Reliability", value: AWAITING_DATA, delta: "— vs prior month", trend: "flat" },
  { kicker: "Cancellations", value: AWAITING_DATA, delta: "— vs prior month", trend: "flat" },
  { kicker: "Mean departure variance", value: AWAITING_DATA, delta: "— vs prior month", trend: "flat" },
];

export const RECOVERY_TILES: Tile[] = [
  { kicker: "Recovered", value: AWAITING_DATA, delta: "of mid-route late trips", trend: "flat" },
  { kicker: "Stayed late", value: AWAITING_DATA, delta: "finished >2.5 min late", trend: "flat" },
  { kicker: "Got worse", value: AWAITING_DATA, delta: "delay grew after midpoint", trend: "flat" },
  { kicker: "RT coverage", value: AWAITING_DATA, delta: "scheduled trips with updates", trend: "flat" },
];
