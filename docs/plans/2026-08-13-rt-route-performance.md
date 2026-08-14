# GTFS-RT route-performance fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill scorecard days that Metlink’s published CSV does not cover by aggregating GTFS + GTFS-RT into a parallel route × day derive, then unioning it in DuckDB-WASM with official rows winning on overlap.

**Architecture:** Appliance jobs write `derived/trip-performance/` then `derived/rt-route-performance/` from curated trip updates and static GTFS. The browser loads official `route-performance` months plus RT months, and queries a spliced `route_performance` view (`published UNION ALL rt WHERE day NOT IN published`). Do not rewrite official parquet. Do not scan raw GTFS-RT in the browser.

**Tech Stack:** bash, DuckDB CLI, DuckDB-WASM, TypeScript, Astro static, existing `tests/smoke.sh` + frontend `node:test`.

## Global Constraints

- Infer from curated GTFS + GTFS-RT whenever the CSV has no row for that day.
- Official `derived/route-performance/` stays a CSV join; never mix methodologies in one file.
- Official wins on a given `day`.
- RT punctuality: latest observed delay in **[−60 s, +300 s]**; peak = trip start 07:00–09:00 or 16:00–18:00 NZ civil time.
- Cancellations: `schedule_relationship` CANCELED (enum `3` or name), or scheduled and never seen that day.
- Patronage / capacity stay CSV-only (null on RT rows).
- `late-trips` stays a separate last-stop extract; do not use it as the trip census.
- Metlink `stop_time_update` may be a JSON object or array (same handling as `sql/derive_late_trips.sql`).
- Empty only when **both** sources lack rows for the period.
- Period meta notes when any day in the window is RT-estimated.
- Follow existing script pattern: `set -euo pipefail`, `lib/common.sh`, DuckDB `.read` SQL, atomic rename, `_manifest.json`.
- TDD: failing test before production code. Smoke via `./tests/smoke.sh`. Frontend via `cd frontend && npm test`.
- Put SQL-string builders in `frontend/src/lib/splice.ts` so node:test never imports DuckDB-WASM.

## File map

| File | Responsibility |
| --- | --- |
| `sql/derive_trip_performance.sql` | Trip × day census from trip updates + GTFS calendar/trips/routes |
| `sql/derive_rt_route_performance.sql` | Route × day scorecard columns from trip-performance |
| `scripts/derive-trip-performance.sh` | Month job + manifest for trip-performance |
| `scripts/derive-rt-route-performance.sh` | Month job + manifest for rt-route-performance |
| `crontab` | Run both after daily GTFS-RT / GTFS project |
| `tests/smoke.sh` | Assert both derives from fixtures |
| `tests/fixtures/gtfs/full.zip` | Weekend service so 2026-08-01 is a scheduled day |
| `frontend/src/lib/types.ts` | `RT_ROUTE_PERFORMANCE_BASE` |
| `frontend/src/lib/manifest.ts` | Optional RT manifest fetch + URL helpers |
| `frontend/src/lib/splice.ts` | Day-span check, spliced-view SQL, estimate copy helper |
| `frontend/src/lib/duckdb.ts` | Register published + RT parquet; execute spliced view SQL |
| `frontend/src/lib/session.ts` | Load both manifests; skip RT when published days cover the window |
| `frontend/src/scripts/overview/overview-app.ts` | Prime RT manifest; set period estimate note |
| `frontend/src/scripts/route/route-app.ts` | Same |
| `frontend/src/scripts/nav/route-picker.ts` | Prime RT manifest so August-only routes catalog |
| `README.md` | Mention RT fallback derives |

---

### Task 1: Trip-day census derive

**Files:**
- Create: `sql/derive_trip_performance.sql`
- Create: `scripts/derive-trip-performance.sh`
- Modify: `tests/fixtures/gtfs/full.zip` (`calendar.txt` saturday/sunday = 1 so fixture day 2026-08-01 is in service)
- Modify: `tests/smoke.sh`

