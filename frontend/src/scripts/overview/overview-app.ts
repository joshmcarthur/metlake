import {
  getDataBounds,
  getLeaderboard,
  getNetworkDailySeries,
  getPeakGapByRoute,
  getPeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import { isArchiveError } from "../../lib/types";
import { renderPunctualityCalendar } from "./charts/calendar";
import { renderCancellationsSparkline } from "./charts/cancellations";
import { renderDisabledRtCharts } from "./charts/disabled";
import { renderPeakGapScatter } from "./charts/peak-gap";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  type PeriodState,
} from "./period";
import { renderScorecard, showScorecardLoading } from "./scorecard";

let session: RoutePerformanceSession | null = null;
let loadToken = 0;

function showEmpty(message: string): void {
  const empty = document.getElementById("overview-empty");
  const content = document.getElementById("overview-content");
  const loading = document.getElementById("overview-loading");
  const detail = empty?.querySelector<HTMLElement>("[data-empty-detail]");
  if (detail) detail.textContent = message;
  loading?.setAttribute("hidden", "");
  content?.setAttribute("hidden", "");
  empty?.removeAttribute("hidden");
}

function showContent(): void {
  document.getElementById("overview-loading")?.setAttribute("hidden", "");
  document.getElementById("overview-empty")?.setAttribute("hidden", "");
  document.getElementById("overview-content")?.removeAttribute("hidden");
}

async function refreshPeriod(state: PeriodState): Promise<void> {
  if (!session) return;

  const token = ++loadToken;
  showScorecardLoading();

  try {
    const { conn } = await loadRoutePerformance(state.range, session);
    if (token !== loadToken) return;

    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const [summary, prior, best, attention, daily, peakGap] = await Promise.all([
      getPeriodSummary(conn, state.range),
      priorRange ? getPeriodSummary(conn, priorRange) : Promise.resolve(null),
      getLeaderboard(conn, state.range, "best"),
      getLeaderboard(conn, state.range, "attention"),
      getNetworkDailySeries(conn, state.range),
      getPeakGapByRoute(conn, state.range),
    ]);

    if (token !== loadToken) return;

    renderScorecard(summary, prior, best, attention, state.key, state.compare);

    const calRoot = document.getElementById("net-calendar");
    const sparkRoot = document.getElementById("net-cancel-spark");
    const scatterRoot = document.getElementById("net-scatter");
    if (calRoot) renderPunctualityCalendar(calRoot, daily);
    if (sparkRoot) renderCancellationsSparkline(sparkRoot, daily);
    if (scatterRoot) renderPeakGapScatter(scatterRoot, peakGap);
  } catch (error) {
    if (token !== loadToken) return;
    const message =
      isArchiveError(error) || error instanceof Error
        ? error.message
        : "Could not load performance data.";
    showEmpty(message);
  }
}

export async function initOverviewApp(): Promise<void> {
  const root = document.getElementById("overview-root");
  if (!root) return;

  session = new RoutePerformanceSession();
  window.addEventListener("pagehide", () => {
    void session?.close();
  });

  try {
    const manifest = await fetchRoutePerformanceManifest();
    const bounds = boundsFromManifest(manifest.months, manifest.updated_at);

    const { conn } = await loadRoutePerformance(
      { from: bounds.allFrom, to: bounds.allTo },
      session,
    );
    const dataBounds = await getDataBounds(conn);
    if (dataBounds) {
      bounds.asOf = dataBounds.to;
      bounds.allFrom = dataBounds.from;
      bounds.allTo = dataBounds.to;
    }

    showContent();
    renderDisabledRtCharts();

    const periodEls = getPeriodElements(root);
    if (!periodEls) return;

    bindPeriodControls(periodEls, bounds, (state) => {
      void refreshPeriod(state);
    });
  } catch (error) {
    const message =
      isArchiveError(error) || error instanceof Error
        ? error.message
        : "Could not load the performance archive.";
    showEmpty(message);
  }
}

initOverviewApp();
