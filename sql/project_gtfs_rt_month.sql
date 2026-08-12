-- Combine daily GTFS-RT Parquet files into a monthly file.
-- Env: DAILY_GLOB, OUT_PARQUET_TMP
COPY (
  SELECT *
  FROM read_parquet(getenv('DAILY_GLOB'), union_by_name = true)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
