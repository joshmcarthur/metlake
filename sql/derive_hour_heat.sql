COPY (
  WITH trip_delay AS (
    SELECT
      day,
      trip_id,
      any_value(route) AS route,
      any_value(route_id) AS route_id,
      any_value(direction_id) AS direction_id,
      any_value(start_time) AS start_time,
      arg_max(delay_seconds, stop_sequence) AS delay_seconds
    FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
    GROUP BY day, trip_id
  )
  SELECT
    day,
    route,
    route_id,
    direction_id,
    EXTRACT(hour FROM start_time)::INTEGER AS hour,
    count(*)::INTEGER AS n_trips,
    MEDIAN(delay_seconds) AS median_delay_seconds
  FROM trip_delay
  WHERE start_time IS NOT NULL
  GROUP BY day, route, route_id, direction_id, hour
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
