export type HourHeatCell = {
  weekday: number;
  hour: number;
  delay_seconds: number | null;
};

const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const EMPTY_NOTE =
  '<p class="rt-stub-note">No trip-update delay data for this period.</p>';

function delayColor(seconds: number): string {
  if (seconds >= 240) return "#c45c16";
  if (seconds >= 180) return "#e8b86a";
  if (seconds >= 120) return "#f5e6a8";
  if (seconds >= 60) return "#cfe4c8";
  return "#e8f2e3";
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function renderNetworkHourHeat(
  root: HTMLElement,
  cells: HourHeatCell[],
): void {
  if (cells.length === 0) {
    root.className = "heatmap chart-slot-disabled";
    root.innerHTML = EMPTY_NOTE;
    return;
  }

  const bySlot = new Map<string, number>();
  for (const cell of cells) {
    if (cell.delay_seconds === null) continue;
    bySlot.set(`${cell.weekday}-${cell.hour}`, cell.delay_seconds);
  }

  if (bySlot.size === 0) {
    root.className = "heatmap chart-slot-disabled";
    root.innerHTML = EMPTY_NOTE;
    return;
  }

  const hourHeaders = Array.from({ length: 24 }, (_, hour) => {
    return `<th>${hourLabel(hour)}</th>`;
  }).join("");

  let body = "";
  for (let weekday = 1; weekday <= 7; weekday++) {
    const label = DOW[weekday] ?? `D${weekday}`;
    let row = `<tr><th class="row-label">${label}</th>`;
    for (let hour = 0; hour < 24; hour++) {
      const delay = bySlot.get(`${weekday}-${hour}`);
      if (delay === undefined) {
        row += `<td class="muted" title="${label} ${hourLabel(hour)} · no data" tabindex="0"></td>`;
        continue;
      }
      const rounded = Math.round(delay);
      const title = `${label} ${hourLabel(hour)} · ${rounded}s`;
      row += `<td style="background:${delayColor(rounded)}" title="${title}" tabindex="0"></td>`;
    }
    row += "</tr>";
    body += row;
  }

  root.className = "heatmap";
  root.innerHTML = `<table><thead><tr><th class="row-label"></th>${hourHeaders}</tr></thead><tbody>${body}</tbody></table>`;
}
