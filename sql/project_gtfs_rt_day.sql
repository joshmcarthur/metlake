-- Combine hourly GTFS-RT Parquet files into a daily file.
-- Env: HOURLY_GLOB, OUT_PARQUET_TMP
COPY (
  SELECT *
  FROM read_parquet(getenv('HOURLY_GLOB'), union_by_name = true)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
