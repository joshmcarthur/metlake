-- One row per trip that finished at least MIN_DELAY_SECONDS late (last-stop arrival).
-- Env: TRIPUPDATES_GLOB, TRIPUPDATES_PREV, ROUTES_PARQUET, STOP_TIMES_PARQUET, OUT_PARQUET_TMP, MIN_DELAY_SECONDS
-- Metlink JSON often sends stop_time_update as a single object, not an array.
COPY (
  WITH base AS (
    SELECT
      capture_hour,
      feed_timestamp,
      to_json(entity) AS ent
    FROM read_parquet(
      CASE
        WHEN length(coalesce(getenv('TRIPUPDATES_PREV'), '')) = 0
        THEN [getenv('TRIPUPDATES_GLOB')]
        ELSE [getenv('TRIPUPDATES_GLOB'), getenv('TRIPUPDATES_PREV')]
      END,
      union_by_name = true
    )
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
      COALESCE(
        TRY_STRPTIME(
          json_extract_string(ent, '$.trip_update.trip.start_date'),
          '%Y%m%d'
        )::DATE,
        CAST(
          timezone(
            'Pacific/Auckland',
            timezone('UTC', strptime(capture_hour || ':00:00', '%Y-%m-%dT%H:%M:%S'))
          ) AS DATE
        )
      ) AS day,
      feed_timestamp,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(stu, '$.stop_id') AS stop_id,
      TRY_CAST(json_extract_string(stu, '$.stop_sequence') AS INTEGER) AS stop_sequence,
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
      stop_sequence,
      delay_seconds,
      stu_idx
    FROM rt_stops
    WHERE trip_id IS NOT NULL
      AND delay_seconds IS NOT NULL
    QUALIFY row_number() OVER (
      PARTITION BY day, trip_id, stop_id
      ORDER BY feed_timestamp DESC NULLS LAST
    ) = 1
  ),
  gtfs_last AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      CAST(stop_id AS VARCHAR) AS stop_id
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
    QUALIFY CAST(stop_sequence AS INTEGER)
      = MAX(CAST(stop_sequence AS INTEGER)) OVER (PARTITION BY trip_id)
  ),
  picked AS (
    SELECT
      ls.day,
      ls.trip_id,
      ls.rt_route_id,
      ls.delay_seconds
    FROM latest_stop AS ls
    LEFT JOIN gtfs_last AS gl
      ON ls.trip_id = gl.trip_id
      AND ls.stop_id = gl.stop_id
    QUALIFY row_number() OVER (
      PARTITION BY ls.day, ls.trip_id
      ORDER BY
        (gl.stop_id IS NOT NULL) DESC,
        ls.stop_sequence DESC NULLS LAST,
        ls.stu_idx DESC
    ) = 1
  )
  SELECT
    p.day,
    COALESCE(CAST(r.route_short_name AS VARCHAR), p.rt_route_id) AS route,
    p.rt_route_id AS route_id,
    p.trip_id,
    p.delay_seconds
  FROM picked AS p
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS r
    ON CAST(r.route_id AS VARCHAR) = p.rt_route_id
  WHERE p.delay_seconds >= COALESCE(TRY_CAST(getenv('MIN_DELAY_SECONDS') AS INTEGER), 60)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
