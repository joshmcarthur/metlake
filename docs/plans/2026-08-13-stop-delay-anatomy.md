# Stop-delay anatomy derives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct a sampled stop-delay spine from GTFS-RT trip updates, aggregate it into stop-profile / injector / hour-heat parquet, and wire the Overview and route delay-anatomy charts that are currently empty stubs.

**Architecture:** Appliance jobs write `derived/stop-delay/` then three thin trees from that census. The browser fetches only the thin manifests and parquet (never the census, never raw trip updates). `late-trips` is unchanged.

**Tech Stack:** bash, DuckDB CLI, DuckDB-WASM, TypeScript, Astro static, existing `tests/smoke.sh` + frontend `node:test`.

## Global Constraints

- Reassemble stop delay from the capture stream. Metlink `stop_time_update` is usually a single next-stop object; over a trip that still yields several distinct stops.
- The spine is sampled (stops never named as “next” are missing).
- Do not scan raw GTFS-RT or `derived/stop-delay/` in the browser.
- `late-trips` stays the last-stop delay-range extract. Do not rewrite it.
- Handle `stop_time_update` as object or array (same `with_stus` CASE as `sql/derive_late_trips.sql`).
- Drop null delays. CANCELED messages emit no stop rows; do not delete earlier observed stops for that `trip_id` (the smoke fixture cancels `t1` after two STUs — that hop must remain).
- Empty a chart only when that thin table has no rows in the window.
- Overview shared choke points: ≥ 2 routes and ≥ 5 trips in the period; rank by mean delay added descending.
- GTFS `direction_id` 1 = inbound, 0 = outbound.
- Follow existing script pattern: `set -euo pipefail`, `lib/common.sh`, DuckDB `.read` SQL, atomic rename, `_manifest.json`.
- TDD: failing test before production code. Smoke via `./tests/smoke.sh`. Frontend via `cd frontend && npm test`.
- Put SQL-string builders in `frontend/src/lib/anatomy-sql.ts` so node:test never imports DuckDB-WASM.

## File map

| File | Responsibility |
| --- | --- |
| `sql/derive_stop_delay.sql` | Trip × stop × day census |
| `sql/derive_stop_profile.sql` | Route × direction × stop × day means |
| `sql/derive_delay_injectors.sql` | Consecutive observed-stop hops |
| `sql/derive_hour_heat.sql` | Route × direction × day × start hour |
| `scripts/derive-stop-delay.sh` | Month job + manifest for stop-delay |
| `scripts/derive-stop-anatomy.sh` | Writes the three thin trees + manifests |
| `crontab` | `49 2` stop-delay, `51 2` anatomy |
| `tests/smoke.sh` | Assert census + anatomy from fixtures |
| `frontend/src/lib/types.ts` | Base path constants |
| `frontend/src/lib/manifest.ts` | Optional manifests + URL helpers |
| `frontend/src/lib/duckdb.ts` | Register the three thin views |
| `frontend/src/lib/anatomy.ts` | Load months + query helpers |
| `frontend/src/lib/anatomy-sql.ts` | SQL strings for node:test |
| `frontend/src/lib/anatomy-sql.test.ts` | Shared-choke and hour-heat SQL tests |
| `frontend/src/scripts/overview/charts/disabled.ts` | Delete or stop using stub |
| `frontend/src/scripts/overview/charts/hour-heat.ts` | Network weekday × hour table |
| `frontend/src/scripts/overview/charts/choke-points.ts` | Shared injector list |
| `frontend/src/scripts/overview/overview-app.ts` | Refresh delay charts with period |
| `frontend/src/scripts/route/charts/profile.ts` | Stop profile from data |
| `frontend/src/scripts/route/charts/injectors.ts` | Route injector list |
| `frontend/src/scripts/route/charts/heatmap.ts` | Route hour heat |
| `frontend/src/scripts/route/route-app.ts` | Pass conn/range/direction into delay charts |
| `README.md` | Derive commands |
| `docs/specs/2026-08-12-metlake-frontend-design.md` | Data table row |

---

### Task 1: Stop-delay census derive

**Files:**
- Create: `sql/derive_stop_delay.sql`
- Create: `scripts/derive-stop-delay.sh`
- Modify: `tests/smoke.sh`

