# GTFS-RT route-performance fallback (2026-08-13)

Scorecard, calendar, cancellations, and route series today read only `derived/route-performance/` (Metlink’s published bus CSV). That dump currently ends **29 Mar 2026**. GTFS-RT in the archive starts **12 Aug 2026**. Infer the same route × day grain from GTFS + GTFS-RT for days the CSV does not cover.

## Principle

Prefer figures inferred from **raw/curated** GTFS and GTFS-RT over waiting for Metlink to republish the CSV. The CSV remains the source for days it contains. Do not mix the two methodologies in one parquet file.

## Layers

Leave existing curated trip-update parquet and `derived/route-performance/` (CSV join) unchanged.

| Derive | Grain | Input | Output |
| --- | --- | --- | --- |
| `derived/trip-performance/YYYY-MM.parquet` | trip × day | curated trip updates + GTFS trips/calendar/stop_times/routes | census of scheduled/observed/cancelled + a delay sample |
| `derived/rt-route-performance/YYYY-MM.parquet` | route × day | trip-performance | scorecard columns |

Each tree has `_manifest.json` (`months`, `updated_at`), same shape as route-performance.

`late-trips` stays a separate last-stop delay extract. Do not reuse it as the census (it drops on-time trips).

## Query splice

DuckDB-WASM loads official months that intersect the period, plus RT months that intersect days with no official row.

```text
official route-performance
UNION ALL
rt-route-performance WHERE day NOT IN (official days in the window)
```

Official wins on a given day. A mixed range (e.g. **All available**) shows CSV days and RT-gap days together. Skip fetching RT files when every day in the window already has CSV rows.

Do not scan raw GTFS-RT or trip-performance in the browser.

## RT metrics

Static GTFS is the scheduled denominator. Trip updates supply observed / cancelled / delay. Metlink JSON often sends a single next-stop `stop_time_update` object (handle object or array).

| Column | Rule |
| --- | --- |
| `scheduled_trips` | GTFS trips in service that day (calendar + calendar_dates) |
| `cancellations` | `schedule_relationship = CANCELED`, or scheduled and never seen in trip updates that day |
| `cancellations_rate` | cancelled / scheduled |
| `reliability` | 1 − cancellations_rate |
| `punctuality` | among observed, non-cancelled trips: on time if latest delay is in **[−60 s, +300 s]** |
| `peak_punctuality` | same window, trip start 07:00–09:00 or 16:00–18:00 NZ |
| `mean_departure_time_variance` | mean delay minutes among observed trips |

Patronage, seated/license capacity: CSV only (null on RT rows). Add `source = 'gtfs_rt'` on RT rows so the UI can tell.

These are **not** Metlink’s published definitions. Period meta notes when any day in the window is RT-estimated.

## Jobs

After daily GTFS-RT projection (and GTFS project when the snapshot is new):

1. `derive-trip-performance.sh` for that month  
2. `derive-rt-route-performance.sh` for that month  

Keep the existing CSV `derive-route-performance.sh` on its monthly cadence.

## UI

Same scorecard / series / calendar queries, against the spliced view. Empty only when **both** sources lack rows for the period. Delay-range chart still uses `late-trips`.

## Out of scope

- Rewriting official `route-performance` parquet
- Patronage from GTFS-RT
- Matching Metlink’s unpublished official punctuality contract
- Using RT to overwrite days the CSV already has
