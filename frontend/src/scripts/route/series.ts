import { formatNzDayMonth } from "../../lib/format";
import type { RouteDailyPoint } from "../../lib/types";
import { metricLabel, type RouteMetricKey } from "./metrics";

const SERIES_ORDER: RouteMetricKey[] = ["punctuality", "reliability", "peak"];

interface PlottedDay {
  day: string;
  pct: number | null;
  x: number;
  y: number | null;
}

function seriesValue(point: RouteDailyPoint, metric: RouteMetricKey): number | null {
  switch (metric) {
    case "punctuality":
      return point.punctuality;
    case "reliability":
      return point.reliability;
    case "peak":
      return point.peak_punctuality;
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

function toPct(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value * 100;
}

function yDomain(values: number[]): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.15, 2);
  let min = Math.max(0, Math.floor(lo - pad));
  let max = Math.min(100, Math.ceil(hi + pad));
  if (max - min < 4) {
    min = Math.max(0, min - 2);
    max = Math.min(100, max + 2);
  }
  return { min, max };
}

function formatAxisPct(value: number): string {
  const digits = Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1;
  return `${value.toFixed(digits)}%`;
}

function xTickIndexes(length: number): number[] {
  if (length <= 1) return [0];
  if (length === 2) return [0, 1];
  if (length < 10) return [0, Math.floor((length - 1) / 2), length - 1];
  return [
    0,
    Math.round((length - 1) / 3),
    Math.round(((length - 1) * 2) / 3),
    length - 1,
  ];
}

function lineSegments(points: PlottedDay[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length >= 2) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${point.x},${point.y}`);
  }
  if (current.length >= 2) segments.push(current.join(" "));
  return segments;
}

function plotMetric(
  rows: RouteDailyPoint[],
  metric: RouteMetricKey,
  xAt: (index: number) => number,
  yAt: (pct: number) => number,
): PlottedDay[] {
  return rows.map((point, index) => {
    const pct = toPct(seriesValue(point, metric));
    return {
      day: point.day,
      pct,
      x: xAt(index),
      y: pct === null ? null : yAt(pct),
    };
  });
}

function polylinesFor(
  points: PlottedDay[],
  metric: RouteMetricKey,
  extraClass = "",
): string {
  const cls = `line line-${metric}${extraClass ? ` ${extraClass}` : ""}`;
  return lineSegments(points)
    .map((pts) => `<polyline class="${cls}" points="${pts}" />`)
    .join("");
}

function dotsFor(points: PlottedDay[], metric: RouteMetricKey): string {
  const labelName = metricLabel(metric).toLowerCase();
  return points
    .filter((point) => point.y !== null && point.pct !== null)
    .map((point) => {
      const label = `${formatNzDayMonth(point.day)}: ${labelName} ${point.pct?.toFixed(1)}%`;
      return `<circle class="pt pt-${metric}" cx="${point.x}" cy="${point.y}" r="2.5"><title>${label}</title></circle>`;
    })
    .join("");
}

export function renderRouteSeries(
  root: HTMLElement,
  series: RouteDailyPoint[],
  priorSeries: RouteDailyPoint[] | null,
  metrics: ReadonlySet<RouteMetricKey>,
  compare: boolean,
): void {
  const visible = SERIES_ORDER.filter((metric) => metrics.has(metric));
  const names = visible.map((metric) => metricLabel(metric).toLowerCase()).join(" / ");

  if (series.length === 0) {
    root.innerHTML = `<p class="period-meta">No ${names || "published-rate"} data in this period.</p>`;
    return;
  }

  const known: number[] = [];
  for (const metric of visible) {
    for (const point of series) {
      const pct = toPct(seriesValue(point, metric));
      if (pct !== null) known.push(pct);
    }
    if (compare && priorSeries) {
      for (const point of priorSeries) {
        const pct = toPct(seriesValue(point, metric));
        if (pct !== null) known.push(pct);
      }
    }
  }

  if (known.length === 0) {
    root.innerHTML = `<p class="period-meta">No ${names || "published-rate"} data in this period.</p>`;
    return;
  }

  const { min: yMin, max: yMax } = yDomain(known);
  const span = Math.max(yMax - yMin, 1);
  const w = 640;
  const h = 200;
  const pad = { t: 16, r: 12, b: 28, l: 40 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const yAt = (pct: number) => pad.t + (1 - (pct - yMin) / span) * plotH;
  const xAt = (index: number, length: number) =>
    pad.l + (index / Math.max(length - 1, 1)) * plotW;

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const grid = yTicks
    .map((tick) => {
      const y = yAt(tick);
      return `
        <line class="grid" x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" />
        <text class="tick" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${formatAxisPct(tick)}</text>`;
    })
    .join("");

  const xTicks = xTickIndexes(series.length)
    .map((index) => {
      const x = xAt(index, series.length);
      return `<text class="tick" x="${x}" y="${h - 8}" text-anchor="middle">${formatNzDayMonth(series[index].day)}</text>`;
    })
    .join("");

  const plotted = visible.map((metric) => ({
    metric,
    points: plotMetric(series, metric, (i) => xAt(i, series.length), yAt),
  }));

  const priorLines =
    compare && priorSeries && priorSeries.length > 0
      ? visible
          .map((metric) =>
            polylinesFor(
              plotMetric(priorSeries, metric, (i) => xAt(i, priorSeries.length), yAt),
              metric,
              "compare-series",
            ),
          )
          .join("")
      : "";

  const currentLines = plotted
    .map(({ metric, points }) => polylinesFor(points, metric))
    .join("");

  const dots = plotted
    .map(({ metric, points }) => dotsFor(points, metric))
    .join("");

  const legend = visible
    .map(
      (metric) =>
        `<span><i class="swatch-${metric}"></i>${metricLabel(metric)}</span>`,
    )
    .join("");
  const compareLegend =
    compare && priorSeries && priorSeries.length > 0
      ? `<span class="compare-legend"><i class="swatch-prior"></i>Prior window</span>`
      : "";

  const ariaMetrics = visible.map((metric) => metricLabel(metric).toLowerCase()).join(", ");
  const aria = `Daily published rates: ${ariaMetrics}${compare && priorSeries?.length ? ", with prior window overlay" : ""}.`;

  root.innerHTML = `
    <svg class="series-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">
      ${grid}
      ${priorLines}
      ${currentLines}
      ${dots}
      <line class="axis" x1="${pad.l}" y1="${yAt(yMin)}" x2="${w - pad.r}" y2="${yAt(yMin)}" />
      ${xTicks}
    </svg>
    <div class="chart-legend">
      ${legend}
      ${compareLegend}
    </div>`;
}
