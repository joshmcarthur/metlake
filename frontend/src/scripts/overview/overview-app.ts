import { ensureAnatomyViews } from "../../lib/anatomy";
import {
  networkHourHeatSql,
  sharedChokePointsSql,
} from "../../lib/anatomy-sql";
import { formatPeriodLabel } from "../../lib/format";
import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
  requireRoutePerformanceSource,
} from "../../lib/manifest";
import {
  getLeaderboard,
  getNetworkDailySeries,
  getPeriodSummary,
  loadRoutePerformance,
  RoutePerformanceSession,
} from "../../lib/performance";
import { isArchiveError } from "../../lib/types";
import { renderDelayRangeForPeriod } from "../charts/delay-range";
import { renderPunctualityCalendar } from "./charts/calendar";
import { renderChokePoints } from "./charts/choke-points";
import { renderCancellationsChart } from "./charts/cancellations";
import { renderNetworkHourHeat } from "./charts/hour-heat";
import { replayPageHref } from "../../lib/site";
import {
  bindPeriodControls,
  boundsFromManifest,
  getPeriodElements,
  getPriorRange,
  unionManifestMonths,
  type PeriodElements,
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

async function refreshPeriod(
  state: PeriodState,
  periodEls: PeriodElements,
): Promise<void> {
  if (!session) return;

  const token = ++loadToken;
  showScorecardLoading();

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

    const replayLink = document.querySelector<HTMLAnchorElement>("[data-replay-link]");
    if (replayLink) {
      replayLink.href = replayPageHref({
        from: state.range.from,
        to: state.range.to,
      });
      replayLink.hidden = false;
    }

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

    const hourRoot = document.getElementById("net-hour-heat");
    const chokeRoot = document.getElementById("net-corridors");
    const flags = await ensureAnatomyViews(conn, state.range);
    if (token !== loadToken) return;
    if (hourRoot) {
      if (!flags.hourHeat) {
        hourRoot.className = "heatmap chart-slot-disabled";
        hourRoot.innerHTML = `<p class="rt-stub-note">No trip-update delay data for this period.</p>`;
      } else {
        const table = await conn.query(
          networkHourHeatSql(state.range.from, state.range.to),
        );
        if (token !== loadToken) return;
        renderNetworkHourHeat(
          hourRoot,
          table.toArray().map((row) => ({
            weekday: Number(row.weekday),
            hour: Number(row.hour),
            delay_seconds:
              row.delay_seconds == null ? null : Number(row.delay_seconds),
          })),
        );
      }
    }
    if (chokeRoot) {
      if (!flags.injectors) {
        chokeRoot.className = "chart-slot-disabled";
        chokeRoot.innerHTML = `<p class="rt-stub-note">No trip-update delay data for this period.</p>`;
      } else {
        const table = await conn.query(
          sharedChokePointsSql(state.range.from, state.range.to),
        );
        if (token !== loadToken) return;
        renderChokePoints(
          chokeRoot,
          table.toArray().map((row) => ({
            from_stop_name:
              row.from_stop_name == null ? null : String(row.from_stop_name),
            to_stop_name:
              row.to_stop_name == null ? null : String(row.to_stop_name),
            delay_added:
              row.delay_added == null ? null : Number(row.delay_added),
            n_routes: Number(row.n_routes),
            n_trips: Number(row.n_trips),
          })),
        );
      }
    }

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
    requireRoutePerformanceSource(manifest, rtManifest);
    const bounds = boundsFromManifest(
      unionManifestMonths(manifest?.months, rtManifest?.months),
    );
    session.primeManifest(manifest);
    session.primeRtManifest(rtManifest);

    showContent();

    const commentaryRoot = document.querySelector<HTMLElement>("[data-ai-commentary]");
    if (commentaryRoot) commentaryPanel = mountCommentaryPanel(commentaryRoot);

    const periodEls = getPeriodElements(root);
    if (!periodEls) return;

    bindPeriodControls(periodEls, bounds, (state) => {
      void refreshPeriod(state, periodEls);
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
