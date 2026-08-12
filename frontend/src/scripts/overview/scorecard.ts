import {
  formatCount,
  formatCountDelta,
  formatPercent,
  formatRateDelta,
  type MetricDelta,
} from "../../lib/format";
import type { PeriodSummary, RouteLeaderboardRow } from "../../lib/types";
import { priorLabel, type PeriodKey } from "./period";

function rankLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function routeLabel(row: RouteLeaderboardRow): string {
  return row.route_short_name ?? row.route;
}

function routeName(row: RouteLeaderboardRow): string {
  return row.route_long_name ?? "";
}

function renderRankList(
  container: HTMLElement,
  rows: RouteLeaderboardRow[],
): void {
  container.innerHTML = rows
    .map(
      (row, index) => `
      <li>
        <span class="n">${rankLabel(index)}</span>
        <div>
          <a href="/routes/${encodeURIComponent(row.route)}/">${routeLabel(row)}</a>
          <span class="route-name">${routeName(row)}</span>
        </div>
        <span class="metric">${formatPercent(row.punctuality)}</span>
      </li>`,
    )
    .join("");
}

function setDelta(el: HTMLElement, delta: MetricDelta): void {
  el.textContent = delta.text;
  el.classList.remove("up", "down", "flat");
  el.classList.add(delta.trend);
}

export function renderScorecard(
  summary: PeriodSummary,
  prior: PeriodSummary | null,
  best: RouteLeaderboardRow[],
  attention: RouteLeaderboardRow[],
  periodKey: PeriodKey | "custom",
  compare: boolean,
): void {
  const label = priorLabel(periodKey);

  const metrics: Record<string, string> = {
    reliability: formatPercent(summary.reliability),
    punctuality: formatPercent(summary.punctuality),
    cancellations: formatPercent(summary.cancellations_rate),
    trips: formatCount(summary.scheduled_trips),
  };

  Object.entries(metrics).forEach(([key, value]) => {
    const el = document.querySelector<HTMLElement>(`[data-metric="${key}"]`);
    if (el) el.textContent = value;
  });

  const reliabilityDelta = document.querySelector<HTMLElement>("[data-delta='reliability']");
  const punctualityDelta = document.querySelector<HTMLElement>("[data-delta='punctuality']");
  const cancellationsDelta = document.querySelector<HTMLElement>("[data-delta='cancellations']");
  const tripsDelta = document.querySelector<HTMLElement>("[data-delta='trips']");

  if (compare && prior) {
    if (reliabilityDelta) {
      setDelta(
        reliabilityDelta,
        formatRateDelta(summary.reliability, prior.reliability, label, true),
      );
    }
    if (punctualityDelta) {
      setDelta(
        punctualityDelta,
        formatRateDelta(summary.punctuality, prior.punctuality, label, true),
      );
    }
    if (cancellationsDelta) {
      setDelta(
        cancellationsDelta,
        formatRateDelta(summary.cancellations_rate, prior.cancellations_rate, label, false),
      );
    }
    if (tripsDelta) {
      setDelta(tripsDelta, formatCountDelta(summary.scheduled_trips, prior.scheduled_trips, label));
    }
  } else {
    const placeholder = { text: "— vs prior", trend: "flat" as const };
    if (reliabilityDelta) setDelta(reliabilityDelta, placeholder);
    if (punctualityDelta) setDelta(punctualityDelta, placeholder);
    if (cancellationsDelta) setDelta(cancellationsDelta, placeholder);
    if (tripsDelta) setDelta(tripsDelta, placeholder);
  }

  const bestList = document.querySelector<HTMLElement>("[data-board='best']");
  const attentionList = document.querySelector<HTMLElement>("[data-board='attention']");
  if (bestList) renderRankList(bestList, best);
  if (attentionList) renderRankList(attentionList, attention);
}

export function showScorecardLoading(): void {
  document.querySelectorAll<HTMLElement>("[data-metric]").forEach((el) => {
    el.textContent = "…";
  });
}
