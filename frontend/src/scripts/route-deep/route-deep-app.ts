import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import {
  getRoutePeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { isArchiveError } from "../../lib/types";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  type PeriodState,
} from "../overview/period";
import { buildRouteBrief } from "../commentary/brief";
import { mountCommentaryPanel } from "../commentary/commentary-app";
import { bindDirectionToggle, heroForDirection, type Direction } from "./direction";
import { renderHourHeatmap } from "./charts/heatmap";
import { renderInjectors } from "./charts/injectors";
import { renderStopProfile } from "./charts/profile";

let session: RoutePerformanceSession | null = null;
let commentaryPanel: ReturnType<typeof mountCommentaryPanel> | null = null;
let currentDirection: Direction = "inbound";

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

async function refreshCommentary(
  root: HTMLElement,
  state: PeriodState,
): Promise<void> {
  if (!session || !commentaryPanel) return;

  const routeId = root.dataset.route ?? "";
  const routeName = root.dataset.routeName ?? "";
  if (!routeId) return;

  try {
    const { conn } = await loadRoutePerformance(state.range, session);
    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const [summary, prior] = await Promise.all([
      getRoutePeriodSummary(conn, routeId, state.range),
      priorRange ? getRoutePeriodSummary(conn, routeId, priorRange) : Promise.resolve(null),
    ]);
    commentaryPanel.updateBrief(
      buildRouteBrief(routeId, routeName, summary, prior, {
        direction: currentDirection,
        includeRtFields: false,
      }),
    );
  } catch (error) {
    if (!isArchiveError(error) && !(error instanceof Error)) return;
  }
}

export async function initRouteDeepApp(): Promise<void> {
  const root = document.getElementById("route-deep-root");
  if (!root) return;

  const commentaryRoot = root.querySelector<HTMLElement>("[data-ai-commentary]");
  if (commentaryRoot) commentaryPanel = mountCommentaryPanel(commentaryRoot);

  session = new RoutePerformanceSession();
  window.addEventListener("pagehide", () => {
    void session?.close();
  });

  bindDirectionToggle(root, (next) => {
    currentDirection = next;
    updateHero(root, next);
    renderCharts(root);
  });

  updateHero(root, currentDirection);
  renderCharts(root);

  try {
    const manifest = await fetchRoutePerformanceManifest();
    const bounds = boundsFromManifest(manifest.months, manifest.updated_at);
    session.primeManifest(manifest);
    const periodEls = getPeriodElements(root);
    if (periodEls) {
      bindPeriodControls(periodEls, bounds, (state) => {
        renderCharts(root);
        void refreshCommentary(root, state);
      });
    }
  } catch {
    // Period chips stay on placeholders when the archive is unavailable.
  }
}

initRouteDeepApp();
