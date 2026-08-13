import { formatNzDayMonth, formatPercent } from "../../../lib/format";
import type { NetworkDailyPoint } from "../../../lib/types";

interface PlottedDay {
  day: string;
  pct: number | null;
  x: number;
  y: number | null;
  spike: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const padded = value * 1.15;
  const mag = 10 ** Math.floor(Math.log10(padded));
  const n = padded / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
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

function areaPath(points: PlottedDay[], baselineY: number): string {
  const segments: string[] = [];
  let run: PlottedDay[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run[run.length - 1];
    const line = run.map((p) => `${p.x},${p.y}`).join(" L ");
    segments.push(
      `M ${first.x},${baselineY} L ${line} L ${last.x},${baselineY} Z`,
    );
    run = [];
  };

  for (const point of points) {
    if (point.y === null) {
      flush();
      continue;
    }
    run.push(point);
  }
  flush();
  return segments.join(" ");
}

export function renderCancellationsChart(
  root: HTMLElement,
  series: NetworkDailyPoint[],
): void {
  if (series.length === 0) {
    root.innerHTML = `<p class="period-meta">No cancellation data in this period.</p>`;
    return;
  }

  const rates = series.map((point) =>
    point.cancellations_rate === null || !Number.isFinite(point.cancellations_rate)
      ? null
      : point.cancellations_rate * 100,
  );
  const known = rates.filter((value): value is number => value !== null);
  if (known.length === 0) {
    root.innerHTML = `<p class="period-meta">No cancellation data in this period.</p>`;
    return;
  }

  const typical = median(known);
  const highest = Math.max(...known);
  const spikeFloor = Math.max(typical * 1.75, typical + 1);
  const yMax = niceCeiling(highest);
  const w = 420;
  const h = 176;
  const pad = { t: 18, r: 12, b: 28, l: 36 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const yAt = (pct: number) => pad.t + (1 - pct / yMax) * plotH;
  const xAt = (index: number) =>
    pad.l + (index / Math.max(series.length - 1, 1)) * plotW;

  const points: PlottedDay[] = series.map((point, index) => {
    const pct = rates[index];
    return {
      day: point.day,
      pct,
      x: xAt(index),
      y: pct === null ? null : yAt(pct),
      spike: pct !== null && pct >= spikeFloor,
    };
  });

  const yTicks = [0, yMax / 2, yMax];
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
      const x = xAt(index);
      return `<text class="tick" x="${x}" y="${h - 8}" text-anchor="middle">${formatNzDayMonth(series[index].day)}</text>`;
    })
    .join("");

  const polylines = lineSegments(points)
    .map(
      (pts) =>
        `<polyline class="line" points="${pts}" />`,
    )
    .join("");

  const dots = points
    .filter((point) => point.y !== null)
    .map((point) => {
      const label = `${formatNzDayMonth(point.day)}: ${point.pct?.toFixed(1)}% cancelled`;
      return `
        <circle class="pt${point.spike ? " spike" : ""}" cx="${point.x}" cy="${point.y}" r="${point.spike ? 4 : 2.5}">
          <title>${label}</title>
        </circle>`;
    })
    .join("");

  const spikeLabels = points
    .filter((point) => point.spike && point.y !== null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 2)
    .map((point) => {
      const anchor =
        point.x > w - 56 ? "end" : point.x < pad.l + 40 ? "start" : "middle";
      return `<text class="spike-label" x="${point.x}" y="${(point.y ?? 0) - 8}" text-anchor="${anchor}">${formatNzDayMonth(point.day)}</text>`;
    })
    .join("");

  const typicalY = yAt(typical);
  const typicalLine =
    typical > 0 && typical < yMax
      ? `
        <line class="median" x1="${pad.l}" y1="${typicalY}" x2="${w - pad.r}" y2="${typicalY}" />
        <text class="tick median-label" x="${w - pad.r}" y="${typicalY - 4}" text-anchor="end">typical</text>`
      : "";

  const highestPoint = points.reduce((best, point) => {
    if (point.pct === null) return best;
    if (best.pct === null || point.pct > best.pct) return point;
    return best;
  }, points[0]);

  const summary =
    highestPoint.pct === null
      ? `Typical ${formatAxisPct(typical)}`
      : `Typical ${formatAxisPct(typical)} · highest ${formatNzDayMonth(highestPoint.day)} at ${highestPoint.pct.toFixed(1)}%`;

  const aria = `Daily cancellation rate. Typical ${formatAxisPct(typical)}, highest ${formatPercent((highestPoint.pct ?? 0) / 100)} on ${formatNzDayMonth(highestPoint.day ?? "")}.`;

  root.innerHTML = `
    <svg class="cancel-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">
      ${grid}
      <path class="area" d="${areaPath(points, yAt(0))}" />
      ${typicalLine}
      ${polylines}
      ${dots}
      ${spikeLabels}
      <line class="axis" x1="${pad.l}" y1="${yAt(0)}" x2="${w - pad.r}" y2="${yAt(0)}" />
      ${xTicks}
    </svg>
    <p class="period-meta cancel-chart-meta">${summary}</p>`;
}
