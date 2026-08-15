import * as duckdb from "@duckdb/duckdb-wasm";

import {
  connectDuckDb,
  getDuckDb,
  type DuckDbConnection,
} from "./duckdb";
import {
  type HourBundle,
  type ReplayVehicle,
} from "./replay-lookup";
import type { ShapePoint } from "./replay-motion";
import {
  flattenHourSql,
  flattenPositionsOnlySql,
  gtfsTableUrl,
  routesForIdsSql,
  shapesForTripsSql,
  tripUpdatesHourUrl,
  vehiclePositionsHourUrl,
} from "./replay-sql";
import {
  nextUtcHourKey,
  splitUtcHourKey,
  utcHourKey,
} from "./replay-url";

export type { HourBundle, ReplayVehicle } from "./replay-lookup";
export {
  mergeCaptureTimes,
  routeLabel,
  shapeForTrip,
  vehiclesAt,
} from "./replay-lookup";

const MAX_CACHED_HOURS = 3;

function httpUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

async function parquetExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function registerParquet(
  virtual: string,
  path: string,
): Promise<boolean> {
  if (!(await parquetExists(path))) return false;
  const db = await getDuckDb();
  await db.registerFileURL(
    virtual,
    httpUrl(path),
    duckdb.DuckDBDataProtocol.HTTP,
    false,
  );
  return true;
}

function coerceRows(result: { toArray: () => unknown[] }): Record<string, unknown>[] {
  return result.toArray().map((row) => {
    if (row && typeof row === "object") return row as Record<string, unknown>;
    return {};
  });
}

async function resolveGtfsSnapshot(nzDate: string): Promise<string | null> {
  const [y, m, d] = nzDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 14; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    const shapesPath = gtfsTableUrl(iso, "shapes");
    if (await parquetExists(shapesPath)) return iso;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
}

function nzDateFromInstant(isoInstant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoInstant));
}

export class ReplayHourCache {
  private conn: DuckDbConnection | null = null;
  private cache = new Map<string, HourBundle>();
  private order: string[] = [];
  private inflight = new Map<string, Promise<HourBundle | null>>();

  async ensureConn(): Promise<DuckDbConnection> {
    if (!this.conn) this.conn = await connectDuckDb();
    return this.conn;
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    this.cache.clear();
    this.order = [];
    this.inflight.clear();
  }

  get(hourKey: string): HourBundle | null {
    return this.cache.get(hourKey) ?? null;
  }

  async loadHour(hourKey: string): Promise<HourBundle | null> {
    const cached = this.cache.get(hourKey);
    if (cached) {
      this.touch(hourKey);
      return cached;
    }
    const pending = this.inflight.get(hourKey);
    if (pending) return pending;

    const task = this.fetchHour(hourKey);
    this.inflight.set(hourKey, task);
    try {
      const bundle = await task;
      if (bundle) {
        this.cache.set(hourKey, bundle);
        this.touch(hourKey);
        this.evict();
      }
      return bundle;
    } finally {
      this.inflight.delete(hourKey);
    }
  }

  /** Ensure the hour of `t` and the following hour are loaded. */
  async ensureAround(isoInstant: string): Promise<{
    current: HourBundle | null;
    next: HourBundle | null;
  }> {
    const currentKey = utcHourKey(isoInstant);
    const nextKey = nextUtcHourKey(currentKey);
    const [current, next] = await Promise.all([
      this.loadHour(currentKey),
      this.loadHour(nextKey),
    ]);
    return { current, next };
  }

  private touch(hourKey: string): void {
    this.order = this.order.filter((k) => k !== hourKey);
    this.order.push(hourKey);
  }

  private evict(): void {
    while (this.order.length > MAX_CACHED_HOURS) {
      const oldest = this.order.shift();
      if (oldest) this.cache.delete(oldest);
    }
  }

