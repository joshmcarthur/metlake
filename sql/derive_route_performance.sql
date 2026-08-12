-- Thin derived join: performance daily rows + GTFS routes metadata.
-- Env: PERFORMANCE_PARQUET_GLOB, ROUTES_PARQUET, OUT_PARQUET_TMP
COPY (
  SELECT
    p.*,
    r.route_short_name,
    r.route_long_name,
    r.route_type,
    r.agency_id,
    r.route_color
  FROM read_parquet(getenv('PERFORMANCE_PARQUET_GLOB'), union_by_name = true) AS p
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS r
    ON CAST(p.route AS VARCHAR) = CAST(r.route_short_name AS VARCHAR)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
