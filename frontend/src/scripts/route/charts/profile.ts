import { escapeHtml } from "../../overview/charts/choke-points.ts";
import { renderAnatomyEmptyState } from "./empty-state.ts";

export type StopProfileRow = {
  stop_name: string | null;
  stop_sequence: number | null;
  median_delay_seconds: number | null;
};

function stopLabel(name: string | null): string {
  return name?.trim() ? escapeHtml(name) : "Unknown stop";
}

function formatMedianDelay(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.round(seconds)}s`;
}

export function renderStopProfile(root: HTMLElement, rows: StopProfileRow[]): void {
  if (rows.length === 0) {
    renderAnatomyEmptyState(root, "chart-slot-disabled");
    return;
  }

  const items = rows
    .map((row) => {
      const name = stopLabel(row.stop_name);
      const delay = formatMedianDelay(row.median_delay_seconds);
      return `<li><div class="injector-seg">${name}</div><div class="injector-val">${delay}</div></li>`;
    })
    .join("");

  root.className = "";
  root.innerHTML = `<ol class="injector-list" aria-label="Stop delay profile">${items}</ol>`;
}
