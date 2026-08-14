# Recovery vs fade from stop-delay (2026-08-14)

The route-page **Recovery vs fade** tiles are a static stub. Stop-delay anatomy left them out of scope and forbade fetching the census in the browser. The census is small enough (one day ≈ 331 KB; a full month on the order of ~10 MB) that the route page can aggregate it in DuckDB-WASM. Do not add another derived tree.

Amends [`2026-08-13-stop-delay-anatomy-design.md`](./2026-08-13-stop-delay-anatomy-design.md) (browser may fetch `stop-delay` on the route page only, single calendar month) and [`2026-08-13-route-page-design.md`](./2026-08-13-route-page-design.md) (direction chips also refresh these tiles).

## Principle

Infer trip recovery from the sampled `stop-delay` spine already in the archive. No new crontab job, parquet, or manifest. Overview stays on the thin hour-heat / injector files and never loads the census. Hive-partitioning or row-group pruning by route is out of scope — the current monthly file is one unsorted row group.

## Surface

`/routes/{id}/` only. Four tiles, same kickers as the stub:

| Tile | Meaning |
| --- | --- |
| Recovered | Of mid-route-late trips, share that finished ≤ 2.5 min late |
| Stayed late | Of that cohort, still > 2.5 min late at the end, delay did not grow |
| Got worse | Of that cohort, end delay > mid delay |
| RT coverage | Of observed trips in the slice, share with a mid and end sample (≥ 2 stops) |

Subtitle stays: trips that were **>2.5 min late mid-route**, then finished within grace. Grace **is** that 2.5 min bar (150 s), not the RT scorecard window of [−60, +300] s. Mixing the two would make Recovered and Stayed late overlap.

These figures are **not** Metlink published definitions.

## Classification

Per `(day, trip_id)` on `derived/stop-delay`, after filtering to the route (`route` or `route_id`), `direction_id`, and period days:

1. Drop rows with null `stop_sequence` or `delay_seconds`.
2. Need **≥ 2** observed stops. Otherwise the trip counts toward coverage denominator only.
3. **End delay** = `delay_seconds` at the highest `stop_sequence` (same last-observed rule as hour-heat).
4. **Mid delay** = `delay_seconds` at the observed stop whose sequence is closest to `(min_seq + max_seq) / 2`. Tie → lower `stop_sequence`.
5. **Cohort** = mid delay **> 150** s.

Exclusive outcomes among the cohort:

| Outcome | Rule |
| --- | --- |
| Recovered | `end_delay ≤ 150` |
| Stayed late | `end_delay > 150` and `end_delay ≤ mid_delay` |
| Got worse | `end_delay > mid_delay` |

Percents: each outcome / cohort size. If the cohort is empty, the three outcome tiles show "—"; coverage can still show.

**RT coverage** = classifiable trips (≥ 2 stops) / trips with any stop-delay row in the slice. That is sampled-spine quality, not “scheduled trips with updates”. Do not load `trip-performance` or GTFS calendar for a scheduled denominator.

## Period gate

Register **at most one** `stop-delay/YYYY-MM.parquet`. Show tiles only when `from` and `to` share the same `YYYY-MM` (this day / yesterday / this week inside one month / this month / custom inside one month).

Hide with a short note when the range spans two calendar months or is **All available** — even if the manifest currently lists a single month (otherwise August’s few RT days would be labelled as all history). Do not fetch a prior month for Compare; these tiles have no vs-prior delta.

Direction chips re-query the same month (filter `direction_id` only). Do not re-register the file.

## Empty states

| Condition | Copy |
| --- | --- |
| Range spans more than one calendar month | `Recovery vs fade is shown for ranges within a single calendar month.` |
| No manifest, no intersecting month, or query returns no observed trips | Same anatomy empty note: `No trip-update delay data for this period.` |

Do not fail the route page. Scorecard / series / the three delay charts are unchanged.

## Browser

Optional 404 on `derived/stop-delay/_manifest.json`, same as late-trips. `CREATE VIEW stop_delay AS SELECT * FROM read_parquet(...)`. SQL filters route **before** the per-trip windows. SQL-string helpers live in a pure module so `node:test` never imports DuckDB-WASM.

Commentary may attach `recovery` on the route brief when the cohort is non-empty. Overview commentary is unchanged.

## Out of scope

- New `derived/recovery/` (or any other) projection
- Hive / sort / row-group layout changes
- Fetching `stop-delay` on Overview
- `trip-performance` scheduled denominator
- Matching Metlink’s unpublished punctuality contract
- Filling unobserved stops on the sampled spine