**Interfaces:**
- Consumes: curated tripupdates daily/monthly parquet; `routes.parquet`, `trips.parquet`, `stop_times.parquet`, `stops.parquet`
- Produces: `derived/stop-delay/YYYY-MM.parquet` columns: `day`, `trip_id`, `route`, `route_id`, `direction_id`, `stop_id`, `stop_sequence`, `stop_name`, `delay_seconds`, `start_time`
- Env: `TRIPUPDATES_GLOB`, `ROUTES_PARQUET`, `TRIPS_PARQUET`, `STOP_TIMES_PARQUET`, `STOPS_PARQUET`, `MONTH` (`YYYY-MM`), `OUT_PARQUET_TMP`

- [ ] **Step 1: Add failing smoke assertions**

After the existing `derive rt-route-performance` block in `tests/smoke.sh`, add:

```bash
echo "== derive stop-delay =="
MONTH=2026-08 "${ROOT}/scripts/derive-stop-delay.sh"
test -f "${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/stop-delay/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/stop-delay/_manifest.json"
sd_rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet');" | tail -n 1)"
test "${sd_rows}" -ge 2
sd_t1="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet') WHERE trip_id = 't1';" | tail -n 1)"
test "${sd_t1}" -eq 2
```

- [ ] **Step 2: Run smoke; expect missing script**

Run: `./tests/smoke.sh`

Expected: FAIL at `derive-stop-delay.sh` (not found).

- [ ] **Step 3: Add `sql/derive_stop_delay.sql`**

Write this file. Filter output to `MONTH`. CANCELED messages contribute no stop rows (empty `stus`); do **not** delete other rows for that `trip_id`. Latest delay per `(day, trip_id, stop_id)` via `QUALIFY row_number()` ordered by `feed_timestamp DESC`, `stu_idx DESC`. `stop_sequence` prefers GTFS, else the STU value. `start_time` is the trip’s first GTFS departure.

```sql
-- Trip × stop × day sampled spine.
-- Env: TRIPUPDATES_GLOB, ROUTES_PARQUET, TRIPS_PARQUET, STOP_TIMES_PARQUET,
-- STOPS_PARQUET, MONTH (YYYY-MM), OUT_PARQUET_TMP
COPY (
  WITH
  month_start AS (
    SELECT CAST(getenv('MONTH') || '-01' AS DATE) AS start
  ),
  month_end AS (
    SELECT (start + INTERVAL 1 MONTH) AS stop FROM month_start
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
  rt_stops AS (
    SELECT
      CAST(left(capture_hour, 10) AS DATE) AS day,
      feed_timestamp,
      json_extract_string(ent, '$.trip_update.trip.trip_id') AS trip_id,
      json_extract_string(ent, '$.trip_update.trip.route_id') AS rt_route_id,
      json_extract_string(stu, '$.stop_id') AS stop_id,
      TRY_CAST(json_extract_string(stu, '$.stop_sequence') AS INTEGER) AS rt_stop_sequence,
      COALESCE(
        TRY_CAST(json_extract_string(stu, '$.arrival.delay') AS INTEGER),
        TRY_CAST(json_extract_string(stu, '$.departure.delay') AS INTEGER)
      ) AS delay_seconds,
      stu_idx
    FROM with_stus,
    UNNEST(stus) WITH ORDINALITY AS u(stu, stu_idx)
    WHERE len(stus) > 0
  ),
  latest_stop AS (
    SELECT
      day,
      trip_id,
      rt_route_id,
      stop_id,
      rt_stop_sequence,
      delay_seconds
    FROM rt_stops
    WHERE trip_id IS NOT NULL
      AND stop_id IS NOT NULL
      AND delay_seconds IS NOT NULL
      AND day >= (SELECT start FROM month_start)
      AND day < (SELECT stop FROM month_end)
    QUALIFY row_number() OVER (
      PARTITION BY day, trip_id, stop_id
      ORDER BY feed_timestamp DESC NULLS LAST, stu_idx DESC
    ) = 1
  ),
  first_dep AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      TRY_CAST(departure_time AS TIME) AS start_time
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
    QUALIFY CAST(stop_sequence AS INTEGER)
      = MIN(CAST(stop_sequence AS INTEGER)) OVER (PARTITION BY trip_id)
  ),
  gtfs_seq AS (
    SELECT
      CAST(trip_id AS VARCHAR) AS trip_id,
      CAST(stop_id AS VARCHAR) AS stop_id,
      CAST(stop_sequence AS INTEGER) AS stop_sequence
    FROM read_parquet(getenv('STOP_TIMES_PARQUET'))
  )
  SELECT
    ls.day,
    ls.trip_id,
    COALESCE(CAST(rt.route_short_name AS VARCHAR), ls.rt_route_id) AS route,
    COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id) AS route_id,
    CAST(tr.direction_id AS INTEGER) AS direction_id,
    ls.stop_id,
    COALESCE(gs.stop_sequence, ls.rt_stop_sequence) AS stop_sequence,
    CAST(st.stop_name AS VARCHAR) AS stop_name,
    ls.delay_seconds,
    fd.start_time
  FROM latest_stop AS ls
  LEFT JOIN read_parquet(getenv('TRIPS_PARQUET')) AS tr
    ON CAST(tr.trip_id AS VARCHAR) = ls.trip_id
  LEFT JOIN gtfs_seq AS gs
    ON gs.trip_id = ls.trip_id AND gs.stop_id = ls.stop_id
  LEFT JOIN first_dep AS fd
    ON fd.trip_id = ls.trip_id
  LEFT JOIN read_parquet(getenv('STOPS_PARQUET')) AS st
    ON CAST(st.stop_id AS VARCHAR) = ls.stop_id
  LEFT JOIN read_parquet(getenv('ROUTES_PARQUET')) AS rt
    ON CAST(rt.route_id AS VARCHAR) = COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id)
    OR CAST(rt.route_short_name AS VARCHAR) = COALESCE(CAST(tr.route_id AS VARCHAR), ls.rt_route_id)
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
```

