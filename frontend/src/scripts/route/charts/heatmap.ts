import {
  renderNetworkHourHeat,
  type HourHeatCell,
} from "../../overview/charts/hour-heat.ts";

export function renderHourHeatmap(root: HTMLElement, cells: HourHeatCell[]): void {
  renderNetworkHourHeat(root, cells);
}
