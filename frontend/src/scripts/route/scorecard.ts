import {
  formatMinutes,
  formatMinutesDelta,
  formatPercent,
  formatRateDelta,
  type MetricDelta,
} from "../../lib/format";
import type { PeriodSummary } from "../../lib/types";
import { priorLabel, type PeriodKey } from "../overview/period";

function setDelta(el: HTMLElement, delta: MetricDelta): void {
  el.textContent = delta.text;
  el.classList.remove("up", "down", "flat");
  el.classList.add(delta.trend);
}

export function renderRouteScorecard(
  summary: PeriodSummary,
  prior: PeriodSummary | null,
  periodKey: PeriodKey | "custom",
  compare: boolean,
): void {
  const label = priorLabel(periodKey);

  const punctualityEl = document.querySelector<HTMLElement>("[data-metric='punctuality']");
  const reliabilityEl = document.querySelector<HTMLElement>("[data-metric='reliability']");
  const cancellationsEl = document.querySelector<HTMLElement>("[data-metric='cancellations']");
  const varianceEl = document.querySelector<HTMLElement>("[data-metric='variance']");

  if (punctualityEl) punctualityEl.textContent = formatPercent(summary.punctuality);
  if (reliabilityEl) reliabilityEl.textContent = formatPercent(summary.reliability);
  if (cancellationsEl) cancellationsEl.textContent = formatPercent(summary.cancellations_rate);
  if (varianceEl) varianceEl.textContent = formatMinutes(summary.mean_departure_time_variance);

  const punctualityDelta = document.querySelector<HTMLElement>("[data-delta='punctuality']");
  const reliabilityDelta = document.querySelector<HTMLElement>("[data-delta='reliability']");
  const cancellationsDelta = document.querySelector<HTMLElement>("[data-delta='cancellations']");
  const varianceDelta = document.querySelector<HTMLElement>("[data-delta='variance']");

  if (compare && prior) {
    if (punctualityDelta) {
      setDelta(
        punctualityDelta,
        formatRateDelta(summary.punctuality, prior.punctuality, label, true),
      );
    }
    if (reliabilityDelta) {
      setDelta(
        reliabilityDelta,
        formatRateDelta(summary.reliability, prior.reliability, label, true),
      );
    }
    if (cancellationsDelta) {
      setDelta(
        cancellationsDelta,
        formatRateDelta(summary.cancellations_rate, prior.cancellations_rate, label, false),
      );
    }
    if (varianceDelta) {
      setDelta(
        varianceDelta,
        formatMinutesDelta(
          summary.mean_departure_time_variance,
          prior.mean_departure_time_variance,
          label,
        ),
      );
    }
  } else {
    const placeholder = { text: "— vs prior", trend: "flat" as const };
    if (punctualityDelta) setDelta(punctualityDelta, placeholder);
    if (reliabilityDelta) setDelta(reliabilityDelta, placeholder);
    if (cancellationsDelta) setDelta(cancellationsDelta, placeholder);
    if (varianceDelta) setDelta(varianceDelta, placeholder);
  }
}

export function showRouteScorecardLoading(): void {
  document.querySelectorAll<HTMLElement>("[data-metric]").forEach((el) => {
    el.textContent = "…";
  });
}
