import {
  ArchiveError,
  ROUTE_PERFORMANCE_BASE,
  type RoutePerformanceManifest,
} from "./types";

const MANIFEST_URL = `${ROUTE_PERFORMANCE_BASE}/_manifest.json`;

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

/** Same-origin path for `<a href>` / browser fetch (not DuckDB VFS). */
export function parquetUrlForMonth(month: string): string {
  return `${ROUTE_PERFORMANCE_BASE}/${month}.parquet`;
}

/** Absolute HTTP(S) URL DuckDB-WASM can fetch via `registerFileURL`. */
export function parquetHttpUrlForMonth(month: string): string {
  return new URL(parquetUrlForMonth(month), window.location.origin).href;
}

/** Virtual filename registered into the DuckDB-WASM filesystem for a month. */
export function parquetVirtualNameForMonth(month: string): string {
  return `route_performance_${month}.parquet`;
}

export async function fetchRoutePerformanceManifest(
  fetchFn: typeof fetch = fetch,
): Promise<RoutePerformanceManifest> {
  let response: Response;
  try {
    response = await fetchFn(MANIFEST_URL);
  } catch (cause) {
    throw new ArchiveError(
      "manifest-not-found",
      `Could not load route-performance manifest from ${MANIFEST_URL}.`,
      { cause },
    );
  }

  if (response.status === 404) {
    throw new ArchiveError(
      "manifest-not-found",
      `Route-performance manifest is not available at ${MANIFEST_URL}.`,
    );
  }

  if (!response.ok) {
    throw new ArchiveError(
      "manifest-not-found",
      `Failed to load route-performance manifest (${response.status}).`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ArchiveError(
      "manifest-invalid",
      "Route-performance manifest is not valid JSON.",
      { cause },
    );
  }

  if (!isManifest(payload)) {
    throw new ArchiveError(
      "manifest-invalid",
      "Route-performance manifest has an unexpected shape.",
    );
  }

  if (payload.months.length === 0) {
    throw new ArchiveError(
      "archive-empty",
      "No route-performance months are published in the archive yet.",
    );
  }

  return {
    months: [...payload.months].sort(),
    updated_at: payload.updated_at,
  };
}
