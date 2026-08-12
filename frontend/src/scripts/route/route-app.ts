import {
  getDailySeries,
  getRouteDailyExport,
  getRoutePeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { fetchRoutePerformanceManifest, monthsIntersectingPeriod } from "../../lib/manifest";
import { isArchiveError } from "../../lib/types";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  type PeriodState,
} from "../overview/period";
import { bindCsvExport, updateParquetLink } from "./export";
import { bindMetricChips, type RouteMetricState } from "./metrics";
import { renderRouteScorecard, showRouteScorecardLoading } from "./scorecard";
import { renderRouteSeries } from "./series";

let session: RoutePerformanceSession | null = null;
let loadToken = 0;
let metricState: RouteMetricState = { metric: "punctuality" };
let currentPeriod: PeriodState | null = null;
let routeId = "";

function showEmpty(message: string): void {
  const empty = document.getElementById("route-empty");
  const content = document.getElementById("route-content");
  const loading = document.getElementById("route-loading");
  const detail = empty?.querySelector<HTMLElement>("[data-empty-detail]");
  if (detail) detail.textContent = message;
  loading?.setAttribute("hidden", "");
  content?.setAttribute("hidden", "");
  empty?.removeAttribute("hidden");
}

function showContent(): void {
  document.getElementById("route-loading")?.setAttribute("hidden", "");
  document.getElementById("route-empty")?.setAttribute("hidden", "");
  document.getElementById("route-content")?.removeAttribute("hidden");
}

async function refreshRoute(state: PeriodState): Promise<void> {
  if (!session) return;

  const token = ++loadToken;
  showRouteScorecardLoading();

  try {
    const { conn } = await loadRoutePerformance(state.range, session);
    if (token !== loadToken) return;

    const manifest = session.getManifest();
    const months = manifest
      ? monthsIntersectingPeriod(manifest.months, state.range.from, state.range.to)
      : [];
    const latestMonth = months[months.length - 1];
    if (latestMonth) updateParquetLink(latestMonth);

    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const [summary, prior, series, priorSeries] = await Promise.all([
      getRoutePeriodSummary(conn, routeId, state.range),
      priorRange ? getRoutePeriodSummary(conn, routeId, priorRange) : Promise.resolve(null),
      getDailySeries(conn, routeId, state.range),
      priorRange ? getDailySeries(conn, routeId, priorRange) : Promise.resolve(null),
    ]);

    if (token !== loadToken) return;

    renderRouteScorecard(summary, prior, state.key, state.compare);

    const seriesRoot = document.getElementById("route-series");
    if (seriesRoot) {
      renderRouteSeries(
        seriesRoot,
        series,
        priorSeries,
        metricState.metric,
        `Route ${routeId}`,
        state.compare,
      );
    }
  } catch (error) {
    if (token !== loadToken) return;
    const message =
      isArchiveError(error) || error instanceof Error
        ? error.message
        : "Could not load route performance data.";
    showEmpty(message);
  }
}

export async function initRouteApp(): Promise<void> {
  const root = document.getElementById("route-root");
  if (!root) return;

  routeId = root.dataset.route ?? "";
  if (!routeId) return;

  session = new RoutePerformanceSession();
  window.addEventListener("pagehide", () => {
    void session?.close();
  });

  const csvButton = root.querySelector<HTMLButtonElement>("[data-export-csv]");
  if (csvButton) {
    bindCsvExport(
      csvButton,
      async () => {
        if (!session || !currentPeriod) return [];
        const { conn } = await loadRoutePerformance(currentPeriod.range, session);
        return getRouteDailyExport(conn, routeId, currentPeriod.range);
      },
      `route-${routeId}`,
    );
  }

  try {
    const manifest = await fetchRoutePerformanceManifest();
    const bounds = boundsFromManifest(manifest.months, manifest.updated_at);
    session.primeManifest(manifest);

    showContent();

    const periodEls = getPeriodElements(root);
    if (!periodEls) return;

    bindMetricChips(root, (metric) => {
      metricState = metric;
      if (currentPeriod) void refreshRoute(currentPeriod);
    });

    bindPeriodControls(periodEls, bounds, (state) => {
      currentPeriod = state;
      void refreshRoute(state);
    });
  } catch (error) {
    const message =
      isArchiveError(error) || error instanceof Error
        ? error.message
        : "Could not load the performance archive.";
    showEmpty(message);
  }
}

initRouteApp();