  private async fetchHour(hourKey: string): Promise<HourBundle | null> {
    const { year, month, day, hour } = splitUtcHourKey(hourKey);
    const vpPath = vehiclePositionsHourUrl(year, month, day, hour);
    const tuPath = tripUpdatesHourUrl(year, month, day, hour);
    const vpVirtual = `replay_vp_${hourKey.replace(/[:T-]/g, "")}.parquet`;
    const tuVirtual = `replay_tu_${hourKey.replace(/[:T-]/g, "")}.parquet`;

    const vpOk = await registerParquet(vpVirtual, vpPath);
    if (!vpOk) return null;
    const tuOk = await registerParquet(tuVirtual, tuPath);

    const conn = await this.ensureConn();
    let raw: Record<string, unknown>[];
    try {
      const result = await conn.query(
        tuOk
          ? flattenHourSql(vpVirtual, tuVirtual)
          : flattenPositionsOnlySql(vpVirtual),
      );
      raw = coerceRows(result);
    } catch {
      return null;
    }
    const captures = new Map<number, ReplayVehicle[]>();
    const tripIds = new Set<string>();
    const routeIds = new Set<string>();

    for (const row of raw) {
      const feedTimestamp = Number(row.feed_timestamp);
      if (!Number.isFinite(feedTimestamp)) continue;
      const vehicle: ReplayVehicle = {
        feedTimestamp,
        tripId: String(row.trip_id),
        routeId: row.route_id == null ? "" : String(row.route_id),
        directionId:
          row.direction_id == null ? null : Number(row.direction_id),
        vehicleId: row.vehicle_id == null ? null : String(row.vehicle_id),
        lat: Number(row.lat),
        lon: Number(row.lon),
        bearing: row.bearing == null ? null : Number(row.bearing),
        delaySeconds:
          row.delay_seconds == null ? null : Number(row.delay_seconds),
      };
      if (!Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lon)) {
        continue;
      }
      const list = captures.get(feedTimestamp) ?? [];
      list.push(vehicle);
      captures.set(feedTimestamp, list);
      tripIds.add(vehicle.tripId);
      if (vehicle.routeId) routeIds.add(vehicle.routeId);
    }

    const captureTimes = [...captures.keys()].sort((a, b) => a - b);
    const shapes = new Map<string, ShapePoint[]>();
    const routeNames = new Map<
      string,
      { short: string | null; long: string | null }
    >();

    const nzDate = nzDateFromInstant(`${hourKey}:00:00Z`);
    const snapshot = await resolveGtfsSnapshot(nzDate);
    if (snapshot && tripIds.size > 0) {
      const shapesVirtual = `replay_shapes_${snapshot.replace(/-/g, "")}.parquet`;
      const tripsVirtual = `replay_trips_${snapshot.replace(/-/g, "")}.parquet`;
      const routesVirtual = `replay_routes_${snapshot.replace(/-/g, "")}.parquet`;
      const shapesOk = await registerParquet(
        shapesVirtual,
        gtfsTableUrl(snapshot, "shapes"),
      );
      const tripsOk = await registerParquet(
        tripsVirtual,
        gtfsTableUrl(snapshot, "trips"),
      );
      if (shapesOk && tripsOk) {
        try {
          const shapeTable = await conn.query(
            shapesForTripsSql(shapesVirtual, tripsVirtual, [...tripIds]),
          );
          for (const row of coerceRows(shapeTable)) {
            const tripId = String(row.trip_id);
            const pts = shapes.get(tripId) ?? [];
            pts.push({
              lat: Number(row.shape_pt_lat),
              lon: Number(row.shape_pt_lon),
              dist: Number(row.shape_dist_traveled) || 0,
            });
            shapes.set(tripId, pts);
          }
        } catch {
          // GPS-only fallback
        }
      }

      if (routeIds.size > 0) {
        const routesOk = await registerParquet(
          routesVirtual,
          gtfsTableUrl(snapshot, "routes"),
        );
        if (routesOk) {
          try {
            const routeTable = await conn.query(
              routesForIdsSql(routesVirtual, [...routeIds]),
            );
            for (const row of coerceRows(routeTable)) {
              routeNames.set(String(row.route_id), {
                short:
                  row.route_short_name == null
                    ? null
                    : String(row.route_short_name),
                long:
                  row.route_long_name == null
                    ? null
                    : String(row.route_long_name),
              });
            }
          } catch {
            // route labels optional
          }
        }
      }
    }

    return { hourKey, captures, captureTimes, shapes, routeNames };
  }
}
