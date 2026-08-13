import {
  registerDelayInjectorsMonths,
  registerHourHeatMonths,
  registerStopProfileMonths,
  type DuckDbConnection,
} from "./duckdb";
import {
  fetchDelayInjectorsManifest,
  fetchHourHeatManifest,
  fetchStopProfileManifest,
  monthsIntersectingPeriod,
} from "./manifest";
import type { DateRange } from "./types";

export function directionIdFromChip(direction: "inbound" | "outbound"): number {
  return direction === "inbound" ? 1 : 0;
}

export async function ensureAnatomyViews(
  conn: DuckDbConnection,
  range: DateRange,
  fetchFn: typeof fetch = fetch,
): Promise<{ profile: boolean; injectors: boolean; hourHeat: boolean }> {
  const [profileManifest, injectorsManifest, hourHeatManifest] = await Promise.all([
    fetchStopProfileManifest(fetchFn),
    fetchDelayInjectorsManifest(fetchFn),
    fetchHourHeatManifest(fetchFn),
  ]);

  let profile = false;
  let injectors = false;
  let hourHeat = false;

  if (profileManifest) {
    const months = monthsIntersectingPeriod(
      profileManifest.months,
      range.from,
      range.to,
    );
    if (months.length > 0) {
      await registerStopProfileMonths(conn, months);
      profile = true;
    }
  }

  if (injectorsManifest) {
    const months = monthsIntersectingPeriod(
      injectorsManifest.months,
      range.from,
      range.to,
    );
    if (months.length > 0) {
      await registerDelayInjectorsMonths(conn, months);
      injectors = true;
    }
  }

  if (hourHeatManifest) {
    const months = monthsIntersectingPeriod(
      hourHeatManifest.months,
      range.from,
      range.to,
    );
    if (months.length > 0) {
      await registerHourHeatMonths(conn, months);
      hourHeat = true;
    }
  }

  return { profile, injectors, hourHeat };
}
