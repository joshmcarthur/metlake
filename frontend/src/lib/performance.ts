import { monthsIntersectingPeriod } from "./manifest";
import { ROUTE_PERFORMANCE_VIEW, type DuckDbConnection } from "./duckdb";
import { RoutePerformanceSession } from "./session";
import type {
  DateRange,
  NetworkDailyPoint,
  PeriodSummary,
  RouteCatalogEntry,
  RouteDailyPoint,
  RouteLeaderboardRow,
} from "./types";

export interface LoadedRoutePerformance {
  conn: DuckDbConnection;
  range: DateRange;
  months: string[];
  session: RoutePerformanceSession;
  estimated: boolean;
}

function sqlTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === 1n || value === "true" || value === "1";
}

async function rangeHasRtSource(
  conn: DuckDbConnection,
  range: DateRange,
  priorRange?: DateRange | null,
): Promise<boolean> {
  const priorClause = priorRange
    ? `OR (day >= DATE '${priorRange.from}' AND day <= DATE '${priorRange.to}')`
    : "";
  const result = await conn.query(`
    SELECT COUNT(*) > 0 AS n
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE source = 'gtfs_rt'
      AND (
        (day >= DATE '${range.from}' AND day <= DATE '${range.to}')
        ${priorClause}
      );
  `);
  return sqlTruthy(firstRow(result)?.n);
}

export async function loadRoutePerformance(
  range: DateRange,
  session: RoutePerformanceSession,
  fetchFn: typeof fetch = fetch,
  priorRange?: DateRange | null,
): Promise<LoadedRoutePerformance> {
  const conn = await session.ensureRanges(range, fetchFn, priorRange);
  const manifest = session.getManifest();
  const monthSet = new Set(
    manifest ? monthsIntersectingPeriod(manifest.months, range.from, range.to) : [],
  );
  if (priorRange && manifest) {
    for (const month of monthsIntersectingPeriod(
      manifest.months,
      priorRange.from,
      priorRange.to,
    )) {
      monthSet.add(month);
    }
  }
  const months = [...monthSet].sort();
  const estimated = await rangeHasRtSource(conn, range, priorRange);
  return { conn, range, months, session, estimated };
}

export { RoutePerformanceSession } from "./session";

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function firstRow(table: { toArray(): Record<string, unknown>[] }): Record<string, unknown> | undefined {
  return table.toArray()[0];
}

