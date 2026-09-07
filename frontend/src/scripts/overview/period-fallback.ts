import type { DuckDbConnection } from "../../lib/duckdb.ts";
import { formatNzDate } from "../../lib/format.ts";
import type { DateRange } from "../../lib/types.ts";
import { priorLabel, priorRange, type PeriodKey } from "./period.ts";

export function shouldTryPeriodFallback(
  key: PeriodKey | "custom",
  compare: boolean,
): boolean {
  return !compare && key !== "all";
}

export function formatPeriodFallbackNote(
  key: PeriodKey | "custom",
  requested: DateRange,
  display: DateRange,
): string {
  const prior = priorLabel(key);
  const requestedLabel =
    requested.from === requested.to
      ? formatNzDate(requested.from)
      : `${formatNzDate(requested.from)} → ${formatNzDate(requested.to)}`;
  const displayLabel =
    display.from === display.to
      ? formatNzDate(display.from)
      : `${formatNzDate(display.from)} → ${formatNzDate(display.to)}`;
  return `No data yet for ${requestedLabel}. Showing the ${prior} (${displayLabel}).`;
}

export interface PeriodFallbackResult {
  displayRange: DateRange;
  fallbackNote: string | null;
}

export async function resolvePeriodFallback(
  conn: DuckDbConnection,
  requestedRange: DateRange,
  key: PeriodKey | "custom",
  compare: boolean,
  hasDataInRange: (connection: DuckDbConnection, range: DateRange) => Promise<boolean>,
  reloadForRange: (range: DateRange) => Promise<DuckDbConnection>,
): Promise<PeriodFallbackResult & { conn: DuckDbConnection }> {
  if (!shouldTryPeriodFallback(key, compare)) {
    return { displayRange: requestedRange, fallbackNote: null, conn };
  }

  if (await hasDataInRange(conn, requestedRange)) {
    return { displayRange: requestedRange, fallbackNote: null, conn };
  }

  const fallbackRange = priorRange(requestedRange);
  if (!fallbackRange) {
    return { displayRange: requestedRange, fallbackNote: null, conn };
  }

  let activeConn = conn;
  if (!(await hasDataInRange(activeConn, fallbackRange))) {
    activeConn = await reloadForRange(fallbackRange);
  }

  if (!(await hasDataInRange(activeConn, fallbackRange))) {
    return { displayRange: requestedRange, fallbackNote: null, conn: activeConn };
  }

  return {
    displayRange: fallbackRange,
    fallbackNote: formatPeriodFallbackNote(key, requestedRange, fallbackRange),
    conn: activeConn,
  };
}

export function updatePeriodFallbackNote(
  noteEl: HTMLElement | null,
  note: string | null,
): void {
  if (!noteEl) return;
  if (note) {
    noteEl.textContent = note;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
  }
}