- [ ] **Step 4: Add `scripts/derive-stop-delay.sh`**

Copy `scripts/derive-late-trips.sh`. Changes:

- Dest `derived/stop-delay`
- Resolve `TRIPS_PARQUET` and `STOPS_PARQUET` beside `routes.parquet` (same directory as `STOP_TIMES_PARQUET`)
- `export MONTH`
- `duckdb -c ".read ${SQL_DIR}/derive_stop_delay.sql"`
- Same manifest rewrite
- No tripupdates for the month: `log_warn` and `exit 0`
- `chmod +x`

- [ ] **Step 5: Run smoke**

Run: `./tests/smoke.sh`

Expected: `smoke tests passed`. If `t1` has 0 stop-delay rows, you deleted earlier STUs because of the later CANCELED message — keep those rows.

- [ ] **Step 6: Commit**

```bash
git add sql/derive_stop_delay.sql scripts/derive-stop-delay.sh tests/smoke.sh
git commit -m "$(cat <<'EOF'
feat: derive sampled stop-delay spine from trip updates

EOF
)"
```

---

### Task 2: Anatomy aggregates + crontab

**Files:**
- Create: `sql/derive_stop_profile.sql`
- Create: `sql/derive_delay_injectors.sql`
- Create: `sql/derive_hour_heat.sql`
- Create: `scripts/derive-stop-anatomy.sh`
- Modify: `crontab`
- Modify: `tests/smoke.sh`

**Interfaces:**
- Consumes: `derived/stop-delay/${MONTH}.parquet`
- Produces:
  - `stop-profile`: `day`, `route`, `route_id`, `direction_id`, `stop_id`, `stop_sequence`, `stop_name`, `n_trips`, `mean_delay_seconds`, `median_delay_seconds`
  - `delay-injectors`: `day`, `route`, `route_id`, `direction_id`, `from_stop_id`, `to_stop_id`, `from_stop_name`, `to_stop_name`, `from_sequence`, `to_sequence`, `n_trips`, `mean_delay_added_seconds`
  - `hour-heat`: `day`, `route`, `route_id`, `direction_id`, `hour`, `n_trips`, `median_delay_seconds`
- Env: `STOP_DELAY_PARQUET`, `OUT_PARQUET_TMP` (re-exported per tree)