export async function getRoutePeriodSummary(
  conn: DuckDbConnection,
  route: string,
  range: DateRange,
): Promise<PeriodSummary> {
  const safeRoute = route.replace(/'/g, "''");
  const result = await conn.query(`
    SELECT
      SUM(scheduled_trips) AS scheduled_trips,
      AVG(reliability) AS reliability,
      AVG(punctuality) AS punctuality,
      SUM(cancellations) AS cancellations,
      AVG(cancellations_rate) AS cancellations_rate,
      AVG(mean_departure_time_variance) AS mean_departure_time_variance
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE (route = '${safeRoute}' OR CAST(route_short_name AS VARCHAR) = '${safeRoute}')
      AND day >= DATE '${range.from}'
      AND day <= DATE '${range.to}';
  `);

  const row = firstRow(result);
  return {
    from: range.from,
    to: range.to,
    scheduled_trips: toNullableNumber(row?.scheduled_trips),
    reliability: toNullableNumber(row?.reliability),
    punctuality: toNullableNumber(row?.punctuality),
    cancellations: toNullableNumber(row?.cancellations),
    cancellations_rate: toNullableNumber(row?.cancellations_rate),
    mean_departure_time_variance: toNullableNumber(row?.mean_departure_time_variance),
  };
}

export async function getRouteLongName(
  conn: DuckDbConnection,
  route: string,
): Promise<string> {
  const safeRoute = route.replace(/'/g, "''");
  const result = await conn.query(`
    SELECT any_value(route_long_name) AS route_long_name
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE (route = '${safeRoute}' OR CAST(route_short_name AS VARCHAR) = '${safeRoute}');
  `);
  return toNullableString(firstRow(result)?.route_long_name)?.trim() ?? "";
}

export async function getPeriodSummary(
  conn: DuckDbConnection,
  range: DateRange,
): Promise<PeriodSummary> {
  const result = await conn.query(`
    SELECT
      SUM(scheduled_trips) AS scheduled_trips,
      AVG(reliability) AS reliability,
      AVG(punctuality) AS punctuality,
      SUM(cancellations) AS cancellations,
      AVG(cancellations_rate) AS cancellations_rate,
      AVG(mean_departure_time_variance) AS mean_departure_time_variance
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE day >= DATE '${range.from}'
      AND day <= DATE '${range.to}';
  `);

  const row = firstRow(result);
  return {
    from: range.from,
    to: range.to,
    scheduled_trips: toNullableNumber(row?.scheduled_trips),
    reliability: toNullableNumber(row?.reliability),
    punctuality: toNullableNumber(row?.punctuality),
    cancellations: toNullableNumber(row?.cancellations),
    cancellations_rate: toNullableNumber(row?.cancellations_rate),
    mean_departure_time_variance: toNullableNumber(row?.mean_departure_time_variance),
  };
}

export type LeaderboardOrder = "best" | "attention";

export async function getLeaderboard(
  conn: DuckDbConnection,
  range: DateRange,
  order: LeaderboardOrder = "best",
  limit = 5,
): Promise<RouteLeaderboardRow[]> {
  const direction = order === "best" ? "DESC" : "ASC";
  const result = await conn.query(`
    SELECT
      route,
      route_short_name,
      route_long_name,
      AVG(punctuality) AS punctuality,
      AVG(reliability) AS reliability,
      SUM(scheduled_trips) AS scheduled_trips,
      SUM(cancellations) AS cancellations
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE day >= DATE '${range.from}'
      AND day <= DATE '${range.to}'
    GROUP BY route, route_short_name, route_long_name
    HAVING AVG(punctuality) IS NOT NULL
    ORDER BY punctuality ${direction} NULLS LAST, route ASC
    LIMIT ${limit};
  `);

  return result.toArray().map((row) => ({
    route: String(row.route),
    route_short_name: toNullableString(row.route_short_name),
    route_long_name: toNullableString(row.route_long_name),
    punctuality: toNullableNumber(row.punctuality),
    reliability: toNullableNumber(row.reliability),
    scheduled_trips: toNullableNumber(row.scheduled_trips),
    cancellations: toNullableNumber(row.cancellations),
  }));
}

export async function getDailySeries(
  conn: DuckDbConnection,
  route: string,
  range: DateRange,
): Promise<RouteDailyPoint[]> {
  const safeRoute = route.replace(/'/g, "''");
  const result = await conn.query(`
    SELECT
      CAST(day AS VARCHAR) AS day,
      punctuality,
      reliability,
      cancellations,
      cancellations_rate,
      scheduled_trips,
      peak_punctuality,
      mean_departure_time_variance
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE (route = '${safeRoute}' OR CAST(route_short_name AS VARCHAR) = '${safeRoute}')
      AND day >= DATE '${range.from}'
      AND day <= DATE '${range.to}'
    ORDER BY day;
  `);

  return result.toArray().map((row) => ({
    day: String(row.day),
    punctuality: toNullableNumber(row.punctuality),
    reliability: toNullableNumber(row.reliability),
    cancellations: toNullableNumber(row.cancellations),
    cancellations_rate: toNullableNumber(row.cancellations_rate),
    scheduled_trips: toNullableNumber(row.scheduled_trips),
    peak_punctuality: toNullableNumber(row.peak_punctuality),
    mean_departure_time_variance: toNullableNumber(row.mean_departure_time_variance),
  }));
}

export async function getRouteDailyExport(
  conn: DuckDbConnection,
  route: string,
  range: DateRange,
): Promise<Record<string, unknown>[]> {
  const safeRoute = route.replace(/'/g, "''");
  const result = await conn.query(`
    SELECT
      CAST(day AS VARCHAR) AS day,
      route,
      route_short_name,
      route_long_name,
      punctuality,
      reliability,
      cancellations,
      cancellations_rate,
      scheduled_trips,
      peak_punctuality,
      mean_departure_time_variance
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE (route = '${safeRoute}' OR CAST(route_short_name AS VARCHAR) = '${safeRoute}')
      AND day >= DATE '${range.from}'
      AND day <= DATE '${range.to}'
    ORDER BY day;
  `);
  return result.toArray();
}

export async function getNetworkDailySeries(
  conn: DuckDbConnection,
  range: DateRange,
): Promise<NetworkDailyPoint[]> {
  const result = await conn.query(`
    SELECT
      CAST(day AS VARCHAR) AS day,
      AVG(punctuality) AS punctuality,
      AVG(reliability) AS reliability,
      SUM(cancellations) AS cancellations,
      AVG(cancellations_rate) AS cancellations_rate
    FROM ${ROUTE_PERFORMANCE_VIEW}
    WHERE day >= DATE '${range.from}'
      AND day <= DATE '${range.to}'
    GROUP BY day
    ORDER BY day;
  `);

  return result.toArray().map((row) => ({
    day: String(row.day),
    punctuality: toNullableNumber(row.punctuality),
    reliability: toNullableNumber(row.reliability),
    cancellations: toNullableNumber(row.cancellations),
    cancellations_rate: toNullableNumber(row.cancellations_rate),
  }));
}

export async function getDataBounds(
  conn: DuckDbConnection,
): Promise<DateRange | null> {
  const result = await conn.query(`
    SELECT
      CAST(MIN(day) AS VARCHAR) AS min_day,
      CAST(MAX(day) AS VARCHAR) AS max_day
    FROM ${ROUTE_PERFORMANCE_VIEW};
  `);
  const row = firstRow(result);
  const from = toNullableString(row?.min_day);
  const to = toNullableString(row?.max_day);
  if (!from || !to) return null;
  return { from, to };
}

export async function getRouteCatalog(conn: DuckDbConnection): Promise<RouteCatalogEntry[]> {
  const result = await conn.query(`
    SELECT
      route,
      any_value(route_short_name) AS route_short_name,
      any_value(route_long_name) AS route_long_name,
      any_value(route_type) AS route_type
    FROM ${ROUTE_PERFORMANCE_VIEW}
    GROUP BY route
    ORDER BY route ASC;
  `);

  return result.toArray().map((row) => ({
    route: String(row.route),
    route_short_name: toNullableString(row.route_short_name),
    route_long_name: toNullableString(row.route_long_name),
    route_type: toNullableNumber(row.route_type),
  }));
}

export { monthsIntersectingPeriod } from "./manifest";
