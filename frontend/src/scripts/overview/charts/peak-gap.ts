import type { RoutePeakGapRow } from "../../../lib/types";

const FLAG_GAP_PP = 5;

export function renderPeakGapScatter(
  root: HTMLElement,
  routes: RoutePeakGapRow[],
): void {
  if (routes.length === 0) {
    root.innerHTML = `<p class="period-meta">No peak-gap data in this period.</p>`;
    return;
  }

  const w = 520;
  const h = 240;
  const pad = { t: 20, r: 20, b: 40, l: 44 };

  const xs = routes
    .map((r) => (r.punctuality === null ? null : r.punctuality * 100))
    .filter((v): v is number => v !== null);
  const ys = routes
    .map((r) => r.peak_gap_pp)
    .filter((v): v is number => v !== null);

  const xMin = Math.floor(Math.min(...xs, 80) - 2);
  const xMax = Math.ceil(Math.max(...xs, 98) + 1);
  const yMin = 0;
  const yMax = Math.ceil(Math.max(...ys, 8) + 1);

  const X = (v: number) =>
    pad.l + ((v - xMin) / (xMax - xMin)) * (w - pad.l - pad.r);
  const Y = (v: number) =>
    pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);

  const pts = routes
    .map((r) => {
      if (r.punctuality === null || r.peak_gap_pp === null) return "";
      const x = r.punctuality * 100;
      const gap = r.peak_gap_pp;
      const id = r.route_short_name ?? r.route;
      const flag = gap >= FLAG_GAP_PP;
      return `
      <circle class="pt${flag ? " flag" : ""}" cx="${X(x)}" cy="${Y(gap)}" r="5">
        <title>Route ${id}: ${x.toFixed(1)}% punctuality, peak ${gap.toFixed(1)}pp worse</title>
      </circle>
      <text class="axis-label" x="${X(x) + 6}" y="${Y(gap) + 3}">${id}</text>`;
    })
    .join("");

  root.innerHTML = `
    <svg class="scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="Peak gap vs all-day punctuality">
      <line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#d0d8dc" />
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${h - pad.b}" stroke="#d0d8dc" />
      <text class="axis-label" x="${(pad.l + w - pad.r) / 2}" y="${h - 10}" text-anchor="middle">All-day punctuality %</text>
      <text class="axis-label" x="12" y="${(pad.t + h - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pad.t + h - pad.b) / 2})">Peak gap (pp worse)</text>
      ${pts}
    </svg>`;
}