- [ ] **Step 1: Add failing smoke assertions**

After stop-delay assertions:

```bash
echo "== derive stop-anatomy =="
MONTH=2026-08 "${ROOT}/scripts/derive-stop-anatomy.sh"
test -f "${ARCHIVE_ROOT}/derived/stop-profile/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/delay-injectors/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/hour-heat/2026-08.parquet"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/delay-injectors/_manifest.json"
inj_n="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/delay-injectors/2026-08.parquet');" | tail -n 1)"
test "${inj_n}" -ge 1
inj_pair="$(duckdb -csv -c "SELECT from_stop_id || '>' || to_stop_id FROM read_parquet('${ARCHIVE_ROOT}/derived/delay-injectors/2026-08.parquet') WHERE from_stop_id = '10';" | tail -n 1)"
test "${inj_pair}" = "10>20"
hh_ok="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/hour-heat/2026-08.parquet') WHERE hour BETWEEN 0 AND 23;" | tail -n 1)"
test "${hh_ok}" -ge 1
```

- [ ] **Step 2: Run smoke; expect missing script**

Run: `./tests/smoke.sh`

Expected: FAIL at `derive-stop-anatomy.sh`.

- [ ] **Step 3: Add the three SQL files**

`sql/derive_stop_profile.sql`:

```sql
COPY (
  SELECT
    day,
    route,
    route_id,
    direction_id,
    stop_id,
    any_value(stop_sequence) AS stop_sequence,
    any_value(stop_name) AS stop_name,
    count(*)::INTEGER AS n_trips,
    AVG(delay_seconds) AS mean_delay_seconds,
    MEDIAN(delay_seconds) AS median_delay_seconds
  FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
  GROUP BY day, route, route_id, direction_id, stop_id
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
```

`sql/derive_delay_injectors.sql`:

```sql
COPY (
  WITH ordered AS (
    SELECT
      day,
      trip_id,
      route,
      route_id,
      direction_id,
      stop_id,
      stop_name,
      stop_sequence,
      delay_seconds,
      LEAD(stop_id) OVER w AS to_stop_id,
      LEAD(stop_name) OVER w AS to_stop_name,
      LEAD(stop_sequence) OVER w AS to_sequence,
      LEAD(delay_seconds) OVER w AS to_delay
    FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
    WINDOW w AS (
      PARTITION BY day, trip_id
      ORDER BY stop_sequence NULLS LAST
    )
  )
  SELECT
    day,
    route,
    route_id,
    direction_id,
    stop_id AS from_stop_id,
    to_stop_id,
    stop_name AS from_stop_name,
    to_stop_name,
    stop_sequence AS from_sequence,
    to_sequence,
    count(*)::INTEGER AS n_trips,
    AVG(to_delay - delay_seconds) AS mean_delay_added_seconds
  FROM ordered
  WHERE to_stop_id IS NOT NULL
  GROUP BY
    day, route, route_id, direction_id,
    from_stop_id, to_stop_id, from_stop_name, to_stop_name,
    from_sequence, to_sequence
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
```

`sql/derive_hour_heat.sql` — trip delay = delay at max `stop_sequence` on that trip-day; hour from GTFS `start_time`:

```sql
COPY (
  WITH trip_delay AS (
    SELECT
      day,
      trip_id,
      any_value(route) AS route,
      any_value(route_id) AS route_id,
      any_value(direction_id) AS direction_id,
      any_value(start_time) AS start_time,
      arg_max(delay_seconds, stop_sequence) AS delay_seconds
    FROM read_parquet(getenv('STOP_DELAY_PARQUET'))
    GROUP BY day, trip_id
  )
  SELECT
    day,
    route,
    route_id,
    direction_id,
    EXTRACT(hour FROM start_time)::INTEGER AS hour,
    count(*)::INTEGER AS n_trips,
    MEDIAN(delay_seconds) AS median_delay_seconds
  FROM trip_delay
  WHERE start_time IS NOT NULL
  GROUP BY day, route, route_id, direction_id, hour
)
TO (getenv('OUT_PARQUET_TMP'))
(FORMAT PARQUET, COMPRESSION ZSTD);
```

- [ ] **Step 4: Add `scripts/derive-stop-anatomy.sh`**

