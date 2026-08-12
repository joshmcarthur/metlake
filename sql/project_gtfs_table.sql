-- Project one GTFS table CSV to Parquet.
-- Env: GTFS_TXT_PATH, OUT_PARQUET_TMP
COPY (
  SELECT *
  FROM read_csv(
    getenv('GTFS_TXT_PATH'),
    header = true,
    auto_detect = true,
    sample_size = -1,
    ignore_errors = false,
    quote = '"',
    escape = '"'
  )
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
