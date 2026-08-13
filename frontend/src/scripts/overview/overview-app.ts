import {
  getLeaderboard,
  getNetworkDailySeries,
  getPeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { fetchRoutePerformanceManifest, fetchRtRoutePerformanceManifest } from "../../lib/manifest";
import { isArchiveError } from "../../lib/types";
import { renderPunctualityCalendar } from "./charts/calendar";
import { renderCancellationsChart } from "./charts/cancellations";
import { renderDelayRangeForPeriod } from "../charts/delay-range";
import { renderDisabledRtCharts } from "./charts/disabled";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  type PeriodState,
} from "./period";
import { buildNetworkBrief } from "../commentary/brief";
import { mountCommentaryPanel } from "../commentary/commentary-app";
import { renderScorecard, showScorecardLoading } from "./scorecard";

let session: RoutePerformanceSession | null = null;
let loadToken = 0;
let commentaryPanel: ReturnType<typeof mountCommentaryPanel> | null = null;

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
    const priorRange = state.compare ? getPriorRange(state.range) : null;
    const { conn } = await loadRoutePerformance(state.range, session, fetch, priorRange);
    if (token !== loadToken) return;

    const [summary, prior, best, attention, daily] = await Promise.all([
      getPeriodSummary(conn, state.range),
      priorRange ? getPeriodSummary(conn, priorRange) : Promise.resolve(null),
      getLeaderboard(conn, state.range, "best"),
      getLeaderboard(conn, state.range, "attention"),
      getNetworkDailySeries(conn, state.range),
    ]);

    if (token !== loadToken) return;

    renderScorecard(summary, prior, best, attention, state.key, state.compare);
    commentaryPanel?.updateBrief(buildNetworkBrief(summary, prior, best, attention));

    const calRoot = document.getElementById("net-calendar");
    const sparkRoot = document.getElementById("net-cancel-spark");
    const delayRoot = document.getElementById("net-delay-range");
    if (calRoot) renderPunctualityCalendar(calRoot, daily, state.range);
    if (sparkRoot) renderCancellationsChart(sparkRoot, daily);
    if (delayRoot) void renderDelayRangeForPeriod(delayRoot, conn, state.range);
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
    const rtManifest = await fetchRtRoutePerformanceManifest();
    const bounds = boundsFromManifest(manifest.months);
    session.primeManifest(manifest);
    session.primeRtManifest(rtManifest);

    showContent();
    renderDisabledRtCharts();

    const commentaryRoot = document.querySelector<HTMLElement>("[data-ai-commentary]");
    if (commentaryRoot) commentaryPanel = mountCommentaryPanel(commentaryRoot);

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
