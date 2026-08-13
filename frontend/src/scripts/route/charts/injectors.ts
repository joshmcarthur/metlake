import { escapeHtml } from "../../overview/charts/choke-points.ts";
import { renderAnatomyEmptyState } from "./empty-state.ts";

export type RouteInjectorRow = {
  from_stop_name: string | null;
  to_stop_name: string | null;
  delay_added: number | null;
  n_trips: number;
};

function stopLabel(name: string | null): string {
  return name?.trim() ? escapeHtml(name) : "Unknown stop";
}

function formatDelayAdded(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 0) return `${rounded}s`;
  if (rounded > 0) return `+${rounded}s`;
  return "0s";
}

function isOrderedList(root: HTMLElement): boolean {
  return root.tagName === "OL";
}

export function renderInjectors(root: HTMLElement, rows: RouteInjectorRow[]): void {
  const emptyClass = isOrderedList(root)
    ? "injector-list chart-slot-disabled"
    : "chart-slot-disabled";

  if (rows.length === 0) {
    renderAnatomyEmptyState(root, emptyClass);
    return;
  }

  const items = rows
    .map((row) => {
      const from = stopLabel(row.from_stop_name);
      const to = stopLabel(row.to_stop_name);
      const delay =
        row.delay_added === null ? "—" : formatDelayAdded(row.delay_added);
      const meta = `${delay} · ${row.n_trips} trips`;
      return `<li><div class="injector-seg">${from} → ${to}</div><div class="injector-val">${meta}</div></li>`;
    })
    .join("");

  if (isOrderedList(root)) {
    root.className = "injector-list";
    root.innerHTML = items;
    return;
  }

  root.className = "";
  root.innerHTML = `<ol class="injector-list" aria-label="Delay injector list">${items}</ol>`;
}
