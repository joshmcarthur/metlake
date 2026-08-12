import type { NetworkDailyPoint } from "../../../lib/types";

function punctColor(pct: number): string {
  if (pct >= 95) return "#e8f2e3";
  if (pct >= 92) return "#cfe4c8";
  if (pct >= 88) return "#f5e6a8";
  if (pct >= 84) return "#e8b86a";
  return "#c45c16";
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Monday = 0 … Sunday = 6 */
function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export function renderPunctualityCalendar(
  root: HTMLElement,
  series: NetworkDailyPoint[],
): void {
  if (series.length === 0) {
    root.innerHTML = `<p class="period-meta">No daily punctuality in this period.</p>`;
    return;
  }

  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const first = parseIso(series[0].day);
  const startPad = mondayIndex(first);

  let html = dow.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < startPad; i++) {
    html += `<div class="cell muted"></div>`;
  }

  series.forEach((point) => {
    const date = parseIso(point.day);
    const dayNum = date.getUTCDate();
    const pct =
      point.punctuality === null ? null : point.punctuality * 100;
    const title =
      pct === null
        ? `${point.day}: no data`
        : `${point.day}: ${pct.toFixed(1)}% punctuality`;
    const bg =
      pct === null ? "var(--paper)" : punctColor(pct);
    html += `<div class="cell" style="background:${bg}" title="${title}" tabindex="0">${dayNum}</div>`;
  });

  root.className = "calendar-heat";
  root.innerHTML = html;
}
