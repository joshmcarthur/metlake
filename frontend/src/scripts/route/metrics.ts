export type RouteMetricKey = "punctuality" | "reliability" | "peak";

export interface RouteMetricState {
  metrics: ReadonlySet<RouteMetricKey>;
}

const METRIC_LABELS: Record<RouteMetricKey, string> = {
  punctuality: "Punctuality",
  reliability: "Reliability",
  peak: "Peak punctuality",
};

export function isRouteMetricKey(value: string | undefined): value is RouteMetricKey {
  return value === "punctuality" || value === "reliability" || value === "peak";
}

export function metricLabel(metric: RouteMetricKey): string {
  return METRIC_LABELS[metric];
}

function readPressedMetrics(buttons: NodeListOf<HTMLButtonElement>): Set<RouteMetricKey> {
  const pressed = new Set<RouteMetricKey>();
  buttons.forEach((btn) => {
    const metric = btn.dataset.metricChip;
    if (isRouteMetricKey(metric) && btn.getAttribute("aria-pressed") === "true") {
      pressed.add(metric);
    }
  });
  if (pressed.size === 0) pressed.add("punctuality");
  return pressed;
}

function syncPressed(
  buttons: NodeListOf<HTMLButtonElement>,
  metrics: ReadonlySet<RouteMetricKey>,
): void {
  buttons.forEach((chip) => {
    const key = chip.dataset.metricChip;
    chip.setAttribute("aria-pressed", String(isRouteMetricKey(key) && metrics.has(key)));
  });
}

export function bindMetricChips(
  root: ParentNode,
  onChange: (state: RouteMetricState) => void,
): RouteMetricState {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-metric-chip]");
  let state: RouteMetricState = { metrics: readPressedMetrics(buttons) };
  syncPressed(buttons, state.metrics);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const metric = btn.dataset.metricChip;
      if (!isRouteMetricKey(metric)) return;

      const next = new Set(state.metrics);
      if (next.has(metric)) {
        if (next.size === 1) return;
        next.delete(metric);
      } else {
        next.add(metric);
      }

      state = { metrics: next };
      syncPressed(buttons, next);
      onChange(state);
    });
  });

  return state;
}
