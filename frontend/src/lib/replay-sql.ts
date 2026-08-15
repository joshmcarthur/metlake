function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** Same-origin path for curated vehicle-positions hourly parquet. */
export function vehiclePositionsHourUrl(
  year: string,
  month: string,
  day: string,
  hour: string,
): string {
  return `/data/curated/gtfs-rt/vehiclepositions/hourly/${year}/${month}/${day}/${hour}.parquet`;
}

/** Same-origin path for curated trip-updates hourly parquet. */
export function tripUpdatesHourUrl(
  year: string,
  month: string,
  day: string,
  hour: string,
): string {
  return `/data/curated/gtfs-rt/tripupdates/hourly/${year}/${month}/${day}/${hour}.parquet`;
}

/** Same-origin path for a curated GTFS table parquet. */
export function gtfsTableUrl(snapshotDate: string, table: string): string {
  return `/data/curated/gtfs/${snapshotDate}/${table}.parquet`;
}

/**
 * Flatten one UTC hour of vehicle positions and join delay from trip updates.
 * Virtual names must already be registered in DuckDB-WASM.
 */
export function flattenHourSql(vpVirtual: string, tuVirtual: string): string {
  const vp = escapeLiteral(vpVirtual);
  const tu = escapeLiteral(tuVirtual);
  return `
WITH vp AS (
  SELECT
    feed_timestamp,
    CAST(entity.vehicle.trip.trip_id AS VARCHAR) AS trip_id,
    CAST(entity.vehicle.trip.route_id AS VARCHAR) AS route_id,
    CAST(entity.vehicle.trip.direction_id AS INTEGER) AS direction_id,
    CAST(entity.vehicle.vehicle.id AS VARCHAR) AS vehicle_id,
    entity.vehicle.position.latitude AS lat,
    entity.vehicle.position.longitude AS lon,
    CAST(entity.vehicle.position.bearing AS DOUBLE) AS bearing
  FROM read_parquet('${vp}', union_by_name = true)
  WHERE entity.vehicle.position.latitude IS NOT NULL
    AND entity.vehicle.position.longitude IS NOT NULL
    AND entity.vehicle.trip.trip_id IS NOT NULL
),
tu_base AS (
  SELECT
    feed_timestamp,
    to_json(entity) AS ent
  FROM read_parquet('${tu}', union_by_name = true)
),
tu_with_stus AS (
  SELECT
    feed_timestamp,
    ent,
    CASE json_type(json_extract(ent, '$.trip_update.stop_time_update'))
      WHEN 'ARRAY' THEN CAST(json_extract(ent, '$.trip_update.stop_time_update') AS JSON[])
      WHEN 'OBJECT' THEN [json_extract(ent, '$.trip_update.stop_time_update')]
      ELSE CAST([] AS JSON[])
    END AS stus
  FROM tu_base
),
tu_delays AS (
  SELECT
    feed_timestamp,
    json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
    COALESCE(
      TRY_CAST(json_extract_string(stus[1], '$.arrival.delay') AS INTEGER),
      TRY_CAST(json_extract_string(stus[1], '$.departure.delay') AS INTEGER),
      TRY_CAST(json_extract_string(ent, '$.trip_update.delay') AS INTEGER)
    ) AS delay_seconds
  FROM tu_with_stus
  WHERE json_extract_string(ent, '$.trip_update.trip.trip_id') IS NOT NULL
),
tu_latest AS (
  SELECT trip_id, delay_seconds, feed_timestamp
  FROM tu_delays
  WHERE trip_id IS NOT NULL
  QUALIFY row_number() OVER (
    PARTITION BY trip_id, feed_timestamp
    ORDER BY feed_timestamp DESC NULLS LAST
  ) = 1
)
SELECT
  vp.feed_timestamp,
  vp.trip_id,
  vp.route_id,
  vp.direction_id,
  vp.vehicle_id,
  vp.lat,
  vp.lon,
  vp.bearing,
  tu.delay_seconds
FROM vp
ASOF LEFT JOIN tu_latest AS tu
  ON tu.trip_id = vp.trip_id
 AND tu.feed_timestamp <= vp.feed_timestamp
ORDER BY vp.feed_timestamp, vp.trip_id;
`;
}

