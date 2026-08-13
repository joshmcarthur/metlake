import { directionIdFromChip, ensureAnatomyViews } from "../../lib/anatomy";
import {
  routeHourHeatSql,
  routeInjectorsSql,
  routeStopProfileSql,
} from "../../lib/anatomy-sql";
import type { DuckDbConnection } from "../../lib/duckdb";
import { formatPeriodLabel } from "../../lib/format";
import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
  monthsIntersectingPeriod,
  requireRoutePerformanceSource,
} from "../../lib/manifest";
import {
  getDailySeries,
  getRouteDailyExport,
  getRouteLongName,
  getRoutePeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { routeIdFromDocument } from "../../lib/route-path";
import { queryPageHref } from "../../lib/site";
import {
  isArchiveError,
  type DateRange,
  type PeriodSummary,
  type RouteDailyPoint,
} from "../../lib/types";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  unionManifestMonths,
  type PeriodElements,
  type PeriodState,
} from "../overview/period";
import { buildRouteBrief } from "../commentary/brief";
import { mountCommentaryPanel } from "../commentary/commentary-app";
import { bindCsvExport, updateParquetLink } from "./export";
import { bindMetricChips, type RouteMetricState } from "./metrics";
import { renderRouteScorecard, showRouteScorecardLoading } from "./scorecard";
import { renderRouteSeries } from "./series";
import { bindDirectionToggle, type Direction } from "./direction";
import { renderHourHeatmap } from "./charts/heatmap";
import { renderInjectors } from "./charts/injectors";
import { renderStopProfile } from "./charts/profile";
import { renderDelayRangeForPeriod } from "../charts/delay-range";

let session: RoutePerformanceSession | null = null;
let loadToken = 0;
let anatomyToken = 0;
let metricState: RouteMetricState = { metrics: new Set(["punctuality", "reliability"]) };
let currentPeriod: PeriodState | null = null;
let routeId = "";
let cachedSeries: RouteDailyPoint[] | null = null;
let cachedPriorSeries: RouteDailyPoint[] | null = null;
let cachedCompare = false;
let routeName = "";
let commentaryPanel: ReturnType<typeof mountCommentaryPanel> | null = null;
let currentDirection: Direction = "inbound";
let cachedSummary: PeriodSummary | null = null;
let cachedPrior: PeriodSummary | null = null;
let cachedAnatomyConn: DuckDbConnection | null = null;
let cachedAnatomyRange: DateRange | null = null;

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

async function renderDelayAnatomy(
  conn: DuckDbConnection | null,
  range: DateRange | null,
  route: string,
  direction: Direction,
): Promise<void> {
  const token = ++anatomyToken;
  const root = document.getElementById("route-root");
  if (!root) return;

  const profile = root.querySelector<HTMLElement>("#profile-root");
  const injectors = root.querySelector<HTMLElement>("#injector-list");
  const heatmap = root.querySelector<HTMLElement>("#heatmap-root");

  if (!conn || !range) {
    if (profile) renderStopProfile(profile, []);
    if (injectors) renderInjectors(injectors, []);
    if (heatmap) renderHourHeatmap(heatmap, []);
    return;
  }

  const directionId = directionIdFromChip(direction);
  const flags = await ensureAnatomyViews(conn, range);
  if (token !== anatomyToken) return;

  if (profile) {
    if (!flags.profile) {
      renderStopProfile(profile, []);
    } else {
      const table = await conn.query(
        routeStopProfileSql(route, range.from, range.to, directionId),
      );
      if (token !== anatomyToken) return;
      renderStopProfile(
        profile,
        table.toArray().map((row) => ({
          stop_name: row.stop_name == null ? null : String(row.stop_name),
          stop_sequence:
            row.stop_sequence == null ? null : Number(row.stop_sequence),
          median_delay_seconds:
            row.median_delay_seconds == null
              ? null
              : Number(row.median_delay_seconds),
        })),
      );
    }
  }

  if (injectors) {
    if (!flags.injectors) {
      renderInjectors(injectors, []);
    } else {
      const table = await conn.query(
        routeInjectorsSql(route, range.from, range.to, directionId),
      );
      if (token !== anatomyToken) return;
      renderInjectors(
        injectors,
        table.toArray().map((row) => ({
          from_stop_name:
            row.from_stop_name == null ? null : String(row.from_stop_name),
          to_stop_name:
            row.to_stop_name == null ? null : String(row.to_stop_name),
          delay_added:
            row.delay_added == null ? null : Number(row.delay_added),
          n_trips: Number(row.n_trips),
        })),
      );
    }
  }

  if (heatmap) {
    if (!flags.hourHeat) {
      renderHourHeatmap(heatmap, []);
    } else {
      const table = await conn.query(
        routeHourHeatSql(route, range.from, range.to, directionId),
      );
      if (token !== anatomyToken) return;
      renderHourHeatmap(
        heatmap,
        table.toArray().map((row) => ({
          weekday: Number(row.weekday),
          hour: Number(row.hour),
          delay_seconds:
            row.delay_seconds == null ? null : Number(row.delay_seconds),
        })),
      );
    }
  }
}

