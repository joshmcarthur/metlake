-- Trip × stop × day sampled spine.
-- Env: TRIPUPDATES_GLOB, ROUTES_PARQUET, TRIPS_PARQUET, STOP_TIMES_PARQUET,
-- STOPS_PARQUET, MONTH (YYYY-MM), OUT_PARQUET_TMP
COPY (
  WITH
  month_start AS (
    SELECT CAST(getenv('MONTH') || '-01' AS DATE) AS start
  ),
  month_end AS (
    SELECT (start + INTERVAL 1 MONTH) AS stop FROM month_start
  ),
  base AS (
    SELECT
      capture_hour,
      feed_timestamp,
      to_json(entity) AS ent
    FROM read_parquet(getenv('TRIPUPDATES_GLOB'), union_by_name = true)
  ),
  with_stus AS (
    SELECT
      capture_hour,
      feed_timestamp,
      ent,
      CASE json_type(json_extract(ent, '$.trip_update.stop_time_update'))
        WHEN 'ARRAY' THEN CAST(json_extract(ent, '$.trip_update.stop_time_update') AS JSON[])
        WHEN 'OBJECT' THEN [json_extract(ent, '$.trip_update.stop_time_update')]
        ELSE CAST([] AS JSON[])
      END AS stus
    FROM base
  ),
  rt_stops AS (
    SELECT
      CAST(left(capture_hour, 10) AS DATE) AS day,
      feed_timestamp,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(stu, '$.stop_id') AS stop_id,
      TRY_CAST(json_extract_string(stu, '$.stop_sequence') AS INTEGER) AS rt_stop_sequence,
      COALESCE(
        TRY_CAST(json_extract_string(stu, '$.arrival.delay') AS INTEGER),
        TRY_CAST(json_extract_string(stu, '$.departure.delay') AS INTEGER)
      ) AS delay_seconds,
      stu_idx
    FROM with_stus,
    UNNEST(stus) WITH ORDINALITY AS u(stu, stu_idx)
    WHERE len(stus) > 0
  ),
  latest_stop AS (
    SELECT
      day,
      trip_id,
      rt_route_id,
      stop_id,
      rt_stop_sequence,
      delay_seconds
    FROM rt_stops
    WHERE trip_id IS NOT NULL
      AND stop_id IS NOT NULL
      AND delay_seconds IS NOT NULL
      AND day >= (SELECT start FROM month_start)
      AND day < (SELECT stop FROM month_end)
    QUALIFY row_number() OVER (
      PARTITION BY day, trip_id, stop_id
      ORDER BY feed_timestamp DESC NULLS LAST, stu_idx DESC
    ) = 1
  ),
  first_dep AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      TRY_CAST(departure_time AS TIME) AS start_time
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
    QUALIFY CAST(stop_sequence AS INTEGER)
      = MIN(CAST(stop_sequence AS INTEGER)) OVER (PARTITION BY trip_id)
  ),
  gtfs_seq AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      CAST(stop_id AS VARCHAR) AS stop_id,
      CAST(stop_sequence AS INTEGER) AS stop_sequence
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
  )
  SELECT
    ls.day,
    ls.trip_id,
    COALESCE(CAST(rt.route_short_name AS VARCHAR), ls.rt_route_id) AS route,
    COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id) AS route_id,
    CAST(tr.direction_id AS INTEGER) AS direction_id,
    ls.stop_id,
    COALESCE(gs.stop_sequence, ls.rt_stop_sequence) AS stop_sequence,
    CAST(st.stop_name AS VARCHAR) AS stop_name,
    ls.delay_seconds,
    fd.start_time
  FROM latest_stop AS ls
  LEFT JOIN read_parquet(getenv('TRIPS_PARQUET')) AS tr
    ON CAST(tr.trip_id AS VARCHAR) = ls.trip_id
  LEFT JOIN gtfs_seq AS gs
    ON gs.trip_id = ls.trip_id AND gs.stop_id = ls.stop_id
  LEFT JOIN first_dep AS fd
    ON fd.trip_id = ls.trip_id
  LEFT JOIN read_parquet(getenv('STOPS_PARQUET')) AS st
    ON CAST(st.stop_id AS VARCHAR) = ls.stop_id
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS rt
    ON CAST(rt.route_id AS VARCHAR) = COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id)
    OR CAST(rt.route_short_name AS VARCHAR) = COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
