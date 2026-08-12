export type RouteMetricKey = "punctuality" | "reliability" | "cancellations" | "peak";

export interface RouteMetricState {
  metric: RouteMetricKey;
}

const METRIC_LABELS: Record<RouteMetricKey, string> = {
  punctuality: "Punctuality",
  reliability: "Reliability",
  cancellations: "Cancellations",
  peak: "Peak punctuality",
};

export function metricLabel(metric: RouteMetricKey): string {
  return METRIC_LABELS[metric];
}

export function bindMetricChips(
  root: ParentNode,
  onChange: (state: RouteMetricState) => void,
): RouteMetricState {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-metric-chip]");
  let state: RouteMetricState = { metric: "punctuality" };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const metric = btn.dataset.metricChip as RouteMetricKey | undefined;
      if (!metric) return;
      state = { metric };
      buttons.forEach((chip) => {
        chip.setAttribute("aria-pressed", String(chip.dataset.metricChip === metric));
      });
      onChange(state);
    });
  });

  return state;
}
