export type ChokePointRow = {
  from_stop_name: string | null;
  to_stop_name: string | null;
  delay_added: number | null;
  n_routes: number;
  n_trips: number;
};

const EMPTY_NOTE =
  '<p class="rt-stub-note">No trip-update delay data for this period.</p>';

function formatDelayAdded(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 0) return `${rounded}s`;
  if (rounded > 0) return `+${rounded}s`;
  return "0s";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stopLabel(name: string | null): string {
  return name?.trim() ? escapeHtml(name) : "Unknown stop";
}

export function renderChokePoints(root: HTMLElement, rows: ChokePointRow[]): void {
  if (rows.length === 0) {
    root.className = "chart-slot-disabled";
    root.innerHTML = EMPTY_NOTE;
    return;
  }

  const items = rows
    .map((row) => {
      const from = stopLabel(row.from_stop_name);
      const to = stopLabel(row.to_stop_name);
      const delay =
        row.delay_added === null ? "—" : formatDelayAdded(row.delay_added);
      const meta = `${delay} · ${row.n_routes} routes · ${row.n_trips} trips`;
      return `<li><div class="injector-seg">${from} → ${to}</div><div class="injector-val">${meta}</div></li>`;
    })
    .join("");

  root.className = "";
  root.innerHTML = `<ol class="injector-list" aria-label="Shared choke points">${items}</ol>`;
}
