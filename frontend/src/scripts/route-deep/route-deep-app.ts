import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
} from "../overview/period";
import { bindDirectionToggle, heroForDirection, type Direction } from "./direction";
import { renderHourHeatmap } from "./charts/heatmap";
import { renderInjectors } from "./charts/injectors";
import { renderStopProfile } from "./charts/profile";

function updateHero(root: HTMLElement, direction: Direction): void {
  const routeId = root.dataset.route ?? "";
  const routeName = root.dataset.routeName ?? "";
  const hero = heroForDirection(routeId, routeName, direction);

  const title = root.querySelector<HTMLElement>("[data-direction-title]");
  const desc = root.querySelector<HTMLElement>("[data-direction-desc]");
  if (title) title.textContent = hero.title;
  if (desc) desc.textContent = hero.description;
}

function renderCharts(root: HTMLElement): void {
  const profile = root.querySelector<HTMLElement>("#profile-root");
  const injectors = root.querySelector<HTMLElement>("#injector-list");
  const heatmap = root.querySelector<HTMLElement>("#heatmap-root");

  if (profile) renderStopProfile(profile);
  if (injectors) renderInjectors(injectors);
  if (heatmap) renderHourHeatmap(heatmap);
}

export async function initRouteDeepApp(): Promise<void> {
  const root = document.getElementById("route-deep-root");
  if (!root) return;

  let direction: Direction = "inbound";

  bindDirectionToggle(root, (next) => {
    direction = next;
    updateHero(root, direction);
    renderCharts(root);
  });

  updateHero(root, direction);
  renderCharts(root);

  try {
    const manifest = await fetchRoutePerformanceManifest();
    const bounds = boundsFromManifest(manifest.months, manifest.updated_at);
    const periodEls = getPeriodElements(root);
    if (periodEls) {
      bindPeriodControls(periodEls, bounds, () => {
        renderCharts(root);
      });
    }
  } catch {
    // Period chips stay on placeholders when the archive is unavailable.
  }
}

initRouteDeepApp();
