COPY (
  WITH ordered AS (
    SELECT
      day,
      trip_id,
      route,
      route_id,
      direction_id,
      stop_id,
      stop_name,
      stop_sequence,
      delay_seconds,
      LEAD(stop_id) OVER w AS to_stop_id,
      LEAD(stop_name) OVER w AS to_stop_name,
      LEAD(stop_sequence) OVER w AS to_sequence,
      LEAD(delay_seconds) OVER w AS to_delay
    FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
    WINDOW w AS (
      PARTITION BY day, trip_id
      ORDER BY stop_sequence NULLS LAST
    )
  )
  SELECT
    day,
    route,
    route_id,
    direction_id,
    stop_id AS from_stop_id,
    to_stop_id,
    stop_name AS from_stop_name,
    to_stop_name,
    stop_sequence AS from_sequence,
    to_sequence,
    count(*)::INTEGER AS n_trips,
    AVG(to_delay - delay_seconds) AS mean_delay_added_seconds
  FROM ordered
  WHERE to_stop_id IS NOT NULL
  GROUP BY
    day, route, route_id, direction_id,
    from_stop_id, to_stop_id, from_stop_name, to_stop_name,
    from_sequence, to_sequence
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
