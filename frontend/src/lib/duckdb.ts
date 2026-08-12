import * as duckdb from "@duckdb/duckdb-wasm";

import { parquetUrlForMonth } from "./manifest";
import { ArchiveError } from "./types";

export const ROUTE_PERFORMANCE_VIEW = "route_performance";

export type DuckDbConnection = duckdb.AsyncDuckDBConnection;

let dbPromise: Promise<duckdb.AsyncDuckDB> | undefined;

async function createDuckDb(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) {
    throw new Error("DuckDB-WASM bundle is missing a main worker.");
  }

  const worker = new Worker(bundle.mainWorker);
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

export async function registerRoutePerformanceMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  if (months.length === 0) {
    throw new ArchiveError(
      "archive-empty",
      "No route-performance parquet files intersect the selected period.",
    );
  }

  const urls = months.map((month) => parquetUrlForMonth(month));
  const urlList = urls.map((url) => `'${url.replace(/'/g, "''")}'`).join(", ");

  await conn.query(`
    CREATE OR REPLACE VIEW ${ROUTE_PERFORMANCE_VIEW} AS
    SELECT *
    FROM read_parquet([${urlList}], union_by_name = true);
  `);
}

export async function closeDuckDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.terminate();
  dbPromise = undefined;
}
