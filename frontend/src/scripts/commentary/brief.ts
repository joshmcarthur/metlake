import type { PeriodSummary, RouteLeaderboardRow } from "../../lib/types";
import type {
  CommentaryBrief,
  NetworkBriefStats,
  RouteBriefStats,
  RoutePunctualityRow,
} from "./types";

function pct(fraction: number | null): number | null {
  if (fraction === null || !Number.isFinite(fraction)) return null;
  return Math.round(fraction * 1000) / 10;
}

function ppDelta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return Math.round((current - prior) * 1000) / 10;
}

function periodLabel(from: string, to: string): string {
  return from === to ? from : `${from} to ${to}`;
}

function leaderboardRows(rows: RouteLeaderboardRow[]): RoutePunctualityRow[] {
  return rows.map((row) => ({
    route: row.route_short_name ?? row.route,
    name: row.route_long_name ?? "",
    pct: pct(row.punctuality),
  }));
}

export function buildNetworkBrief(
  summary: PeriodSummary,
  prior: PeriodSummary | null,
  best: RouteLeaderboardRow[],
  attention: RouteLeaderboardRow[],
): CommentaryBrief {
  const stats: NetworkBriefStats = {
    period: periodLabel(summary.from, summary.to),
    prior_period: prior ? periodLabel(prior.from, prior.to) : null,
    reliability_pct: pct(summary.reliability),
    punctuality_pct: pct(summary.punctuality),
    cancellations_pct: pct(summary.cancellations_rate),
    scheduled_trips: summary.scheduled_trips,
    vs_prior: prior
      ? {
          reliability_pp: ppDelta(summary.reliability, prior.reliability),
          punctuality_pp: ppDelta(summary.punctuality, prior.punctuality),
          cancellations_pp: ppDelta(summary.cancellations_rate, prior.cancellations_rate),
        }
      : null,
    best_punctuality: leaderboardRows(best),
    needs_attention: leaderboardRows(attention),
    note: "Figures are Metlink published bus performance metrics, not live vehicle delays.",
  };

  return {
    title: "Network commentary",
    scope: "network",
    fallbackKey: "network",
    stats,
  };
}

export function buildRouteBrief(
  routeId: string,
  routeName: string,
  summary: PeriodSummary,
  prior: PeriodSummary | null,
  options: { direction?: string; includeRtFields?: boolean } = {},
): CommentaryBrief {
  const stats: RouteBriefStats = {
    route: routeId,
    name: routeName,
    direction: options.direction,
    period: periodLabel(summary.from, summary.to),
    punctuality_pct: pct(summary.punctuality),
    reliability_pct: pct(summary.reliability),
    cancellations_pct: pct(summary.cancellations_rate),
    vs_prior_pp: prior
      ? {
          punctuality: ppDelta(summary.punctuality, prior.punctuality),
          reliability: ppDelta(summary.reliability, prior.reliability),
          cancellations: ppDelta(summary.cancellations_rate, prior.cancellations_rate),
        }
      : null,
    note: options.includeRtFields
      ? "Delay profile is illustrative of GTFS-RT trip-update aggregates."
      : "Figures are Metlink published bus performance metrics for the selected period.",
  };

  return {
    title: `Route ${routeId} commentary`,
    scope: "route",
    fallbackKey: "route83",
    stats,
  };
}

export function formatBrief(stats: NetworkBriefStats | RouteBriefStats): string {
  return `STATS (JSON)\n${JSON.stringify(stats, null, 2)}`;
}
