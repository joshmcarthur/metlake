# Stop-delay anatomy derives (2026-08-13)

Overview hour-heat and choke-point slots, and the route delay charts (stop profile, injectors, hour heat), are empty stubs. Curated trip updates plus static GTFS are enough to reconstruct a sampled stop-delay spine and aggregate it. Do not wait for Metlink to publish those tables.

## Principle

Reassemble stop delay from the capture stream. Metlink `stop_time_update` is usually a single next-stop object; over a trip that still yields several distinct stops. The spine is sampled (stops never named as “next” are missing). Do not scan raw GTFS-RT or the census in the browser.

`late-trips` stays the last-stop delay-range extract. This work does not rewrite it.

## Layers

| Derive | Grain | Input | Output |
| --- | --- | --- | --- |
| `derived/stop-delay/YYYY-MM.parquet` | trip × stop × day | curated trip updates + GTFS trips/stop_times/stops/routes | latest delay per observed stop |
| `derived/stop-profile/YYYY-MM.parquet` | route × direction × stop × day | stop-delay | mean/median absolute delay |
| `derived/delay-injectors/YYYY-MM.parquet` | route × direction × from_stop → to_stop × day | stop-delay | mean delay *added* on consecutive observed hops |
| `derived/hour-heat/YYYY-MM.parquet` | route × direction × day × start hour | stop-delay | median trip delay (last observed stop) |

Each tree has `_manifest.json` (`months`, `updated_at`), same shape as route-performance.

## Reconstruction (`stop-delay`)

Handle `stop_time_update` as object or array (same `with_stus` CASE as `sql/derive_late_trips.sql`).

- Drop trips with `schedule_relationship` `3` / `CANCELED` / `CANCELLED`.
- Drop null delays.
- One row per `(day, trip_id, stop_id)`: `arg_max(delay, (feed_timestamp, stu_idx))` using arrival delay, else departure delay.
- Join GTFS `trips` (`route_id`, `direction_id`), `stop_times` (`stop_sequence`, first-stop `start_time`), `stops` (`stop_name`), `routes` (`route` short name).

Columns: `day`, `trip_id`, `route`, `route_id`, `direction_id`, `stop_id`, `stop_sequence`, `stop_name`, `delay_seconds`, `start_time`.

## Aggregates

**Stop profile (absolute delay).** Per `(day, route, direction_id, stop_id)`: `n_trips`, `mean_delay_seconds`, `median_delay_seconds`, plus `stop_sequence` and `stop_name`. Chart in GTFS sequence; gaps allowed.

**Injectors (delay added).** For each trip, sort observed stops by `stop_sequence`. Consecutive pair: `delay_added = to.delay_seconds − from.delay_seconds` (positive = injected, negative = recovered). Per `(day, route, direction_id, from_stop_id, to_stop_id)`: `n_trips`, `mean_delay_added_seconds`, names and sequences for both ends.

**Hour heat.** Trip delay = delay at the highest `stop_sequence` observed that day. Bucket by GTFS `start_time` hour `0–23`. Per `(day, route, direction_id, hour)`: `n_trips`, `median_delay_seconds`. UI groups `day` into NZ weekday.

## Jobs

After `derive-rt-route-performance.sh`:

1. `derive-stop-delay.sh` for that month (warn + exit 0 if no trip updates)
2. `derive-stop-anatomy.sh` — writes the three thin trees (warn + exit 0 if census parquet is missing)

Crontab: `49 2` stop-delay, `51 2` anatomy. Follow existing script pattern (`set -euo pipefail`, `lib/common.sh`, DuckDB `.read`, atomic rename, `_manifest.json`). Regenerating a month overwrites parquet and rewrites manifests.

## UI

Fetch the three thin manifests (optional 404, like late-trips). Never fetch `stop-delay`. Register months that intersect the period. Empty a chart only when that table has no rows in the window.

| Surface | Query |
| --- | --- |
| Overview **When the network loads up** | `hour-heat`, all routes, median delay by weekday × hour |
| Overview **Shared choke points** | injectors: in the period, keep segments with **≥ 2 routes** and **≥ 5 trips**; rank by mean `delay_added` descending |
| Route stop profile | `stop-profile` for that route; direction chips filter `direction_id` |
| Route injector list | injectors for that route (no multi-route filter); direction chips |
| Route hour heat | `hour-heat` for that route; direction chips |

Direction chips re-render the three delay charts only. Period / compare refresh them with the scorecard. Period meta already notes live-feed estimates when RT scorecard days are in play; these tables are RT-only — no second disclaimer.

These figures are **not** Metlink published definitions.

## Tests

Smoke: fixture month produces `stop-delay` rows, injector rows with `from_stop_id` / `to_stop_id`, `hour` in `0–23`. Frontend: SQL-string helpers in a pure module so node:test never imports DuckDB-WASM. `astro check`.

## Out of scope

- Scanning `stop-delay` or raw GTFS-RT in the browser
- Rewriting `late-trips` or official `route-performance`
- Filling every scheduled stop (spine is sampled)
- Matching Metlink’s unpublished punctuality contract
- Vehicle-position geometry / shape matching
