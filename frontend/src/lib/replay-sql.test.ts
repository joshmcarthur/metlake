import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenHourSql,
  flattenPositionsOnlySql,
  gtfsTableUrl,
  routesForIdsSql,
  shapesForTripsSql,
  tripUpdatesHourUrl,
  vehiclePositionsHourUrl,
} from "./replay-sql.ts";

test("vehiclePositionsHourUrl builds curated hourly path", () => {
  assert.equal(
    vehiclePositionsHourUrl("2026", "08", "12", "08"),
    "/data/curated/gtfs-rt/vehiclepositions/hourly/2026/08/12/08.parquet",
  );
});

test("tripUpdatesHourUrl builds curated hourly path", () => {
  assert.equal(
    tripUpdatesHourUrl("2026", "08", "12", "08"),
    "/data/curated/gtfs-rt/tripupdates/hourly/2026/08/12/08.parquet",
  );
});

test("flattenHourSql reads nested vehicle fields and joins delay", () => {
  const sql = flattenHourSql("vp_hour.parquet", "tu_hour.parquet");
  assert.match(sql, /read_parquet\('vp_hour\.parquet'/);
  assert.match(sql, /read_parquet\('tu_hour\.parquet'/);
  assert.match(sql, /entity\.vehicle\.position\.latitude/);
  assert.match(sql, /entity\.vehicle\.position\.longitude/);
  assert.match(sql, /entity\.vehicle\.trip\.trip_id/);
  assert.match(sql, /stop_time_update/);
  assert.match(sql, /ARRAY/);
  assert.match(sql, /OBJECT/);
  assert.match(sql, /ASOF LEFT JOIN/);
  assert.match(sql, /arrival\.delay/);
  assert.match(sql, /feed_timestamp/);
});

test("shapesForTripsSql filters to requested trip ids", () => {
  const sql = shapesForTripsSql("gtfs_shapes.parquet", "gtfs_trips.parquet", [
    "trip_a",
    "trip_b",
  ]);
  assert.match(sql, /gtfs_shapes\.parquet/);
  assert.match(sql, /gtfs_trips\.parquet/);
  assert.match(sql, /trip_a/);
  assert.match(sql, /shape_pt_lat/);
  assert.match(sql, /shape_dist_traveled/);
});

test("gtfsTableUrl builds curated snapshot path", () => {
  assert.equal(
    gtfsTableUrl("2026-08-14", "shapes"),
    "/data/curated/gtfs/2026-08-14/shapes.parquet",
  );
});

test("flattenPositionsOnlySql has null delay and no tripupdates read", () => {
  const sql = flattenPositionsOnlySql("vp_hour.parquet");
  assert.match(sql, /read_parquet\('vp_hour\.parquet'/);
  assert.match(sql, /CAST\(NULL AS INTEGER\) AS delay_seconds/);
  assert.doesNotMatch(sql, /tripupdates/);
  assert.doesNotMatch(sql, /ASOF LEFT JOIN/);
});

test("flattenHourSql escapes quotes in virtual names", () => {
  const sql = flattenHourSql("vp'hour.parquet", "tu'hour.parquet");
  assert.match(sql, /vp''hour\.parquet/);
  assert.match(sql, /tu''hour\.parquet/);
});

test("shapesForTripsSql and routesForIdsSql are empty-safe", () => {
  assert.match(
    shapesForTripsSql("shapes.parquet", "trips.parquet", []),
    /WHERE 1 = 0/,
  );
  assert.match(routesForIdsSql("routes.parquet", []), /WHERE 1 = 0/);
});

test("routesForIdsSql filters to requested route ids", () => {
  const sql = routesForIdsSql("gtfs_routes.parquet", ["1", "110"]);
  assert.match(sql, /gtfs_routes\.parquet/);
  assert.match(sql, /'1'/);
  assert.match(sql, /'110'/);
  assert.match(sql, /route_short_name/);
});