**Interfaces:**
- Consumes: curated tripupdates daily/monthly parquet; `routes.parquet`, `trips.parquet`, `calendar.parquet`, `stop_times.parquet`; optional `calendar_dates.parquet`
- Produces: `derived/trip-performance/YYYY-MM.parquet` columns: `day`, `trip_id`, `route`, `route_id`, `scheduled`, `observed`, `cancelled`, `delay_seconds`, `start_time`
- Env: `TRIPUPDATES_GLOB`, `ROUTES_PARQUET`, `TRIPS_PARQUET`, `CALENDAR_PARQUET`, `CALENDAR_DATES_PARQUET`, `STOP_TIMES_PARQUET`, `MONTH` (`YYYY-MM`), `OUT_PARQUET_TMP`

- [ ] **Step 1: Make 2026-08-01 a scheduled service day in the GTFS fixture**

2026-08-01 is a Saturday; current `calendar.txt` has `saturday=0`. Recreate the zip with saturday and sunday set to 1:

```bash
tmp="$(mktemp -d)"
unzip -q tests/fixtures/gtfs/full.zip -d "$tmp"
python3 - "$tmp/calendar.txt" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
lines = p.read_text().splitlines()
header, row = lines[0], lines[1].split(",")
row[6] = "1"
row[7] = "1"
p.write_text(header + "\n" + ",".join(row) + "\n")
PY
( cd "$tmp" && zip -q -r full.zip . )
mv "$tmp/full.zip" tests/fixtures/gtfs/full.zip
rm -rf "$tmp"
```

- [ ] **Step 2: Extend smoke.sh with a failing trip-performance assertion**

After the existing `derive late trips` block, add:

```bash
echo "== derive trip-performance =="
MONTH=2026-08 "${ROOT}/scripts/derive-trip-performance.sh"
test -f "${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/trip-performance/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/trip-performance/_manifest.json"
tp_rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet');" | tail -n 1)"
test "${tp_rows}" -ge 1
tp_t1="$(duckdb -csv -c "SELECT scheduled, observed FROM read_parquet('${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet') WHERE trip_id = 't1';" | tail -n 1)"
test "${tp_t1}" = "true,true"
```

- [ ] **Step 3: Run smoke and confirm it fails**

Run: `./tests/smoke.sh`

Expected: FAIL at `derive-trip-performance.sh` (not found).

- [ ] **Step 4: Add `sql/derive_trip_performance.sql`**

Filter output to `MONTH`. Treat `stop_time_update` as array or object (copy the `with_stus` CASE from `sql/derive_late_trips.sql`). `schedule_relationship` `3` / `CANCELED` / `CANCELLED` means cancelled. GTFS dates may be INTEGER `YYYYMMDD` — `strptime(CAST(x AS VARCHAR), '%Y%m%d')`.

When `calendar_dates.parquet` is missing, the shell writes a zero-row parquet (do not branch in SQL on getenv).

Full SQL (write this file verbatim, then fix only if smoke proves a DuckDB syntax issue):

```sql
-- Trip × day census.
-- Env: TRIPUPDATES_GLOB, ROUTES_PARQUET, TRIPS_PARQUET, CALENDAR_PARQUET,
-- CALENDAR_DATES_PARQUET, STOP_TIMES_PARQUET, MONTH (YYYY-MM), OUT_PARQUET_TMP
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
  base AS (
    SELECT
      capture_hour,
      feed_timestamp,
      to_json(entity) AS ent
    FROM read_parquet(getenv('TRIPUPDATES_GLOB'), union_by_name = true)
  ),
  with_stus AS (
    SELECT
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
      CAST(left(capture_hour, 10) AS DATE) AS day,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(ent, '$.trip_update.trip.start_time') AS rt_start_time,
      json_extract(ent, '$.trip_update.trip.schedule_relationship') AS sr,
      feed_timestamp,
      COALESCE(
        TRY_CAST(json_extract_string(stu, '$.arrival.delay') AS INTEGER),
        TRY_CAST(json_extract_string(stu, '$.departure.delay') AS INTEGER)
      ) AS delay_seconds
    FROM with_stus,
    UNNEST(stus) WITH ORDINALITY AS u(stu, stu_idx)
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
      arg_max(delay_seconds, feed_timestamp) AS delay_seconds
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
      COALESCE(r.cancelled, FALSE)
        OR (s.trip_id IS NOT NULL AND r.trip_id IS NULL) AS cancelled,
      r.delay_seconds,
      COALESCE(r.rt_start_time, s.start_time) AS start_time
    FROM scheduled AS s
    FULL OUTER JOIN rt_trip AS r
      ON s.day = r.day AND s.trip_id = r.trip_id
  )
  SELECT
    c.day,
    c.trip_id,
    COALESCE(CAST(rt.route_short_name AS VARCHAR), c.route_id) AS route,
    c.route_id,
    c.scheduled,
    c.observed,
    c.cancelled,
    c.delay_seconds,
    c.start_time
  FROM census AS c
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS rt
    ON CAST(rt.route_id AS VARCHAR) = c.route_id
    OR CAST(rt.route_short_name AS VARCHAR) = c.route_id
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
```

