import { formatCount, formatDelayMinutes } from "../../lib/format";
import { ensureLateTripsView, getDelayRange } from "../../lib/late-trips";
import type { DuckDbConnection } from "../../lib/duckdb";
import type { DateRange, DelayRange } from "../../lib/types";

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const padded = value * 1.15;
  const mag = 10 ** Math.floor(Math.log10(padded));
  const n = padded / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

function toMinutes(seconds: number): number {
  return seconds / 60;
}

const EMPTY_NOTE = "No trip-update delay data for this period yet.";

export function renderDelayRange(root: HTMLElement, stats: DelayRange | null): void {
  if (
    !stats ||
    stats.late_trips === 0 ||
    stats.least_seconds === null ||
    stats.typical_seconds === null ||
    stats.most_seconds === null
  ) {
    root.innerHTML = `<p class="period-meta">${EMPTY_NOTE}</p>`;
    return;
  }

  const least = toMinutes(stats.least_seconds);
  const typical = toMinutes(stats.typical_seconds);
  const most = toMinutes(stats.most_seconds);
  const yMax = niceCeiling(Math.max(most, 1));

  const w = 560;
  const h = 92;
  const pad = { t: 22, r: 16, b: 28, l: 28 };
  const y = 44;
  const xAt = (minutes: number) =>
    pad.l + (minutes / yMax) * (w - pad.l - pad.r);

  const x0 = xAt(0);
  const xLeast = xAt(least);
  const xTypical = xAt(typical);
  const xMost = xAt(most);
  const xEnd = xAt(yMax);
  const barWidth = Math.max(xMost - xLeast, 4);

  const leastLabel = formatDelayMinutes(stats.least_seconds);
  const typicalLabel = formatDelayMinutes(stats.typical_seconds);
  const mostLabel = formatDelayMinutes(stats.most_seconds);
  const tripLabel = `${formatCount(stats.late_trips)} late trip${stats.late_trips === 1 ? "" : "s"}`;

  const aria = `When trips ran late: typical ${typicalLabel}, least ${leastLabel}, most ${mostLabel}, ${tripLabel}.`;

  root.innerHTML = `
    <svg class="delay-range" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">
      <line class="axis" x1="${x0}" y1="${y}" x2="${xEnd}" y2="${y}" />
      <rect class="span" x="${xLeast}" y="${y - 7}" width="${barWidth}" height="14" rx="7" />
      <circle class="typical" cx="${xTypical}" cy="${y}" r="6" />
      <text class="tick" x="${x0}" y="${h - 10}">0</text>
      <text class="tick" x="${xEnd}" y="${h - 10}" text-anchor="end">${yMax} min</text>
      <text class="label typical" x="${xTypical}" y="${pad.t}" text-anchor="${xTypical > w - 80 ? "end" : "middle"}">typical ${typicalLabel}</text>
    </svg>
    <p class="period-meta delay-range-meta">Typical ${typicalLabel} late · least ${leastLabel} · most ${mostLabel} · ${tripLabel}</p>`;
}

export async function renderDelayRangeForPeriod(
  root: HTMLElement,
  conn: DuckDbConnection,
  range: DateRange,
  route?: string,
): Promise<void> {
  try {
    const ready = await ensureLateTripsView(conn, range);
    if (!ready) {
      renderDelayRange(root, null);
      return;
    }
    const stats = await getDelayRange(conn, range, route);
    renderDelayRange(root, stats);
  } catch (error) {
    console.error(error);
    renderDelayRange(root, null);
  }
}
