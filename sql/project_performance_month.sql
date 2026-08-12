-- Combine daily performance Parquet files for a month.
-- Env: PERFORMANCE_DAY_GLOB, OUT_PARQUET_TMP
COPY (
  SELECT *
  FROM read_parquet(getenv('PERFORMANCE_DAY_GLOB'), union_by_name = true)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
