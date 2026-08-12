import { connectDuckDb, registerRoutePerformanceMonths, type DuckDbConnection } from "./duckdb";
import { fetchRoutePerformanceManifest, monthsIntersectingPeriod } from "./manifest";
import type { DateRange, RoutePerformanceManifest } from "./types";

/** Reuses one DuckDB connection per overview (or route) session. */
export class RoutePerformanceSession {
  private conn: DuckDbConnection | null = null;
  private registeredMonths: string[] = [];
  private manifest: RoutePerformanceManifest | null = null;

  getManifest(): RoutePerformanceManifest | null {
    return this.manifest;
  }

  /** Avoid a second manifest fetch when the caller already loaded it. */
  primeManifest(manifest: RoutePerformanceManifest): void {
    this.manifest = manifest;
  }

  async ensureAllMonths(fetchFn: typeof fetch = fetch): Promise<DuckDbConnection> {
    if (!this.manifest) {
      this.manifest = await fetchRoutePerformanceManifest(fetchFn);
    }

    if (!this.conn) {
      this.conn = await connectDuckDb();
    }

    const months = [...this.manifest.months];
    const monthsKey = months.join(",");
    const registeredKey = this.registeredMonths.join(",");
    if (monthsKey !== registeredKey) {
      await registerRoutePerformanceMonths(this.conn, months);
      this.registeredMonths = months;
    }

    return this.conn;
  }

  async ensure(range: DateRange, fetchFn: typeof fetch = fetch): Promise<DuckDbConnection> {
    return this.ensureRanges(range, fetchFn);
  }

  async ensureRanges(
    range: DateRange,
    fetchFn: typeof fetch = fetch,
    priorRange?: DateRange | null,
  ): Promise<DuckDbConnection> {
    if (!this.manifest) {
      this.manifest = await fetchRoutePerformanceManifest(fetchFn);
    }

    const monthSet = new Set(
      monthsIntersectingPeriod(this.manifest.months, range.from, range.to),
    );
    if (priorRange) {
      for (const month of monthsIntersectingPeriod(
        this.manifest.months,
        priorRange.from,
        priorRange.to,
      )) {
        monthSet.add(month);
      }
    }

    const months = [...monthSet].sort();
    if (!this.conn) {
      this.conn = await connectDuckDb();
    }

    const monthsKey = months.join(",");
    const registeredKey = this.registeredMonths.join(",");
    if (monthsKey !== registeredKey) {
      await registerRoutePerformanceMonths(this.conn, months);
      this.registeredMonths = months;
    }

    return this.conn;
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
      this.registeredMonths = [];
    }
  }
}
