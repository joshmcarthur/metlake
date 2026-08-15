# Historical map replay (2026-08-14)

A **sub-page** at `/replay/?from=&to=&t=` shows the network at an instant, with hybrid play/scrub. Not mixed into Overview or route charts. Route-scoped replay is a later `?route=` filter, not this slice.

This is the first UI that reads **curated GTFS-RT** in the browser. **Do not add a `derived/` tree.** Optimise **what we load and when**, not by pre-joining parquet in the appliance.

## Locked product choices

- Network-wide first; link from Overview (“Replay this period”) carrying `from`/`to`. Not a primary nav item.
- Hybrid **play/pause + scrubber**. URL `t` is always the playhead (throttled `history.replaceState` while playing).
- Dots coloured by **lateness** using existing tokens (`--live` / `--warn` / `--bad` / muted if unknown). Click → card: route, trip, delay, link to `/routes/{id}/`.
- Scrubber spans the **same period as Overview** (`from`/`to` NZ calendar dates). Data fetch is **not** the whole period.
- Between captures (~5 min), **slide along that trip’s GTFS shape**. Off-shape (detour/depot, >~150 m) → snap to GPS, do not lerp across water.

## Performance without a derive

Curated hourly vehicle parquet is already one row per entity (~30–110 KB, ~12 captures/hour). A UTC **day** file is ~1.7 MB / ~35k rows. Nested `entity` structs are the cost, not file size.

```text
playhead t
  → hourly parquet (UTC hour of t and t+1)
  → one DuckDB flatten into JS snapshots
  → Map keyed by capture time
  → rAF: lerp along shape (+ GTFS shapes for active trip_ids)
  → MapLibre GeoJSON overlay
basemap: /data/tiles/wellington-region.pmtiles
```

### Load rules

1. **Register only the UTC hour of `t` plus the next hour** of `vehiclepositions` and `tripupdates` (`/data/curated/gtfs-rt/{feed}/hourly/YYYY/MM/DD/HH.parquet`). DuckDB HTTP range-fetch via existing `registerFileURL`.
2. **Flatten once** with SQL (`entity.vehicle.position.*`, trip, vehicle id, `feed_timestamp`). Join delay from the same hour’s trip updates on `trip_id` (handle Metlink’s `stop_time_update` as object **or** list; use `arrival.delay` / `trip_update.delay`). Put results in a JS `Map<captureTs, Vehicle[]>` — **never query DuckDB on animation frames**.
3. **Prefetch** the following hour when playing within ~10 minutes of an hour boundary. Drop hours that fall outside a small LRU (keep ≤3 hours).
4. **Slider ticks** assume a 5-minute grid over `[from, to]` in Pacific/Auckland. Missing hour → empty frame / snap to nearest loaded capture. No appliance manifest required for v1 (construct URLs from `t`; 404 is a gap).
5. **Shapes:** from `curated/gtfs/{snapshot}/shapes.parquet` + `trips.parquet` + `routes.parquet`. Pick the latest GTFS snapshot on or before the playhead’s NZ date (HEAD walk back, cap ~14 days). Query **only `shape_id`s present in the loaded hour**. Project each ping onto the polyline **when the hour is loaded** (store `shape_dist`); per-frame work is lerp + point-on-line.
6. Period can be a week/month; **do not** register daily/monthly RT files for the whole window.

## Page and URL

New Astro page `frontend/src/pages/replay.astro` (Caddy catch-all already `try_files` real paths; no extra regexp).

| Param | Meaning |
| --- | --- |
| `from`, `to` | NZ `YYYY-MM-DD`, same semantics as Overview period |
| `t` | ISO-8601 instant with offset, e.g. `2026-08-12T20:15:00+12:00` |
| `route` | Reserved; ignored in v1 |

Defaults: `from`/`to` = Overview “this month”; `t` = start of `from` in NZ (or first capture once an hour loads). Overview link: `/replay/?from={}&to={}`.

Chrome: clock overlay, play/pause, 1× / 4× / 16× (1× = one capture per second ≈ 5 min archive / 1 s wall), date+time on the scrubber. Copying the URL shares the current instant.

Empty states: no hourly file, no PMTiles (vehicles on a navy field still OK), no GTFS shapes (GPS snap only).

## Map stack

- **maplibre-gl** + **pmtiles** protocol.
- Basemap: `$ARCHIVE_ROOT/tiles/wellington-region.pmtiles` → `/data/tiles/wellington-region.pmtiles` (Caddy `file_server` already supports Range). Operator-supplied Protomaps/OSM extract; document in README. Not produced by the capture appliance.
- Overlay: GeoJSON source of points; colour by delay bands **≤150 s** / **150–300 s** / **>300 s** (150 s matches recovery-vs-fade grace; 300 s matches the published 5 min punctuality window).
- Default view: Wellington bounds. No live GPS, no MissingLink sit-rep copy — this is historical.

## Modules

SQL strings + pure URL/time helpers tested with `node:test`; page script owns MapLibre.

| Module | Role |
| --- | --- |
| `frontend/src/lib/replay-url.ts` | parse/serialize `from`/`to`/`t` |
| `frontend/src/lib/replay-sql.ts` | flatten/join SQL for one hour |
| `frontend/src/lib/replay-motion.ts` | project onto shape, lerp, off-shape snap |
| `frontend/src/scripts/replay/replay-app.ts` | session, hour LRU, playhead, map |

## Appliance

**No new crontab job, no new parquet schema.** Optional later: a days/`_manifest.json` on the existing daily projector if URL probing gets noisy — not in v1.

Fixture GTFS zip has no `shapes.txt`; unit tests use synthetic polylines. Smoke can skip shape coverage.

## Out of scope (v1)

- `?route=` filter and `/routes/{id}/replay/`
- New `derived/vehicle-replay/` (or any flatten-at-rest)
- Scanning monthly RT parquet in the browser
- Interpolating off-shape in a straight line
- Live / current-time mode
- Generating PMTiles in Docker
- Primary-nav “Replay” item
- Commentary rail on the map