- [ ] **Step 5: Add `scripts/derive-trip-performance.sh`**

Copy `scripts/derive-late-trips.sh`. Changes:

- Dest `derived/trip-performance`
- `TRIPS_PARQUET` and `CALENDAR_PARQUET` beside `routes.parquet`
- `STOP_TIMES_PARQUET` as in late-trips
- If `calendar_dates.parquet` is missing, write a zero-row parquet to a temp path and export that
- `export MONTH`
- `duckdb -c ".read ${SQL_DIR}/derive_trip_performance.sql"`
- Same manifest rewrite as late-trips
- No tripupdates for the month: `log_warn` and `exit 0`
- `chmod +x`

Empty calendar_dates file:

```bash
duckdb -c "COPY (SELECT CAST(NULL AS VARCHAR) AS service_id, CAST(NULL AS INTEGER) AS date, CAST(NULL AS INTEGER) AS exception_type WHERE FALSE) TO '${calendar_dates}' (FORMAT PARQUET);"
```

- [ ] **Step 6: Run smoke**

Run: `./tests/smoke.sh`

Expected: `smoke tests passed`. If `t1` is not `true,true`, fix calendar zip or `isodow` mapping, not the assertion.

- [ ] **Step 7: Commit**

```bash
git add sql/derive_trip_performance.sql scripts/derive-trip-performance.sh tests/smoke.sh tests/fixtures/gtfs/full.zip
git commit -m "$(cat <<'EOF'
feat: derive trip-day census from GTFS and trip updates

EOF
)"
```

---

### Task 2: Route-day RT aggregate derive

**Files:**
- Create: `sql/derive_rt_route_performance.sql`
- Create: `scripts/derive-rt-route-performance.sh`
- Modify: `crontab`
- Modify: `tests/smoke.sh`

**Interfaces:**
- Consumes: `derived/trip-performance/${MONTH}.parquet`
- Produces: `derived/rt-route-performance/YYYY-MM.parquet` with `day`, `route`, `route_short_name`, `route_long_name`, `route_type`, `scheduled_trips`, `cancellations`, `cancellations_rate`, `reliability`, `punctuality`, `peak_punctuality`, `mean_departure_time_variance`, `source` (`'gtfs_rt'`)
- Env: `TRIP_PERFORMANCE_PARQUET`, `ROUTES_PARQUET`, `OUT_PARQUET_TMP`

- [ ] **Step 1: Add failing smoke assertions**

After trip-performance assertions:

```bash
echo "== derive rt-route-performance =="
MONTH=2026-08 "${ROOT}/scripts/derive-rt-route-performance.sh"
test -f "${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/rt-route-performance/_manifest.json"
rt_sched="$(duckdb -csv -c "SELECT SUM(scheduled_trips) FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet');" | tail -n 1)"
test "${rt_sched}" -ge 1
rt_source="$(duckdb -csv -c "SELECT DISTINCT source FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet');" | tail -n 1)"
test "${rt_source}" = "gtfs_rt"
```

- [ ] **Step 2: Run smoke; expect missing script**

Run: `./tests/smoke.sh`

