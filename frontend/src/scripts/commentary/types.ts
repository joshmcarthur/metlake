export type CommentaryScope = "network" | "route";

export type FallbackKey = "network" | "route" | "route83";

export interface RoutePunctualityRow {
  route: string;
  name: string;
  pct: number | null;
}

export interface NetworkBriefStats {
  period: string;
  prior_period: string | null;
  reliability_pct: number | null;
  punctuality_pct: number | null;
  cancellations_pct: number | null;
  scheduled_trips: number | null;
  vs_prior: {
    reliability_pp: number | null;
    punctuality_pp: number | null;
    cancellations_pp: number | null;
  } | null;
  best_punctuality: RoutePunctualityRow[];
  needs_attention: RoutePunctualityRow[];
  note: string;
}

export interface RouteBriefStats {
  route: string;
  name: string;
  direction?: string;
  period: string;
  punctuality_pct: number | null;
  reliability_pct: number | null;
  cancellations_pct: number | null;
  vs_prior_pp: {
    punctuality: number | null;
    reliability: number | null;
    cancellations: number | null;
  } | null;
  delay_profile?: {
    unit: string;
    largest_injection: { from: string; to: string; add_seconds: number };
    end_of_trip_median_seconds: number;
    worst_hours: string;
  };
  recovery?: {
    recovered_pct: number;
    stayed_late_pct: number;
    got_worse_pct: number;
    rt_coverage_pct: number;
  };
  note: string;
}

export interface CommentaryBrief {
  title: string;
  scope: CommentaryScope;
  fallbackKey: FallbackKey;
  stats: NetworkBriefStats | RouteBriefStats;
}

export type LanguageModelAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available"
  | "unsupported";

export interface CommentaryResult {
  text: string;
  source: "language-model" | "fallback";
  availability: LanguageModelAvailability;
}

export interface CommentaryChunk {
  type: "download" | "text";
  loaded?: number;
  text?: string;
}
