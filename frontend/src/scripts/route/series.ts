import type { RouteDailyPoint } from "../../lib/types";
import { metricLabel, type RouteMetricKey } from "./metrics";

function seriesValue(point: RouteDailyPoint, metric: RouteMetricKey): number | null {
  switch (metric) {
    case "punctuality":
      return point.punctuality;
    case "reliability":
      return point.reliability;
    case "cancellations":
      return point.cancellations_rate;
    case "peak":
      return point.peak_punctuality;
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

function toDisplayFraction(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return value * 100;
}

function buildPolyline(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * (width - 40) + 20;
      const y = height - 30 - ((value - min) / span) * (height - 50);
      return `${x},${y}`;
    })
    .join(" ");
}

export function renderRouteSeries(
  root: HTMLElement,
  series: RouteDailyPoint[],
  priorSeries: RouteDailyPoint[] | null,
  metric: RouteMetricKey,
  routeLabel: string,
  compare: boolean,
): void {
  const label = metricLabel(metric);
  const width = 640;
  const height = 200;

  if (series.length === 0) {
    root.innerHTML = `<p class="period-meta">No ${label.toLowerCase()} data in this period.</p>`;
    return;
  }

  const values = series.map((point) => toDisplayFraction(seriesValue(point, metric)));
  const priorValues =
    priorSeries?.map((point) => toDisplayFraction(seriesValue(point, metric))) ?? null;

  const mainPoints = buildPolyline(values, width, height);
  const comparePoints =
    priorValues && priorValues.length > 0 ? buildPolyline(priorValues, width, height) : "";

  const comparePolyline =
    compare && comparePoints
      ? `<polyline
          class="compare-series"
          fill="none"
          stroke="#c9a227"
          stroke-width="2"
          stroke-dasharray="5 4"
          points="${comparePoints}"
        />`
      : "";

  root.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} over time">
      <polyline
        fill="none"
        stroke="var(--transit)"
        stroke-width="2.5"
        points="${mainPoints}"
      />
      ${comparePolyline}
      <line x1="20" y1="170" x2="620" y2="170" stroke="#0e1419" stroke-opacity="0.12" />
    </svg>
    <div class="chart-legend">
      <span><i class="swatch-a"></i>${routeLabel}</span>
      <span class="compare-legend" ${compare && comparePoints ? "" : "hidden"}>
        <i class="swatch-b"></i>Prior window
      </span>
    </div>`;
}