Expected: FAIL at `derive-rt-route-performance.sh`.

- [ ] **Step 3: Add `sql/derive_rt_route_performance.sql`**

Punctuality = share of observed, non-cancelled trips with `delay_seconds` in `[-60, 300]`. Peak uses `start_time` in 07:00–09:00 or 16:00–18:00. `mean_departure_time_variance` is mean delay minutes.

```sql
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
```

- [ ] **Step 4: Add `scripts/derive-rt-route-performance.sh`**

Require `derived/trip-performance/${MONTH}.parquet`. If missing: `log_warn` and `exit 0`. Resolve `ROUTES_PARQUET` like late-trips. Write monthly parquet + `_manifest.json`. `chmod +x`.

- [ ] **Step 5: Schedule after daily GTFS-RT / GTFS**

In `crontab`, after `derive-late-trips.sh`, add:

```
47 2 * * * /opt/metlake/scripts/derive-trip-performance.sh
48 2 * * * /opt/metlake/scripts/derive-rt-route-performance.sh
```

Keep `derive-route-performance.sh` on the 1st-of-month CSV cadence.

- [ ] **Step 6: Run smoke and lint**

Run: `./tests/smoke.sh && ./tests/lint.sh`

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add sql/derive_rt_route_performance.sql scripts/derive-rt-route-performance.sh crontab tests/smoke.sh
git commit -m "$(cat <<'EOF'
feat: aggregate RT trip census to route-day performance

EOF
)"
```

---

### Task 3: Splice helpers (pure TypeScript)

**Files:**
- Create: `frontend/src/lib/splice.ts`
- Create: `frontend/src/lib/splice.test.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/manifest.ts`
- Modify: `frontend/src/lib/format.ts`

**Interfaces:**
- `RT_ROUTE_PERFORMANCE_BASE = "/data/derived/rt-route-performance"`
- `fetchRtRoutePerformanceManifest(fetchFn?): Promise<RoutePerformanceManifest | null>` — optional 404 like `fetchLateTripsManifest`
- `rtParquetUrlForMonth` / `rtParquetHttpUrlForMonth` / `rtParquetVirtualNameForMonth` → `rt_route_performance_${month}.parquet`
- `daysInclusive(from, to): number`
- `shouldFetchRtMonths(publishedDayCount, from, to): boolean` — false when count equals inclusive span
- `splicedRoutePerformanceSql(hasPublished, hasRt): string`
- `formatPeriodLabel(from, to, estimated?: boolean)` — when true, append ` · some days estimated from live feed`

- [ ] **Step 1: Write failing tests in `frontend/src/lib/splice.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldFetchRtMonths,
  splicedRoutePerformanceSql,
} from "./splice.ts";
import { formatPeriodLabel } from "./format.ts";

test("skips RT files when published rows cover every day in the window", () => {
  assert.equal(shouldFetchRtMonths(13, "2026-03-01", "2026-03-13"), false);
});

test("fetches RT files when the window has unpublished days", () => {
  assert.equal(shouldFetchRtMonths(0, "2026-08-01", "2026-08-13"), true);
  assert.equal(shouldFetchRtMonths(10, "2026-08-01", "2026-08-13"), true);
});

test("spliced SQL unions RT days the CSV lacks", () => {
  const sql = splicedRoutePerformanceSql(true, true);
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /NOT IN/);
  assert.match(sql, /'published'/);
});

test("spliced SQL is RT-only when published is absent", () => {
  const sql = splicedRoutePerformanceSql(false, true);
  assert.match(sql, /route_performance_rt/);
  assert.doesNotMatch(sql, /UNION/);
});

