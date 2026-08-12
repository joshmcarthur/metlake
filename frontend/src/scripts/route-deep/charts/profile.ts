import { renderRtEmptyState } from "./empty-state";

export function renderStopProfile(root: HTMLElement): void {
  renderRtEmptyState(root, "chart-slot-disabled");
}
