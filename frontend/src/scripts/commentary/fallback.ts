import type { FallbackKey } from "./types";

/** Canned samples from the prototype — shown when the Prompt API is unavailable. */
export const COMMENTARY_FALLBACK: Record<FallbackKey, string> = {
  network: `Reliability held up on 12 August (97.2%), but punctuality eased to 91.4% — about a percentage point softer than the day before. Cancellations stayed low at 1.8%.

Routes 2 and 60 again sat near the top for punctuality. Route 83 remained the clearest soft spot at 82.4%, with Route 1 not far behind.

Worth watching: whether 83’s dip is a one-day blip or part of the month’s weaker stretch.`,
  route83: `Across early August, Route 83’s published punctuality sat at 82.4% — about three points below the prior month — while reliability stayed high (96.1%). Cancellations ticked up slightly.

On inbound trips, delay tended to build toward town, with the biggest average jump between Petone Station and Ngauranga (+92 seconds). Weekday mornings 7–9 looked busiest for lateness; only about a third of mid-route late trips recovered before the end.

Worth watching: that Petone–Ngauranga segment on weekday mornings.`,
};

export function getFallbackText(key: FallbackKey): string {
  return COMMENTARY_FALLBACK[key];
}
