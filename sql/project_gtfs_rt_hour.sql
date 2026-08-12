-- Project raw GTFS-RT JSON captures for one hour into a Parquet file.
-- Env: RAW_GLOB, OUT_PARQUET_TMP, CAPTURE_HOUR (YYYY-MM-DDTHH), FEED_NAME
COPY (
  SELECT
    getenv('FEED_NAME') AS feed,
    getenv('CAPTURE_HOUR') AS capture_hour,
    filename AS source_file,
    header.timestamp AS feed_timestamp,
    header.gtfsRealtimeVersion AS gtfs_realtime_version,
    e AS entity
  FROM read_json(
    getenv('RAW_GLOB'),
    filename = true,
    maximum_object_size = 67108864,
    ignore_errors = false,
    union_by_name = true
  ),
  UNNEST(entity) AS u(e)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
