import {
  connectDuckDb,
  PUBLISHED_ROUTE_PERFORMANCE_VIEW,
  registerSplicedRoutePerformance,
  type DuckDbConnection,
} from "./duckdb";
import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
  monthsIntersectingPeriod,
} from "./manifest";
import { shouldFetchRtMonths } from "./splice";
import { ArchiveError, type DateRange, type RoutePerformanceManifest } from "./types";

function spliceKey(publishedMonths: readonly string[], rtMonths: readonly string[]): string {
  return `${publishedMonths.join(",")}|${rtMonths.join(",")}`;
}

function monthsForRanges(
  months: readonly string[],
  range: DateRange,
  priorRange?: DateRange | null,
): string[] {
  const monthSet = new Set(monthsIntersectingPeriod(months, range.from, range.to));
  if (priorRange) {
    for (const month of monthsIntersectingPeriod(months, priorRange.from, priorRange.to)) {
      monthSet.add(month);
    }
  }
  return [...monthSet].sort();
}

async function countPublishedDays(
  conn: DuckDbConnection,
  from: string,
  to: string,
): Promise<number> {
  const result = await conn.query(`
    SELECT COUNT(DISTINCT day) AS n
    FROM ${PUBLISHED_ROUTE_PERFORMANCE_VIEW}
    WHERE day >= DATE '${from}' AND day <= DATE '${to}';
  `);
  const n = result.toArray()[0]?.n;
  const count = Number(n);
  return Number.isFinite(count) ? count : 0;
}

/** Reuses one DuckDB connection per overview (or route) session. */
export class RoutePerformanceSession {
  private conn: DuckDbConnection | null = null;
  private registeredKey = "";
  private manifest: RoutePerformanceManifest | null = null;
  private rtManifest: RoutePerformanceManifest | null | undefined = undefined;

  getManifest(): RoutePerformanceManifest | null {
    return this.manifest;
  }

  /** Avoid a second manifest fetch when the caller already loaded it. */
  primeManifest(manifest: RoutePerformanceManifest): void {
    this.manifest = manifest;
  }

  primeRtManifest(manifest: RoutePerformanceManifest | null): void {
    this.rtManifest = manifest;
  }

  private async ensureOfficialManifest(
    fetchFn: typeof fetch,
  ): Promise<RoutePerformanceManifest> {
    if (!this.manifest) {
      this.manifest = await fetchRoutePerformanceManifest(fetchFn);
    }
    return this.manifest;
  }

  private async ensureRtManifest(
    fetchFn: typeof fetch,
  ): Promise<RoutePerformanceManifest | null> {
    if (this.rtManifest === undefined) {
      this.rtManifest = await fetchRtRoutePerformanceManifest(fetchFn);
    }
    return this.rtManifest;
  }

  private async registerSplice(
    publishedMonths: readonly string[],
    rtMonths: readonly string[],
  ): Promise<DuckDbConnection> {
    if (!this.conn) {
      this.conn = await connectDuckDb();
    }

    if (publishedMonths.length === 0 && rtMonths.length === 0) {
      throw new ArchiveError(
        "archive-empty",
        "No route-performance parquet files intersect the selected period.",
      );
    }

    const nextKey = spliceKey(publishedMonths, rtMonths);
    if (nextKey !== this.registeredKey) {
      await registerSplicedRoutePerformance(this.conn, publishedMonths, rtMonths);
      this.registeredKey = nextKey;
    }

    return this.conn;
  }

  async ensureAllMonths(fetchFn: typeof fetch = fetch): Promise<DuckDbConnection> {
    const manifest = await this.ensureOfficialManifest(fetchFn);
    const rtManifest = await this.ensureRtManifest(fetchFn);
    return this.registerSplice(manifest.months, rtManifest?.months ?? []);
  }

  async ensure(range: DateRange, fetchFn: typeof fetch = fetch): Promise<DuckDbConnection> {
    return this.ensureRanges(range, fetchFn);
  }

  async ensureRanges(
    range: DateRange,
    fetchFn: typeof fetch = fetch,
    priorRange?: DateRange | null,
  ): Promise<DuckDbConnection> {
    const manifest = await this.ensureOfficialManifest(fetchFn);
    const publishedMonths = monthsForRanges(manifest.months, range, priorRange);

    if (!this.conn) {
      this.conn = await connectDuckDb();
    }

    let publishedCount = 0;
    let priorPublishedCount = 0;
    if (publishedMonths.length > 0) {
      await this.registerSplice(publishedMonths, []);
      publishedCount = await countPublishedDays(this.conn, range.from, range.to);
      if (priorRange) {
        priorPublishedCount = await countPublishedDays(
          this.conn,
          priorRange.from,
          priorRange.to,
        );
      }
    }

    const needsRt =
      shouldFetchRtMonths(publishedCount, range.from, range.to) ||
      (priorRange != null &&
        shouldFetchRtMonths(priorPublishedCount, priorRange.from, priorRange.to));

    let rtMonths: string[] = [];
    if (needsRt) {
      const rtManifest = await this.ensureRtManifest(fetchFn);
      if (rtManifest) {
        rtMonths = monthsForRanges(rtManifest.months, range, priorRange);
      }
    }

    return this.registerSplice(publishedMonths, rtMonths);
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
      this.registeredKey = "";
    }
  }
}
