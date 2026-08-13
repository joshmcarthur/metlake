import {
  ArchiveError,
  LATE_TRIPS_BASE,
  ROUTE_PERFORMANCE_BASE,
  RT_ROUTE_PERFORMANCE_BASE,
  type RoutePerformanceManifest,
} from "./types.ts";

const PERFORMANCE_MANIFEST_URL = `${ROUTE_PERFORMANCE_BASE}/_manifest.json`;
const LATE_TRIPS_MANIFEST_URL = `${LATE_TRIPS_BASE}/_manifest.json`;
const RT_ROUTE_PERFORMANCE_MANIFEST_URL = `${RT_ROUTE_PERFORMANCE_BASE}/_manifest.json`;

function isManifest(value: unknown): value is RoutePerformanceManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as RoutePerformanceManifest;
  return (
    Array.isArray(candidate.months) &&
    candidate.months.every((month) => typeof month === "string") &&
    typeof candidate.updated_at === "string"
  );
}

/** YYYY-MM months from the manifest that overlap [from, to] (inclusive ISO dates). */
export function monthsIntersectingPeriod(
  months: readonly string[],
  from: string,
  to: string,
): string[] {
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  return months.filter((month) => month >= fromMonth && month <= toMonth);
}

/**
 * Months to register for a query window. If the window has no parquet yet,
 * keep the latest archive month loaded so DuckDB can return empty rows
 * instead of failing the page.
 */
export function monthsToRegister(
  months: readonly string[],
  from: string,
  to: string,
): string[] {
  const intersecting = monthsIntersectingPeriod(months, from, to);
  if (intersecting.length > 0) return intersecting;
  const latest = months[months.length - 1];
  return latest ? [latest] : [];
}

/** Same-origin path for `<a href>` / browser fetch (not DuckDB VFS). */
export function parquetUrlForMonth(month: string): string {
  return `${ROUTE_PERFORMANCE_BASE}/${month}.parquet`;
}

export function lateTripsParquetUrlForMonth(month: string): string {
  return `${LATE_TRIPS_BASE}/${month}.parquet`;
}

/** Absolute HTTP(S) URL DuckDB-WASM can fetch via `registerFileURL`. */
export function parquetHttpUrlForMonth(month: string): string {
  return new URL(parquetUrlForMonth(month), window.location.origin).href;
}

export function lateTripsParquetHttpUrlForMonth(month: string): string {
  return new URL(lateTripsParquetUrlForMonth(month), window.location.origin).href;
}

/** Virtual filename registered into the DuckDB-WASM filesystem for a month. */
export function parquetVirtualNameForMonth(month: string): string {
  return `route_performance_${month}.parquet`;
}

export function lateTripsVirtualNameForMonth(month: string): string {
  return `late_trips_${month}.parquet`;
}

export function rtParquetUrlForMonth(month: string): string {
  return `${RT_ROUTE_PERFORMANCE_BASE}/${month}.parquet`;
}

export function rtParquetHttpUrlForMonth(month: string): string {
  return new URL(rtParquetUrlForMonth(month), window.location.origin).href;
}

export function rtParquetVirtualNameForMonth(month: string): string {
  return `rt_route_performance_${month}.parquet`;
}

async function fetchMonthManifest(
  url: string,
  label: string,
  fetchFn: typeof fetch,
): Promise<RoutePerformanceManifest> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (cause) {
    throw new ArchiveError(
      "manifest-not-found",
      `Could not load ${label} manifest from ${url}.`,
      { cause },
    );
  }

  if (response.status === 404) {
    throw new ArchiveError(
      "manifest-not-found",
      `${label} manifest is not available at ${url}.`,
    );
  }

  if (!response.ok) {
    throw new ArchiveError(
      "manifest-not-found",
      `Failed to load ${label} manifest (${response.status}).`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ArchiveError(
      "manifest-invalid",
      `${label} manifest is not valid JSON.`,
      { cause },
    );
  }

  if (!isManifest(payload)) {
    throw new ArchiveError(
      "manifest-invalid",
      `${label} manifest has an unexpected shape.`,
    );
  }

  if (payload.months.length === 0) {
    throw new ArchiveError(
      "archive-empty",
      `No ${label} months are published in the archive yet.`,
    );
  }

  return {
    months: [...payload.months].sort(),
    updated_at: payload.updated_at,
  };
}

export async function fetchRoutePerformanceManifest(
  fetchFn: typeof fetch = fetch,
): Promise<RoutePerformanceManifest> {
  return fetchMonthManifest(PERFORMANCE_MANIFEST_URL, "route-performance", fetchFn);
}

/** Missing late-trips derives are optional — return null instead of failing the page. */
export async function fetchLateTripsManifest(
  fetchFn: typeof fetch = fetch,
): Promise<RoutePerformanceManifest | null> {
  try {
    return await fetchMonthManifest(LATE_TRIPS_MANIFEST_URL, "late-trips", fetchFn);
  } catch (error) {
    if (
      error instanceof ArchiveError &&
      (error.kind === "manifest-not-found" || error.kind === "archive-empty")
    ) {
      return null;
    }
    throw error;
  }
}

/** Missing RT route-performance derives are optional — return null instead of failing the page. */
export async function fetchRtRoutePerformanceManifest(
  fetchFn: typeof fetch = fetch,
): Promise<RoutePerformanceManifest | null> {
  try {
    return await fetchMonthManifest(
      RT_ROUTE_PERFORMANCE_MANIFEST_URL,
      "rt-route-performance",
      fetchFn,
    );
  } catch (error) {
    if (
      error instanceof ArchiveError &&
      (error.kind === "manifest-not-found" || error.kind === "archive-empty")
    ) {
      return null;
    }
    throw error;
  }
}
