import {
  getDailySeries,
  getRouteDailyExport,
  getRoutePeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { fetchRoutePerformanceManifest, monthsIntersectingPeriod } from "../../lib/manifest";
import { routeIdFromDocument } from "../../lib/route-path";
import { isArchiveError, type RouteDailyPoint } from "../../lib/types";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  type PeriodState,
} from "../overview/period";
import { buildRouteBrief } from "../commentary/brief";
import { mountCommentaryPanel } from "../commentary/commentary-app";
import { bindCsvExport, updateParquetLink } from "./export";
import { bindMetricChips, type RouteMetricState } from "./metrics";
import { renderRouteScorecard, showRouteScorecardLoading } from "./scorecard";
import { renderRouteSeries } from "./series";

let session: RoutePerformanceSession | null = null;
let loadToken = 0;
let metricState: RouteMetricState = { metric: "punctuality" };
let currentPeriod: PeriodState | null = null;
let routeId = "";
let cachedSeries: RouteDailyPoint[] | null = null;
let cachedPriorSeries: RouteDailyPoint[] | null = null;
let cachedCompare = false;
let routeName = "";
let commentaryPanel: ReturnType<typeof mountCommentaryPanel> | null = null;

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

function rerenderSeriesForMetric(): void {
  if (!cachedSeries) return;

  const seriesRoot = document.getElementById("route-series");
  if (!seriesRoot) return;

  renderRouteSeries(
    seriesRoot,
    cachedSeries,
    cachedPriorSeries,
    metricState.metric,
    `Route ${routeId}`,
    cachedCompare,
  );
}

function syncRouteHero(root: HTMLElement): void {
  const title = root.querySelector("h1");
  const desc = root.querySelector<HTMLElement>(".desc");
  const deepLink = root.querySelector<HTMLAnchorElement>('a[href*="/deep/"]');
  if (title) title.textContent = routeId;
  if (desc) desc.textContent = routeName;
  if (deepLink) deepLink.href = `/routes/${encodeURIComponent(routeId)}/deep/`;
  root.dataset.route = routeId;
  root.dataset.routeName = routeName;
  document.title = `Route ${routeId} — Metlake`;
}

async function refreshRoute(state: PeriodState): Promise<void> {
  if (!session) return;

  const token = ++loadToken;
  showRouteScorecardLoading();

  try {
    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const { conn } = await loadRoutePerformance(state.range, session, fetch, priorRange);
    if (token !== loadToken) return;

    const manifest = session.getManifest();
    const months = manifest
      ? monthsIntersectingPeriod(manifest.months, state.range.from, state.range.to)
      : [];
    const latestMonth = months[months.length - 1];
    if (latestMonth) updateParquetLink(latestMonth);

    const [summary, prior, series, priorSeries] = await Promise.all([
      getRoutePeriodSummary(conn, routeId, state.range),
      priorRange ? getRoutePeriodSummary(conn, routeId, priorRange) : Promise.resolve(null),
      getDailySeries(conn, routeId, state.range),
      priorRange ? getDailySeries(conn, routeId, priorRange) : Promise.resolve(null),
    ]);

    if (token !== loadToken) return;

    renderRouteScorecard(summary, prior, state.key, state.compare);
    commentaryPanel?.updateBrief(buildRouteBrief(routeId, routeName, summary, prior));

    cachedSeries = series;
    cachedPriorSeries = priorSeries;
    cachedCompare = state.compare;
    rerenderSeriesForMetric();
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

  routeId = routeIdFromDocument(root);
  routeName = root.dataset.routeName ?? "";
  if (!routeId) return;

  syncRouteHero(root);

  const commentaryRoot = document.querySelector<HTMLElement>("[data-ai-commentary]");
  if (commentaryRoot) commentaryPanel = mountCommentaryPanel(commentaryRoot);

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
        const priorRange = currentPeriod.compare
          ? getPriorRange(currentPeriod.range)
          : null;
        const { conn } = await loadRoutePerformance(
          currentPeriod.range,
          session,
          fetch,
          priorRange,
        );
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
      rerenderSeriesForMetric();
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