Require `derived/stop-delay/${MONTH}.parquet`. If missing: `log_warn` and `exit 0`. Local function to write one tree (tmp, duckdb `.read`, atomic_mv, manifest). Invoke three times with `OUT_PARQUET_TMP` and the matching SQL file. Dest dirs: `stop-profile`, `delay-injectors`, `hour-heat`. `chmod +x`.

Manifest helper (use inside the script):

```bash
write_manifest() {
  local dest_dir="$1"
  local manifest="${dest_dir}/_manifest.json"
  local updated_at months_json first parquet_path month
  updated_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  months_json="["
  first=1
  while IFS= read -r parquet_path; do
    [[ -z "${parquet_path}" ]] && continue
    month="$(basename "${parquet_path}" .parquet)"
    if [[ "${first}" -eq 1 ]]; then
      months_json+="\"${month}\""
      first=0
    else
      months_json+=",\"${month}\""
    fi
  done < <(find "${dest_dir}" -maxdepth 1 -type f -name '*.parquet' | LC_ALL=C sort)
  months_json+="]"
  printf '{"months":%s,"updated_at":"%s"}\n' "${months_json}" "${updated_at}" \
    | atomic_write_stdin "${manifest}"
  log_info "wrote ${manifest}"
}
```

- [ ] **Step 5: Schedule**

In `crontab`, after `derive-rt-route-performance.sh` (`48 2`), add:

```
49 2 * * * /opt/metlake/scripts/derive-stop-delay.sh
51 2 * * * /opt/metlake/scripts/derive-stop-anatomy.sh
```

Keep `project-performance-day.sh` at `50 2`.

- [ ] **Step 6: Run smoke and lint**

Run: `./tests/smoke.sh && ./tests/lint.sh`

Expected: both pass. Fixture `t1` stops `10` then `20` should yield injector `10>20`.

- [ ] **Step 7: Commit**

```bash
git add sql/derive_stop_profile.sql sql/derive_delay_injectors.sql sql/derive_hour_heat.sql scripts/derive-stop-anatomy.sh crontab tests/smoke.sh
git commit -m "$(cat <<'EOF'
feat: aggregate stop-delay into profile, injectors, and hour heat

EOF
)"
```

---

### Task 3: Browser load helpers (pure TypeScript)

**Files:**
- Create: `frontend/src/lib/anatomy-sql.ts`
- Create: `frontend/src/lib/anatomy-sql.test.ts`
- Create: `frontend/src/lib/anatomy.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/manifest.ts`
- Modify: `frontend/src/lib/duckdb.ts`

**Interfaces:**
- `STOP_PROFILE_BASE = "/data/derived/stop-profile"`
- `DELAY_INJECTORS_BASE = "/data/derived/delay-injectors"`
- `HOUR_HEAT_BASE = "/data/derived/hour-heat"`
- Views: `stop_profile`, `delay_injectors`, `hour_heat`
- `fetchStopProfileManifest` / `fetchDelayInjectorsManifest` / `fetchHourHeatManifest` — optional 404
- URL helpers: `stopProfileParquetHttpUrlForMonth` etc., virtual names `stop_profile_${month}.parquet`, `delay_injectors_${month}.parquet`, `hour_heat_${month}.parquet`
- `sharedChokePointsSql(from, to): string` — ≥2 routes, ≥5 trips, rank mean delay added
- `networkHourHeatSql(from, to): string`
- `routeStopProfileSql(route, from, to, directionId): string`
- `routeInjectorsSql(route, from, to, directionId): string`
- `routeHourHeatSql(route, from, to, directionId): string`
- `ensureAnatomyViews(conn, range): Promise<{ profile: boolean; injectors: boolean; hourHeat: boolean }>`
- Do not import `duckdb.ts` from tests. Use `.ts` extensions on local imports in test files.