function updateRouteBrief(): void {
  if (!cachedSummary) return;
  commentaryPanel?.updateBrief(
    buildRouteBrief(routeId, routeName, cachedSummary, cachedPrior, {
      direction: currentDirection,
      includeRtFields: false,
    }),
  );
}

function rerenderSeriesForMetric(): void {
  if (!cachedSeries) return;

  const seriesRoot = document.getElementById("route-series");
  if (!seriesRoot) return;

  renderRouteSeries(
    seriesRoot,
    cachedSeries,
    cachedPriorSeries,
    metricState.metrics,
    cachedCompare,
  );
}

function syncRouteHero(root: HTMLElement): void {
  const title = root.querySelector("h1");
  const desc = root.querySelector<HTMLElement>(".desc");
  if (title) title.textContent = routeId;
  if (desc) desc.textContent = routeName;
  root.dataset.route = routeId;
  root.dataset.routeName = routeName;
  const queryLink = root.querySelector<HTMLAnchorElement>("[data-query-link]");
  if (queryLink) queryLink.href = queryPageHref(routeId);
  document.title = routeName
    ? `Route ${routeId} · ${routeName} — Metlake`
    : `Route ${routeId} — Metlake`;
}

async function refreshRoute(
  state: PeriodState,
  periodEls: PeriodElements,
): Promise<void> {
  if (!session) return;

  const token = ++loadToken;
  showRouteScorecardLoading();

  try {
    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const { conn, estimated } = await loadRoutePerformance(
      state.range,
      session,
      fetch,
      priorRange,
    );
    if (token !== loadToken) return;

    periodEls.rangeMeta.textContent = formatPeriodLabel(
      state.range.from,
      state.range.to,
      estimated,
    );

    const manifest = session.getManifest();
    const months = manifest
      ? monthsIntersectingPeriod(manifest.months, state.range.from, state.range.to)
      : [];
    const latestMonth = months[months.length - 1];
    if (latestMonth) updateParquetLink(latestMonth);

    const [summary, prior, series, priorSeries, longName] = await Promise.all([
      getRoutePeriodSummary(conn, routeId, state.range),
      priorRange ? getRoutePeriodSummary(conn, routeId, priorRange) : Promise.resolve(null),
      getDailySeries(conn, routeId, state.range),
      priorRange ? getDailySeries(conn, routeId, priorRange) : Promise.resolve(null),
      getRouteLongName(conn, routeId),
    ]);

    if (token !== loadToken) return;

    const hasRouteRows =
      series.length > 0 ||
      summary.scheduled_trips != null ||
      summary.punctuality != null;
    if (!hasRouteRows) {
      showEmpty(
        `No route-performance rows for route ${routeId} in this period.`,
      );
      return;
    }

    showContent();
    if (longName) {
      routeName = longName;
      const root = document.getElementById("route-root");
      if (root) syncRouteHero(root);
    }
    renderRouteScorecard(summary, prior, state.key, state.compare);

    cachedSummary = summary;
    cachedPrior = prior;
    cachedSeries = series;
    cachedPriorSeries = priorSeries;
    cachedCompare = state.compare;
    updateRouteBrief();
    rerenderSeriesForMetric();
    cachedAnatomyConn = conn;
    cachedAnatomyRange = state.range;
    await renderDelayAnatomy(conn, state.range, routeId, currentDirection);

    const delayRoot = document.getElementById("route-delay-range");
    if (delayRoot) void renderDelayRangeForPeriod(delayRoot, conn, state.range, routeId);
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
    const rtManifest = await fetchRtRoutePerformanceManifest();
    requireRoutePerformanceSource(manifest, rtManifest);
    const bounds = boundsFromManifest(
      unionManifestMonths(manifest?.months, rtManifest?.months),
    );
    session.primeManifest(manifest);
    session.primeRtManifest(rtManifest);

    showContent();

    const periodEls = getPeriodElements(root);
    if (!periodEls) return;

    metricState = bindMetricChips(root, (state) => {
      metricState = state;
      rerenderSeriesForMetric();
    });

    bindDirectionToggle(root, (direction) => {
      currentDirection = direction;
      void renderDelayAnatomy(
        cachedAnatomyConn,
        cachedAnatomyRange,
        routeId,
        currentDirection,
      );
      updateRouteBrief();
    });
    void renderDelayAnatomy(null, null, routeId, currentDirection);

    bindPeriodControls(periodEls, bounds, (state) => {
      currentPeriod = state;
      void refreshRoute(state, periodEls);
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
