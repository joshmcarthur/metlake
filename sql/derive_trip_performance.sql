-- Trip × day census.
-- Env: TRIPUPDATES_GLOB, TRIPUPDATES_PREV, ROUTES_PARQUET, TRIPS_PARQUET,
-- CALENDAR_PARQUET, CALENDAR_DATES_PARQUET, STOP_TIMES_PARQUET, MONTH (YYYY-MM),
-- OUT_PARQUET_TMP
COPY (
  WITH
  month_start AS (
    SELECT CAST(getenv('MONTH') || '-01' AS DATE) AS start
  ),
  month_end AS (
    SELECT (start + INTERVAL 1 MONTH) AS stop FROM month_start
  ),
  calendar_dates AS (
    SELECT
      CAST(service_id AS VARCHAR) AS service_id,
      strptime(CAST("date" AS VARCHAR), '%Y%m%d')::DATE AS day,
      CAST(exception_type AS INTEGER) AS exception_type
    FROM read_parquet(getenv('CALENDAR_DATES_PARQUET'), union_by_name = true)
  ),
  cal AS (
    SELECT
      CAST(service_id AS VARCHAR) AS service_id,
      CAST(monday AS INTEGER) AS monday,
      CAST(tuesday AS INTEGER) AS tuesday,
      CAST(wednesday AS INTEGER) AS wednesday,
      CAST(thursday AS INTEGER) AS thursday,
      CAST(friday AS INTEGER) AS friday,
      CAST(saturday AS INTEGER) AS saturday,
      CAST(sunday AS INTEGER) AS sunday,
      strptime(CAST(start_date AS VARCHAR), '%Y%m%d')::DATE AS start_date,
      strptime(CAST(end_date AS VARCHAR), '%Y%m%d')::DATE AS end_date
    FROM read_parquet(getenv('CALENDAR_PARQUET'))
  ),
  days AS (
    SELECT CAST(d AS DATE) AS day
    FROM month_start, month_end, range(start, stop, INTERVAL 1 DAY) AS t(d)
  ),
  first_dep AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      TRY_CAST(departure_time AS TIME) AS start_time
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
    QUALIFY CAST(stop_sequence AS INTEGER)
      = MIN(CAST(stop_sequence AS INTEGER)) OVER (PARTITION BY trip_id)
  ),
  scheduled AS (
    SELECT
      days.day,
      CAST(tr.trip_id AS VARCHAR) AS trip_id,
      CAST(tr.route_id AS VARCHAR) AS route_id,
      fd.start_time
    FROM days
    CROSS JOIN read_parquet(getenv('TRIPS_PARQUET')) AS tr
    JOIN cal
      ON cal.service_id = CAST(tr.service_id AS VARCHAR)
     AND days.day BETWEEN cal.start_date AND cal.end_date
     AND CASE isodow(days.day)
           WHEN 1 THEN cal.monday
           WHEN 2 THEN cal.tuesday
           WHEN 3 THEN cal.wednesday
           WHEN 4 THEN cal.thursday
           WHEN 5 THEN cal.friday
           WHEN 6 THEN cal.saturday
           WHEN 7 THEN cal.sunday
         END = 1
    LEFT JOIN calendar_dates AS removed
      ON removed.service_id = CAST(tr.service_id AS VARCHAR)
     AND removed.day = days.day
     AND removed.exception_type = 2
    LEFT JOIN first_dep AS fd
      ON fd.trip_id = CAST(tr.trip_id AS VARCHAR)
    WHERE removed.service_id IS NULL
    UNION
    SELECT
      added.day,
      CAST(tr.trip_id AS VARCHAR),
      CAST(tr.route_id AS VARCHAR),
      fd.start_time
    FROM calendar_dates AS added
    JOIN read_parquet(getenv('TRIPS_PARQUET')) AS tr
      ON CAST(tr.service_id AS VARCHAR) = added.service_id
    LEFT JOIN first_dep AS fd
      ON fd.trip_id = CAST(tr.trip_id AS VARCHAR)
    CROSS JOIN month_start
    CROSS JOIN month_end
    WHERE added.exception_type = 1
      AND added.day >= month_start.start
      AND added.day < month_end.stop
  ),
  tripupdates AS (
    SELECT *
    FROM read_parquet(
      CASE
        WHEN length(coalesce(getenv('TRIPUPDATES_PREV'), '')) = 0
        THEN [getenv('TRIPUPDATES_GLOB')]
        ELSE [getenv('TRIPUPDATES_GLOB'), getenv('TRIPUPDATES_PREV')]
      END,
      union_by_name = true
    )
  ),
  base AS (
    SELECT
      capture_hour,
      feed_timestamp,
      to_json(entity) AS ent,
      COALESCE(
        TRY_STRPTIME(
          json_extract_string(to_json(entity), '$.trip_update.trip.start_date'),
          '%Y%m%d'
        )::DATE,
        CAST(
          timezone(
            'Pacific/Auckland',
            timezone('UTC', strptime(capture_hour || ':00:00', '%Y-%m-%dT%H:%M:%S'))
          ) AS DATE
        )
      ) AS day
    FROM tripupdates
  ),
  hours_present AS (
    SELECT DISTINCT capture_hour FROM tripupdates
  ),
  expected_hours AS (
    SELECT
      days.day AS nz_date,
      strftime(
        timezone(
          'UTC',
          timezone('Pacific/Auckland', CAST(days.day AS TIMESTAMP) + (h * INTERVAL 1 HOUR))
        ),
        '%Y-%m-%dT%H'
      ) AS capture_hour
    FROM days,
    range(24) AS t(h)
  ),
  day_coverage AS (
    SELECT
      e.nz_date AS day,
      COUNT(DISTINCT e.capture_hour) AS expected_hours,
      COUNT(DISTINCT p.capture_hour) AS present_hours
    FROM expected_hours AS e
    LEFT JOIN hours_present AS p
      ON p.capture_hour = e.capture_hour
    GROUP BY e.nz_date
  ),
  with_stus AS (
    SELECT
      day,
      capture_hour,
      feed_timestamp,
      ent,
      CASE json_type(json_extract(ent, '$.trip_update.stop_time_update'))
        WHEN 'ARRAY' THEN CAST(json_extract(ent, '$.trip_update.stop_time_update') AS JSON[])
        WHEN 'OBJECT' THEN [json_extract(ent, '$.trip_update.stop_time_update')]
        ELSE CAST([] AS JSON[])
      END AS stus
    FROM base
  ),
  rt_obs AS (
    SELECT
      day,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(ent, '$.trip_update.trip.start_time') AS rt_start_time,
      json_extract_string(ent, '$.trip_update.trip.schedule_relationship') AS sr,
      feed_timestamp,
      u.stu_idx,
      COALESCE(
        TRY_CAST(json_extract_string(stu, '$.arrival.delay') AS INTEGER),
        TRY_CAST(json_extract_string(stu, '$.departure.delay') AS INTEGER)
      ) AS delay_seconds
    FROM with_stus,
    UNNEST(stus) WITH ORDINALITY AS u(stu, stu_idx)
    WHERE len(stus) > 0
    UNION ALL
    SELECT
      day,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(ent, '$.trip_update.trip.start_time') AS rt_start_time,
      json_extract_string(ent, '$.trip_update.trip.schedule_relationship') AS sr,
      feed_timestamp,
      CAST(NULL AS BIGINT) AS stu_idx,
      CAST(NULL AS INTEGER) AS delay_seconds
    FROM with_stus
    WHERE len(stus) = 0
  ),
  rt_trip AS (
    SELECT
      day,
      trip_id,
      any_value(rt_route_id) AS rt_route_id,
      TRY_CAST(any_value(rt_start_time) AS TIME) AS rt_start_time,
      BOOL_OR(
        upper(CAST(sr AS VARCHAR)) IN ('3', 'CANCELED', 'CANCELLED')
      ) AS cancelled,
      arg_max(delay_seconds, (feed_timestamp, stu_idx))
        FILTER (WHERE delay_seconds IS NOT NULL) AS delay_seconds
    FROM rt_obs
    WHERE trip_id IS NOT NULL
      AND day >= (SELECT start FROM month_start)
      AND day < (SELECT stop FROM month_end)
    GROUP BY day, trip_id
  ),
  census AS (
    SELECT
      COALESCE(s.day, r.day) AS day,
      COALESCE(s.trip_id, r.trip_id) AS trip_id,
      COALESCE(s.route_id, r.rt_route_id) AS route_id,
      s.trip_id IS NOT NULL AS scheduled,
      r.trip_id IS NOT NULL AS observed,
      COALESCE(cov.present_hours, 0) > 0 AS has_coverage,
      COALESCE(cov.present_hours, 0) = COALESCE(cov.expected_hours, 0)
        AND COALESCE(cov.expected_hours, 0) > 0 AS complete,
      COALESCE(r.cancelled, FALSE) AS explicit_cancel,
      r.delay_seconds,
      COALESCE(r.rt_start_time, s.start_time) AS start_time
    FROM scheduled AS s
    FULL OUTER JOIN rt_trip AS r
      ON s.day = r.day AND s.trip_id = r.trip_id
    LEFT JOIN day_coverage AS cov
      ON cov.day = COALESCE(s.day, r.day)
  )
  SELECT
    c.day,
    c.trip_id,
    COALESCE(CAST(rt.route_short_name AS VARCHAR), c.route_id) AS route,
    c.route_id,
    c.scheduled,
    c.observed,
    (c.explicit_cancel
      OR (c.scheduled AND NOT c.observed AND c.complete)) AS cancelled,
    (c.scheduled AND NOT c.observed AND NOT c.explicit_cancel AND NOT c.complete) AS pending,
    c.complete,
    c.delay_seconds,
    c.start_time
  FROM census AS c
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS rt
    ON CAST(rt.route_id AS VARCHAR) = c.route_id
    OR CAST(rt.route_short_name AS VARCHAR) = c.route_id
  WHERE c.has_coverage OR c.observed
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
