import type { DateRange, NetworkDailyPoint } from "../../../lib/types";

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

function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  let current = from;
  while (current <= to) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

/** Monday = 0 … Sunday = 6 */
function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export function renderPunctualityCalendar(
  root: HTMLElement,
  series: NetworkDailyPoint[],
  range: DateRange,
): void {
  const days = daysInRange(range.from, range.to);
  if (days.length === 0) {
    root.innerHTML = `<p class="period-meta">No daily punctuality in this period.</p>`;
    return;
  }

  const byDay = new Map(series.map((point) => [point.day, point]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const startPad = mondayIndex(parseIso(range.from));

  let html = dow.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < startPad; i++) {
    html += `<div class="cell muted"></div>`;
  }

  for (const dayIso of days) {
    const date = parseIso(dayIso);
    const dayNum = date.getUTCDate();
    const point = byDay.get(dayIso);
    const pct =
      point?.punctuality === null || point?.punctuality === undefined
        ? null
        : point.punctuality * 100;
    const title =
      pct === null
        ? `${dayIso}: no data`
        : `${dayIso}: ${pct.toFixed(1)}% punctuality`;
    if (pct === null) {
      html += `<div class="cell muted" title="${title}" tabindex="0">${dayNum}</div>`;
      continue;
    }
    html += `<div class="cell" style="background:${punctColor(pct)}" title="${title}" tabindex="0">${dayNum}</div>`;
  }

  root.className = "calendar-heat";
  root.innerHTML = html;
}