- [ ] **Step 1: Write failing tests in `frontend/src/lib/anatomy-sql.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sharedChokePointsSql,
  networkHourHeatSql,
  routeStopProfileSql,
} from "./anatomy-sql.ts";

test("shared choke SQL requires two routes and five trips", () => {
  const sql = sharedChokePointsSql("2026-08-01", "2026-08-13");
  assert.match(sql, /COUNT\(DISTINCT route\) >= 2/);
  assert.match(sql, /SUM\(n_trips\) >= 5/);
  assert.match(sql, /mean_delay_added_seconds/);
  assert.match(sql, /delay_injectors/);
  assert.doesNotMatch(sql, /stop_delay/);
});

test("network hour heat groups weekday and hour", () => {
  const sql = networkHourHeatSql("2026-08-01", "2026-08-13");
  assert.match(sql, /hour_heat/);
  assert.match(sql, /isodow/);
  assert.match(sql, /MEDIAN/);
  assert.doesNotMatch(sql, /stop_delay/);
});

test("route profile filters direction_id", () => {
  const sql = routeStopProfileSql("1", "2026-08-01", "2026-08-13", 1);
  assert.match(sql, /direction_id = 1/);
  assert.match(sql, /stop_profile/);
});
```

- [ ] **Step 2: Run tests; expect FAIL**

Run: `cd frontend && npm test -- src/lib/anatomy-sql.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement SQL builders, types, manifest URLs, duckdb registers, `anatomy.ts`**

`anatomy-sql.ts` (exact strings):

```ts
function rangeClause(from: string, to: string): string {
  return `day >= DATE '${from}' AND day <= DATE '${to}'`;
}

function safeRoute(route: string): string {
  return route.replace(/'/g, "''");
}

export function sharedChokePointsSql(from: string, to: string): string {
  return `
SELECT
  from_stop_id,
  to_stop_id,
  any_value(from_stop_name) AS from_stop_name,
  any_value(to_stop_name) AS to_stop_name,
  AVG(mean_delay_added_seconds) AS delay_added,
  SUM(n_trips) AS n_trips,
  COUNT(DISTINCT route) AS n_routes
FROM delay_injectors
WHERE ${rangeClause(from, to)}
GROUP BY from_stop_id, to_stop_id
HAVING COUNT(DISTINCT route) >= 2 AND SUM(n_trips) >= 5
ORDER BY delay_added DESC
LIMIT 8;
`;
}

export function networkHourHeatSql(from: string, to: string): string {
  return `
SELECT
  isodow(day)::INTEGER AS weekday,
  hour,
  MEDIAN(median_delay_seconds) AS delay_seconds
FROM hour_heat
WHERE ${rangeClause(from, to)}
GROUP BY weekday, hour
ORDER BY weekday, hour;
`;
}

export function routeStopProfileSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  stop_id,
  any_value(stop_name) AS stop_name,
  any_value(stop_sequence) AS stop_sequence,
  AVG(mean_delay_seconds) AS mean_delay_seconds,
  MEDIAN(median_delay_seconds) AS median_delay_seconds
FROM stop_profile
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY stop_id
ORDER BY stop_sequence NULLS LAST;
`;
}

export function routeInjectorsSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  from_stop_id,
  to_stop_id,
  any_value(from_stop_name) AS from_stop_name,
  any_value(to_stop_name) AS to_stop_name,
  AVG(mean_delay_added_seconds) AS delay_added,
  SUM(n_trips) AS n_trips
FROM delay_injectors
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY from_stop_id, to_stop_id
ORDER BY delay_added DESC
LIMIT 8;
`;
}

export function routeHourHeatSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  isodow(day)::INTEGER AS weekday,
  hour,
  MEDIAN(median_delay_seconds) AS delay_seconds
FROM hour_heat
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY weekday, hour
ORDER BY weekday, hour;
`;
}
```

Copy `fetchLateTripsManifest` three times (or one helper parameterized by URL/label). Register helpers in `duckdb.ts` mirroring `registerLateTripsMonths`. `ensureAnatomyViews` in `anatomy.ts`: fetch each manifest, `monthsIntersectingPeriod`, skip register when empty, return which views exist.

`directionId` helper in `anatomy.ts`:

```ts
export function directionIdFromChip(direction: "inbound" | "outbound"): number {
  return direction === "inbound" ? 1 : 0;
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/anatomy-sql.ts frontend/src/lib/anatomy-sql.test.ts frontend/src/lib/anatomy.ts frontend/src/lib/types.ts frontend/src/lib/manifest.ts frontend/src/lib/duckdb.ts
git commit -m "$(cat <<'EOF'
feat: add stop-anatomy parquet loaders and query SQL

EOF
)"
```

