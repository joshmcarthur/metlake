COPY (
  SELECT
    day,
    route,
    route_id,
    direction_id,
    stop_id,
    any_value(stop_sequence) AS stop_sequence,
    any_value(stop_name) AS stop_name,
    count(*)::INTEGER AS n_trips,
    AVG(delay_seconds) AS mean_delay_seconds,
    MEDIAN(delay_seconds) AS median_delay_seconds
  FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
  GROUP BY day, route, route_id, direction_id, stop_id
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
