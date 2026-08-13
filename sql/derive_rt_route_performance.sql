COPY (
  SELECT
    t.day,
    t.route,
    any_value(CAST(r.route_short_name AS VARCHAR)) AS route_short_name,
    any_value(CAST(r.route_long_name AS VARCHAR)) AS route_long_name,
    any_value(CAST(r.route_type AS INTEGER)) AS route_type,
    COUNT(*) FILTER (WHERE t.scheduled) AS scheduled_trips,
    COUNT(*) FILTER (WHERE t.cancelled) AS cancellations,
    CASE
      WHEN COUNT(*) FILTER (WHERE t.scheduled) = 0 THEN NULL
      ELSE COUNT(*) FILTER (WHERE t.cancelled)::DOUBLE
           / COUNT(*) FILTER (WHERE t.scheduled)
    END AS cancellations_rate,
    CASE
      WHEN COUNT(*) FILTER (WHERE t.scheduled) = 0 THEN NULL
      ELSE 1 - COUNT(*) FILTER (WHERE t.cancelled)::DOUBLE
                / COUNT(*) FILTER (WHERE t.scheduled)
    END AS reliability,
    CASE
      WHEN COUNT(*) FILTER (WHERE t.observed AND NOT t.cancelled AND t.delay_seconds IS NOT NULL) = 0
      THEN NULL
      ELSE COUNT(*) FILTER (
             WHERE t.observed AND NOT t.cancelled
               AND t.delay_seconds BETWEEN -60 AND 300
           )::DOUBLE
           / COUNT(*) FILTER (
             WHERE t.observed AND NOT t.cancelled AND t.delay_seconds IS NOT NULL
           )
    END AS punctuality,
    CASE
      WHEN COUNT(*) FILTER (
             WHERE t.observed AND NOT t.cancelled AND t.delay_seconds IS NOT NULL
               AND (
                 t.start_time BETWEEN TIME '07:00:00' AND TIME '09:00:00'
                 OR t.start_time BETWEEN TIME '16:00:00' AND TIME '18:00:00'
               )
           ) = 0
      THEN NULL
      ELSE COUNT(*) FILTER (
             WHERE t.observed AND NOT t.cancelled
               AND t.delay_seconds BETWEEN -60 AND 300
               AND (
                 t.start_time BETWEEN TIME '07:00:00' AND TIME '09:00:00'
                 OR t.start_time BETWEEN TIME '16:00:00' AND TIME '18:00:00'
               )
           )::DOUBLE
           / COUNT(*) FILTER (
             WHERE t.observed AND NOT t.cancelled AND t.delay_seconds IS NOT NULL
               AND (
                 t.start_time BETWEEN TIME '07:00:00' AND TIME '09:00:00'
                 OR t.start_time BETWEEN TIME '16:00:00' AND TIME '18:00:00'
               )
           )
    END AS peak_punctuality,
    AVG(t.delay_seconds / 60.0) FILTER (
      WHERE t.observed AND NOT t.cancelled AND t.delay_seconds IS NOT NULL
    ) AS mean_departure_time_variance,
    'gtfs_rt' AS source
  FROM read_parquet(getenv('TRIP_PERFORMANCE_PARQUET')) AS t
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS r
    ON CAST(r.route_id AS VARCHAR) = t.route_id
    OR CAST(r.route_short_name AS VARCHAR) = t.route
  GROUP BY t.day, t.route
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