/** Positions only (no trip-update join) when tripupdates hour is missing. */
export function flattenPositionsOnlySql(vpVirtual: string): string {
  const vp = escapeLiteral(vpVirtual);
  return `
SELECT
  feed_timestamp,
  CAST(entity.vehicle.trip.trip_id AS VARCHAR) AS trip_id,
  CAST(entity.vehicle.trip.route_id AS VARCHAR) AS route_id,
  CAST(entity.vehicle.trip.direction_id AS INTEGER) AS direction_id,
  CAST(entity.vehicle.vehicle.id AS VARCHAR) AS vehicle_id,
  entity.vehicle.position.latitude AS lat,
  entity.vehicle.position.longitude AS lon,
  CAST(entity.vehicle.position.bearing AS DOUBLE) AS bearing,
  CAST(NULL AS INTEGER) AS delay_seconds
FROM read_parquet('${vp}', union_by_name = true)
WHERE entity.vehicle.position.latitude IS NOT NULL
  AND entity.vehicle.position.longitude IS NOT NULL
  AND entity.vehicle.trip.trip_id IS NOT NULL
ORDER BY feed_timestamp, trip_id;
`;
}

/**
 * Load shape polylines for a set of trip_ids from registered GTFS parquet.
 */
export function shapesForTripsSql(
  shapesVirtual: string,
  tripsVirtual: string,
  tripIds: readonly string[],
): string {
  const shapes = escapeLiteral(shapesVirtual);
  const trips = escapeLiteral(tripsVirtual);
  if (tripIds.length === 0) {
    return `
SELECT
  CAST(NULL AS VARCHAR) AS trip_id,
  CAST(NULL AS VARCHAR) AS shape_id,
  CAST(NULL AS DOUBLE) AS shape_pt_lat,
  CAST(NULL AS DOUBLE) AS shape_pt_lon,
  CAST(NULL AS BIGINT) AS shape_pt_sequence,
  CAST(NULL AS DOUBLE) AS shape_dist_traveled
WHERE 1 = 0;
`;
  }
  const list = tripIds
    .map((id) => `'${escapeLiteral(id)}'`)
    .join(", ");
  return `
SELECT
  CAST(t.trip_id AS VARCHAR) AS trip_id,
  CAST(s.shape_id AS VARCHAR) AS shape_id,
  s.shape_pt_lat,
  s.shape_pt_lon,
  s.shape_pt_sequence,
  s.shape_dist_traveled
FROM read_parquet('${trips}', union_by_name = true) AS t
JOIN read_parquet('${shapes}', union_by_name = true) AS s
  ON CAST(s.shape_id AS VARCHAR) = CAST(t.shape_id AS VARCHAR)
WHERE CAST(t.trip_id AS VARCHAR) IN (${list})
ORDER BY t.trip_id, s.shape_pt_sequence;
`;
}

/** Resolve route short names for route_ids present in an hour. */
export function routesForIdsSql(
  routesVirtual: string,
  routeIds: readonly string[],
): string {
  const routes = escapeLiteral(routesVirtual);
  if (routeIds.length === 0) {
    return `
SELECT
  CAST(NULL AS VARCHAR) AS route_id,
  CAST(NULL AS VARCHAR) AS route_short_name,
  CAST(NULL AS VARCHAR) AS route_long_name
WHERE 1 = 0;
`;
  }
  const list = routeIds
    .map((id) => `'${escapeLiteral(id)}'`)
    .join(", ");
  return `
SELECT
  CAST(route_id AS VARCHAR) AS route_id,
  CAST(route_short_name AS VARCHAR) AS route_short_name,
  CAST(route_long_name AS VARCHAR) AS route_long_name
FROM read_parquet('${routes}', union_by_name = true)
WHERE CAST(route_id AS VARCHAR) IN (${list});
`;
}
