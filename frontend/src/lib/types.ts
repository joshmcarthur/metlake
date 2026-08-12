/** Archive files are served by Caddy from the mounted archive. */
export const ROUTE_PERFORMANCE_BASE = "/data/derived/route-performance";

export interface RoutePerformanceManifest {
  months: string[];
  updated_at: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface PeriodSummary {
  from: string;
  to: string;
  scheduled_trips: number | null;
  reliability: number | null;
  punctuality: number | null;
  cancellations: number | null;
  cancellations_rate: number | null;
  mean_departure_time_variance: number | null;
}

export interface RouteLeaderboardRow {
  route: string;
  route_short_name: string | null;
  route_long_name: string | null;
  punctuality: number | null;
  reliability: number | null;
  scheduled_trips: number | null;
  cancellations: number | null;
}

export interface RouteDailyPoint {
  day: string;
  punctuality: number | null;
  reliability: number | null;
  cancellations: number | null;
  cancellations_rate: number | null;
  scheduled_trips: number | null;
}

export interface RoutePeakGapRow {
  route: string;
  route_short_name: string | null;
  route_long_name: string | null;
  punctuality: number | null;
  peak_punctuality: number | null;
  peak_gap_pp: number | null;
}

export type ArchiveErrorKind = "archive-empty" | "manifest-not-found" | "manifest-invalid";

export class ArchiveError extends Error {
  readonly kind: ArchiveErrorKind;

  constructor(kind: ArchiveErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArchiveError";
    this.kind = kind;
  }
}

export function isArchiveError(error: unknown): error is ArchiveError {
  return error instanceof ArchiveError;
}