---

### Task 4: Overview hour heat and choke points

**Files:**
- Create: `frontend/src/scripts/overview/charts/hour-heat.ts`
- Create: `frontend/src/scripts/overview/charts/choke-points.ts`
- Modify: `frontend/src/scripts/overview/overview-app.ts`
- Modify: `frontend/src/scripts/overview/charts/disabled.ts` (stop calling it, or delete the function body usage)

**Interfaces:**
- `renderNetworkHourHeat(root, cells: { weekday: number; hour: number; delay_seconds: number | null }[]): void`
- `renderChokePoints(root, rows: { from_stop_name: string | null; to_stop_name: string | null; delay_added: number | null; n_routes: number; n_trips: number }[]): void`
- Weekday 1 = Monday … 7 = Sunday (`isodow`). Hours 0–23.
- Color: delay 0 → `#e8f2e3`, 240+ → `#c45c16` (same family as the punctuality calendar). Empty cell = muted.
- Missing view or zero rows: `<p class="rt-stub-note">No trip-update delay data for this period.</p>` — not the old “Needs RT derives” copy.

- [ ] **Step 1: Replace stub renderers and wire refresh**

Heatmap: `<table class="heatmap">` with row labels Mon–Sun and 24 hour columns. `title` on each `td` like `Mon 08:00 · 180s`.

Choke list: `<ol class="injector-list">` items `from → to` plus `+Ns · R routes · T trips`. Format seconds as integer. Negative delay added: show the minus, no plus.

In `refreshPeriod`, after scorecard queries (same `conn` / `state.range`):

```ts
const hourRoot = document.getElementById("net-hour-heat");
const chokeRoot = document.getElementById("net-corridors");
const flags = await ensureAnatomyViews(conn, state.range);
if (hourRoot) {
  if (!flags.hourHeat) {
    hourRoot.className = "heatmap chart-slot-disabled";
    hourRoot.innerHTML = `<p class="rt-stub-note">No trip-update delay data for this period.</p>`;
  } else {
    const table = await conn.query(networkHourHeatSql(state.range.from, state.range.to));
    renderNetworkHourHeat(hourRoot, table.toArray().map((row) => ({
      weekday: Number(row.weekday),
      hour: Number(row.hour),
      delay_seconds: row.delay_seconds == null ? null : Number(row.delay_seconds),
    })));
  }
}
if (chokeRoot) {
  if (!flags.injectors) {
    chokeRoot.className = "chart-slot-disabled";
    chokeRoot.innerHTML = `<p class="rt-stub-note">No trip-update delay data for this period.</p>`;
  } else {
    const table = await conn.query(sharedChokePointsSql(state.range.from, state.range.to));
    renderChokePoints(chokeRoot, table.toArray().map((row) => ({
      from_stop_name: row.from_stop_name == null ? null : String(row.from_stop_name),
      to_stop_name: row.to_stop_name == null ? null : String(row.to_stop_name),
      delay_added: row.delay_added == null ? null : Number(row.delay_added),
      n_routes: Number(row.n_routes),
      n_trips: Number(row.n_trips),
    })));
  }
}
```

Remove `renderDisabledRtCharts()` from `initOverviewApp`.

Place imports at the top. No inline imports.

- [ ] **Step 2: Run check**

Run: `cd frontend && npm test && npm run check`

Expected: 0 failures, 0 astro errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/scripts/overview/charts/hour-heat.ts frontend/src/scripts/overview/charts/choke-points.ts frontend/src/scripts/overview/overview-app.ts frontend/src/scripts/overview/charts/disabled.ts
git commit -m "$(cat <<'EOF'
feat: fill overview hour heat and shared choke points from RT anatomy

