import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import {
  delayInjectorsParquetHttpUrlForMonth,
  delayInjectorsVirtualNameForMonth,
  hourHeatParquetHttpUrlForMonth,
  hourHeatVirtualNameForMonth,
  lateTripsParquetHttpUrlForMonth,
  lateTripsVirtualNameForMonth,
  parquetHttpUrlForMonth,
  parquetVirtualNameForMonth,
  rtParquetHttpUrlForMonth,
  rtParquetVirtualNameForMonth,
  stopProfileParquetHttpUrlForMonth,
  stopProfileVirtualNameForMonth,
} from "./manifest";
import { splicedRoutePerformanceSql } from "./splice";
import { ArchiveError, EMPTY_ROUTE_PERFORMANCE_MESSAGE } from "./types";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
};

export const ROUTE_PERFORMANCE_VIEW = "route_performance";
export const PUBLISHED_ROUTE_PERFORMANCE_VIEW = "route_performance_published";
export const RT_ROUTE_PERFORMANCE_VIEW = "route_performance_rt";
export const LATE_TRIPS_VIEW = "late_trips";
export const STOP_PROFILE_VIEW = "stop_profile";
export const DELAY_INJECTORS_VIEW = "delay_injectors";
export const HOUR_HEAT_VIEW = "hour_heat";

export type DuckDbConnection = duckdb.AsyncDuckDBConnection;

let dbPromise: Promise<duckdb.AsyncDuckDB> | undefined;

async function createDuckDb(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  if (!bundle.mainWorker) {
    throw new Error("DuckDB-WASM bundle is missing a main worker.");
  }

  const worker = new Worker(bundle.mainWorker, { type: "module" });
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

/** Lazily initialise a shared DuckDB-WASM instance for client-side queries. */
export async function getDuckDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = createDuckDb();
  }
  return dbPromise;
}

export async function connectDuckDb(): Promise<DuckDbConnection> {
  const db = await getDuckDb();
  return db.connect();
}

async function registerParquetView(
  conn: DuckDbConnection,
  viewName: string,
  months: readonly string[],
  virtualNameForMonth: (month: string) => string,
  httpUrlForMonth: (month: string) => string,
  emptyMessage: string,
): Promise<void> {
  if (months.length === 0) {
    throw new ArchiveError("archive-empty", emptyMessage);
  }

  // DuckDB-WASM treats absolute paths like `/data/...` as local VFS globs, not
  // HTTP. Register each month as a same-origin HTTP URL first, then query the
  // virtual names (supports range requests via DuckDBDataProtocol.HTTP).
  const db = await getDuckDb();
  const virtualNames: string[] = [];
  for (const month of months) {
    const virtual = virtualNameForMonth(month);
    const httpUrl = httpUrlForMonth(month);
    await db.registerFileURL(
      virtual,
      httpUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    virtualNames.push(virtual);
  }

  const fileList = virtualNames
    .map((name) => `'${name.replace(/'/g, "''")}'`)
    .join(", ");

  await conn.query(`
    CREATE OR REPLACE VIEW ${viewName} AS
    SELECT *
    FROM read_parquet([${fileList}], union_by_name = true);
  `);
}

export async function registerSplicedRoutePerformance(
  conn: DuckDbConnection,
  publishedMonths: readonly string[],
  rtMonths: readonly string[],
): Promise<void> {
  if (publishedMonths.length === 0 && rtMonths.length === 0) {
    throw new ArchiveError("archive-empty", EMPTY_ROUTE_PERFORMANCE_MESSAGE);
  }

  if (publishedMonths.length > 0) {
    await registerParquetView(
      conn,
      PUBLISHED_ROUTE_PERFORMANCE_VIEW,
      publishedMonths,
      parquetVirtualNameForMonth,
      parquetHttpUrlForMonth,
      EMPTY_ROUTE_PERFORMANCE_MESSAGE,
    );
  }

  if (rtMonths.length > 0) {
    await registerParquetView(
      conn,
      RT_ROUTE_PERFORMANCE_VIEW,
      rtMonths,
      rtParquetVirtualNameForMonth,
      rtParquetHttpUrlForMonth,
      EMPTY_ROUTE_PERFORMANCE_MESSAGE,
    );
  }

  await conn.query(
    splicedRoutePerformanceSql(publishedMonths.length > 0, rtMonths.length > 0),
  );
}

export async function registerRoutePerformanceMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerSplicedRoutePerformance(conn, months, []);
}

export async function registerLateTripsMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerParquetView(
    conn,
    LATE_TRIPS_VIEW,
    months,
    lateTripsVirtualNameForMonth,
    lateTripsParquetHttpUrlForMonth,
    "No late-trips parquet files intersect the selected period.",
  );
}

export async function registerStopProfileMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerParquetView(
    conn,
    STOP_PROFILE_VIEW,
    months,
    stopProfileVirtualNameForMonth,
    stopProfileParquetHttpUrlForMonth,
    "No stop-profile parquet files intersect the selected period.",
  );
}

export async function registerDelayInjectorsMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerParquetView(
    conn,
    DELAY_INJECTORS_VIEW,
    months,
    delayInjectorsVirtualNameForMonth,
    delayInjectorsParquetHttpUrlForMonth,
    "No delay-injectors parquet files intersect the selected period.",
  );
}

export async function registerHourHeatMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerParquetView(
    conn,
    HOUR_HEAT_VIEW,
    months,
    hourHeatVirtualNameForMonth,
    hourHeatParquetHttpUrlForMonth,
    "No hour-heat parquet files intersect the selected period.",
  );
}

export async function closeDuckDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.terminate();
  dbPromise = undefined;
}
