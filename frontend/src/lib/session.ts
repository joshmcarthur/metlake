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

  async ensure(range: DateRange, fetchFn: typeof fetch = fetch): Promise<DuckDbConnection> {
    if (!this.manifest) {
      this.manifest = await fetchRoutePerformanceManifest(fetchFn);
    }

    const months = monthsIntersectingPeriod(this.manifest.months, range.from, range.to);
    if (!this.conn) {
      this.conn = await connectDuckDb();
    }

    const monthsKey = months.join(",");
    const registeredKey = this.registeredMonths.join(",");
    if (monthsKey !== registeredKey) {
      await registerRoutePerformanceMonths(this.conn, months);
      this.registeredMonths = [...months];
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