EOF
)"
```

---

### Task 5: Route delay charts, docs, local August derive

**Files:**
- Modify: `frontend/src/scripts/route/charts/profile.ts`
- Modify: `frontend/src/scripts/route/charts/injectors.ts`
- Modify: `frontend/src/scripts/route/charts/heatmap.ts`
- Modify: `frontend/src/scripts/route/charts/empty-state.ts` (new empty copy)
- Modify: `frontend/src/scripts/route/route-app.ts`
- Modify: `frontend/src/pages/routes/[route].astro` (profile subtitle: median delay, drop the uncomputed 25th–75th band claim)
- Modify: `README.md`
- Modify: `docs/specs/2026-08-12-metlake-frontend-design.md`

**Interfaces:**
- `renderDelayAnatomy(conn, range, route, direction)` uses `directionIdFromChip`
- Direction chips re-query the three delay charts only
- Period refresh calls the same function
- Recovery vs fade tiles stay as they are (out of scope)

- [ ] **Step 1: Wire route charts**

Reuse `renderNetworkHourHeat` from overview **or** duplicate a thin `renderHourHeatmap(root, cells)` in `route/charts/heatmap.ts` that builds the same table — prefer importing the overview renderer to avoid two color scales.

Stop profile: ordered list or simple SVG/div bars is YAGNI; a `<ol>` of `stop_name` + median seconds, in `stop_sequence` order, is enough. Gaps in sequence are allowed (no interpolated stops).

Injectors: same list markup as Overview choke points, without `n_routes`.

Empty copy: `No trip-update delay data for this period.`

- [ ] **Step 2: README + frontend design table**

Under derive examples add:

```bash
MONTH=2026-08 ./scripts/derive-stop-delay.sh
MONTH=2026-08 ./scripts/derive-stop-anatomy.sh
```

Replace the data-table row for hour heat / profile / injectors / corridors with: `derived/stop-profile`, `derived/delay-injectors`, `derived/hour-heat` (from `stop-delay` census). Note sampled spine.

- [ ] **Step 3: Derive August on the local archive**

```bash
export ARCHIVE_ROOT=./archive
MONTH=2026-08 ./scripts/derive-stop-delay.sh
MONTH=2026-08 ./scripts/derive-stop-anatomy.sh
duckdb -c "SELECT count(*) FROM read_parquet('archive/derived/stop-delay/2026-08.parquet');"
duckdb -c "SELECT from_stop_name, to_stop_name, mean_delay_added_seconds, n_trips FROM read_parquet('archive/derived/delay-injectors/2026-08.parquet') ORDER BY mean_delay_added_seconds DESC LIMIT 8;"
```

Expected: census count ≫ 1; injector rows with names and positive/negative added delay. Do not git-add archive parquet.

- [ ] **Step 4: Verify frontend**

Run: `cd frontend && npm test && npm run check`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/scripts/route/charts/profile.ts frontend/src/scripts/route/charts/injectors.ts frontend/src/scripts/route/charts/heatmap.ts frontend/src/scripts/route/charts/empty-state.ts frontend/src/scripts/route/route-app.ts frontend/src/pages/routes/[route].astro README.md docs/specs/2026-08-12-metlake-frontend-design.md
git commit -m "$(cat <<'EOF'
feat: wire route delay anatomy to stop-delay aggregates

EOF
)"
```

Rebuild `:8080` if needed: `docker compose up -d --build frontend`. Hard-refresh Overview **This month** — hour heat and choke list should populate from 12 Aug onward. Route page direction chips should filter the three charts. Delay-range still uses `late-trips`.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| `stop-delay` census | 1 |
| Object/array STU | 1 |
| CANCELED messages emit no new stops | 1 |
| Thin profile / injectors / hour-heat | 2 |
| Manifests + crontab 49/51 | 2 |
| Browser never fetches census | 3–5 |
| Shared choke ≥2 routes, ≥5 trips | 3, 4 |
| Overview hour heat + choke points | 4 |
| Route profile / injectors / hour heat + direction | 5 |
| `late-trips` unchanged | no rewrite |
| Smoke + node:test SQL helpers | 1–3 |

## Implementer notes

- Fixture `t1` has STUs at stops `10` (20s) and `20` (180s), then a CANCELED message. Keep both stop rows so injector `10>20` exists (`delay_added` 160).
- `arg_max(delay_seconds, stop_sequence)` in hour-heat is the last observed stop on the spine.
- Overview choke list will be empty on the smoke fixture (one route); that is correct. August archive has many routes.
- Recovery vs fade remains a static stub.
