-- Project a performance CSV day snapshot to Parquet.
-- Env: PERFORMANCE_CSV_PATH, OUT_PARQUET_TMP
COPY (
  SELECT *
  FROM read_csv(
    getenv('PERFORMANCE_CSV_PATH'),
    header = true,
    auto_detect = true,
    sample_size = -1
  )
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
