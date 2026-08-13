import {
  LATE_TRIPS_VIEW,
  registerLateTripsMonths,
  type DuckDbConnection,
} from "./duckdb";
import {
  fetchLateTripsManifest,
  monthsIntersectingPeriod,
} from "./manifest";
import type { DateRange, DelayRange } from "./types";

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function ensureLateTripsView(
  conn: DuckDbConnection,
  range: DateRange,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const manifest = await fetchLateTripsManifest(fetchFn);
  if (!manifest) return false;

  const months = monthsIntersectingPeriod(manifest.months, range.from, range.to);
  if (months.length === 0) return false;

  await registerLateTripsMonths(conn, months);
  return true;
}

export async function getDelayRange(
  conn: DuckDbConnection,
  range: DateRange,
  route?: string,
): Promise<DelayRange | null> {
  let routeFilter = "";
  if (route) {
    const safeRoute = route.replace(/'/g, "''");
    routeFilter = `AND (route = '${safeRoute}' OR CAST(route_id AS VARCHAR) = '${safeRoute}')`;
  }

  const result = await conn.query(`
    SELECT
      MIN(delay_seconds) AS least_seconds,
      MEDIAN(delay_seconds) AS typical_seconds,
      quantile_cont(delay_seconds, 0.95) AS most_seconds,
      COUNT(*)::INTEGER AS late_trips
    FROM ${LATE_TRIPS_VIEW}
    WHERE day >= DATE '${range.from}'
      AND day <= DATE '${range.to}'
      ${routeFilter};
  `);

  const row = result.toArray()[0];
  const lateTrips = toNullableNumber(row?.late_trips) ?? 0;
  if (lateTrips === 0) return null;

  return {
    least_seconds: toNullableNumber(row?.least_seconds),
    typical_seconds: toNullableNumber(row?.typical_seconds),
    most_seconds: toNullableNumber(row?.most_seconds),
    late_trips: lateTrips,
  };
}