test("period label notes live-feed estimates", () => {
  assert.match(
    formatPeriodLabel("2026-08-01", "2026-08-13", true),
    /some days estimated from live feed/,
  );
  assert.doesNotMatch(
    formatPeriodLabel("2026-08-01", "2026-08-13", false),
    /estimated/,
  );
});
```

- [ ] **Step 2: Run tests; expect FAIL**

Run: `cd frontend && npm test -- src/lib/splice.test.ts`

Expected: missing module or missing export.

- [ ] **Step 3: Implement `splice.ts`, types, manifest URLs, and `formatPeriodLabel`**

```ts
function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInclusive(from: string, to: string): number {
  const start = parseIso(from).getTime();
  const end = parseIso(to).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function shouldFetchRtMonths(
  publishedDayCount: number,
  from: string,
  to: string,
): boolean {
  return publishedDayCount < daysInclusive(from, to);
}

export function splicedRoutePerformanceSql(
  hasPublished: boolean,
  hasRt: boolean,
): string {
  if (!hasPublished && !hasRt) {
    throw new Error("splicedRoutePerformanceSql requires at least one source");
  }
  if (hasPublished && hasRt) {
    return `
CREATE OR REPLACE VIEW route_performance AS
SELECT *, 'published' AS source
FROM route_performance_published
UNION ALL BY NAME
SELECT *
FROM route_performance_rt
WHERE day NOT IN (SELECT day FROM route_performance_published);
`;
  }
  if (hasRt) {
    return `
CREATE OR REPLACE VIEW route_performance AS
SELECT * FROM route_performance_rt;
`;
  }
  return `
CREATE OR REPLACE VIEW route_performance AS
SELECT *, 'published' AS source
FROM route_performance_published;
`;
}
```

If `UNION ALL BY NAME` is unavailable in DuckDB-WASM, switch to an explicit column list matching published schema plus `source`.

`formatPeriodLabel`: third arg default `false`. When true, append ` · some days estimated from live feed` after `· NZST`.

Manifest helpers: copy `fetchLateTripsManifest` as `fetchRtRoutePerformanceManifest`. Use `.ts` extensions on local imports so node:test can load them.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/splice.ts frontend/src/lib/splice.test.ts frontend/src/lib/types.ts frontend/src/lib/manifest.ts frontend/src/lib/format.ts
git commit -m "$(cat <<'EOF'
feat: add RT performance splice helpers

EOF
)"
```

---

### Task 4: DuckDB spliced view and session

**Files:**
- Modify: `frontend/src/lib/duckdb.ts`
- Modify: `frontend/src/lib/session.ts`
- Modify: `frontend/src/lib/performance.ts`
- Modify: `frontend/src/scripts/overview/overview-app.ts`
- Modify: `frontend/src/scripts/route/route-app.ts`
- Modify: `frontend/src/scripts/nav/route-picker.ts`

**Interfaces:**
- `RT_ROUTE_PERFORMANCE_VIEW = "route_performance_rt"`
- `PUBLISHED_ROUTE_PERFORMANCE_VIEW = "route_performance_published"`
- `ROUTE_PERFORMANCE_VIEW` stays `"route_performance"` (existing queries unchanged)
- `registerSplicedRoutePerformance(conn, publishedMonths, rtMonths): Promise<void>`
- `RoutePerformanceSession.primeRtManifest(manifest | null): void`
- `ensureRanges`: official months = `monthsIntersectingPeriod` only (no latest-month fallback). Register published if any. `COUNT(DISTINCT day)` in the window; if `shouldFetchRtMonths`, also register RT intersecting months (include `priorRange`). Then `conn.query(splicedRoutePerformanceSql(...))`.
- Both empty: throw `ArchiveError("archive-empty", "No route-performance parquet files intersect the selected period.")`.
- `ensureAllMonths` (route picker): all official months plus all RT months, then splice, so August-only routes appear in the catalog.
- `loadRoutePerformance` returns `estimated: boolean` from `SELECT COUNT(*) > 0 FROM route_performance WHERE source = 'gtfs_rt' AND day BETWEEN ...` (or prior range).

Do not call `registerParquetView` with an empty month list. Do not import `duckdb.ts` from tests.

- [ ] **Step 1: Implement register + session + prime calls**

Published files have no `source` column; the spliced SQL adds `'published' AS source`.

`countPublishedDays`:

```sql
SELECT COUNT(DISTINCT day) AS n
FROM route_performance_published
WHERE day >= DATE '${from}' AND day <= DATE '${to}';
```

If the published view was not created, treat count as 0.

In overview-app, route-app, and route-picker after fetching the official manifest:

```ts
const rtManifest = await fetchRtRoutePerformanceManifest();
session.primeManifest(manifest);
session.primeRtManifest(rtManifest);
```

- [ ] **Step 2: Run frontend tests and check**

Run: `cd frontend && npm test && npm run check`

Expected: 0 failures, 0 astro errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/duckdb.ts frontend/src/lib/session.ts frontend/src/lib/performance.ts frontend/src/scripts/overview/overview-app.ts frontend/src/scripts/route/route-app.ts frontend/src/scripts/nav/route-picker.ts
git commit -m "$(cat <<'EOF'
feat: splice RT route-day parquet under official days

EOF
)"
```

---

### Task 5: Period meta, docs, local August derive

**Files:**
- Modify: `frontend/src/scripts/overview/overview-app.ts`
- Modify: `frontend/src/scripts/route/route-app.ts`
- Modify: `README.md`
- Modify: `docs/specs/2026-08-12-metlake-frontend-design.md`

**Interfaces:**
- After scorecard data loads, set `periodEls.rangeMeta.textContent = formatPeriodLabel(from, to, estimated)` using `loadRoutePerformance(...).estimated` (or a one-shot query). `bindPeriodControls` `applyUi` can keep the non-estimate label; the app overwrites after the query so the note matches the window actually loaded.

- [ ] **Step 1: Overview + route refresh set the estimate suffix**

Use the spec string `some days estimated from live feed`.

- [ ] **Step 2: README**

Under derive examples add:

```bash
MONTH=2026-08 ./scripts/derive-trip-performance.sh
MONTH=2026-08 ./scripts/derive-rt-route-performance.sh
```

Note that the UI unions these under official CSV days.

Add one line to the frontend design data table: overview/route scorecard may include RT-estimated days when the published CSV has no row.

- [ ] **Step 3: Derive August on the local archive**

```bash
export ARCHIVE_ROOT=./archive
MONTH=2026-08 ./scripts/derive-trip-performance.sh
MONTH=2026-08 ./scripts/derive-rt-route-performance.sh
duckdb -c "SELECT day, route, scheduled_trips, punctuality, source FROM read_parquet('archive/derived/rt-route-performance/2026-08.parquet') ORDER BY scheduled_trips DESC LIMIT 8;"
```

Expected: rows for `2026-08-12`, `source=gtfs_rt`, `scheduled_trips > 0`.

- [ ] **Step 4: Verify frontend**

Run: `cd frontend && npm test && npm run check`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/scripts/overview/overview-app.ts frontend/src/scripts/route/route-app.ts README.md docs/specs/2026-08-12-metlake-frontend-design.md
git commit -m "$(cat <<'EOF'
feat: label scorecard windows that include live-feed estimates

EOF
)"
```

Rebuild `:8080` if needed: `docker compose up -d --build frontend`. Hard-refresh overview with **This month** — tiles from 12 Aug RT, estimate note on the period. **All available** still shows official history plus 12 Aug. Delay-range still uses `late-trips`.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| Infer from GTFS+RT when CSV lacks the day | 1–4 |
| `trip-performance` then `rt-route-performance` | 1, 2 |
| Manifests | 1, 2 |
| Official parquet unchanged | 4 (union only) |
| Query splice, official wins | 3, 4 |
| Skip RT fetch when published covers every day | 3, 4 |
| Metric rules | 1, 2 |
| `source = gtfs_rt` | 2, 4 |
| Jobs after daily GTFS-RT | 2 crontab |
| UI same queries; empty only if both lack rows | 4 |
| Period meta estimate note | 5 |
| No overwrite / no patronage from RT | no task |
| `late-trips` unchanged | no rewrite |

## Implementer notes

- Fixture trip `t1` starts `08:00:00` (morning peak). Last-stop delay 180s is on time under [−60, 300]; smoke punctuality may be 1.0.
- Regenerating a month is overwrite + rewrite manifest.
- `monthsToRegister` latest-month fallback was for empty August official data; `ensureRanges` must not use it once RT can fill those days.
