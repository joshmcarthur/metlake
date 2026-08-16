# Local derived backfill (2026-08-17)

Capture has been writing `raw/` and `curated/` on the crontab while later derive jobs only run for yesterday’s month. Historical months that already have curated parquet never get `late-trips`, trip-performance, stop-delay, anatomy, or the other trees unless someone passes `MONTH=` by hand.

A local operator script re-runs the existing monthly derive jobs across every month that already has that job’s inputs.

## Principle

Derived is regenerable. The backfill does not fetch, project, or touch `raw/` or `curated/`. Crontab stays single-month. The existing `derive-*.sh` scripts stay the source of truth; the backfill only decides which months to ask for.

## Guard

`scripts/backfill-derived.sh` refuses to run unless `METLAKE_ALLOW_BACKFILL=1`. Unset or any other value: log and exit `1` before touching the archive. `--force` without the guard still fails.

The script lives in `scripts/` (copied into the image like the others). It is **not** added to `crontab`. Operators run it on the host or via `docker exec` against the mounted archive.

## Invocation

```bash
METLAKE_ALLOW_BACKFILL=1 ARCHIVE_ROOT=./archive ./scripts/backfill-derived.sh
METLAKE_ALLOW_BACKFILL=1 FORCE=1 ARCHIVE_ROOT=./archive ./scripts/backfill-derived.sh
```

`FORCE=1` and `--force` are equivalent. `ARCHIVE_ROOT` is required, same as the other jobs.

## Job order

Jobs run one at a time, in dependency order, so downstream trees see parquet written earlier in the same run:

1. `derive-route-performance.sh` — curated performance
2. `derive-late-trips.sh` — curated trip updates
3. `derive-trip-performance.sh` — curated trip updates
4. `derive-rt-route-performance.sh` — `derived/trip-performance`
5. `derive-stop-delay.sh` — curated trip updates
6. `derive-stop-anatomy.sh` — `derived/stop-delay` (writes stop-profile, delay-injectors, hour-heat)

Each child still resolves GTFS `routes.parquet` itself and still warn-exits `0` when a given month’s input is missing.

## Month discovery

The orchestrator does not take a month list, range, or job filter. For each job it builds a sorted unique `YYYY-MM` set from that job’s inputs, then for each month either skips or runs `MONTH=… ./scripts/derive-….sh`.

| Job | Months come from |
| --- | --- |
| route-performance | `curated/performance/monthly/YYYY-MM.parquet` and `curated/performance/daily/YYYY-MM-DD.parquet` |
| late-trips, trip-performance, stop-delay | `curated/gtfs-rt/tripupdates/daily/YYYY/MM/*.parquet` and `…/monthly/YYYY/MM.parquet` |
| rt-route-performance | `derived/trip-performance/YYYY-MM.parquet` (including files this run just wrote) |
| stop-anatomy | `derived/stop-delay/YYYY-MM.parquet` (same) |

## Skip and force

Default: if that job’s output for the month already exists, log and continue (`skipping late-trips 2026-08: already exists`). For stop-anatomy, skip only when **all three** of stop-profile, delay-injectors, and hour-heat exist; a partial month is re-run.

`FORCE=1` / `--force`: never skip. The derive script overwrites via its usual temp file + atomic rename, then rewrites `_manifest.json`.

## Failure

A derive job that exits non-zero **stops the backfill**. Months already written stay; later jobs and later months in that job do not run. Child `exit 0` + warn is not a failure — the orchestrator continues.

No retry, no parallel month workers, no dry-run. Progress is child `log_info` / `log_warn` plus one orchestrator line per skip.

## Tests

`tests/smoke.sh` already derives one fixture month. After those assertions:

1. **Guard** — run `backfill-derived.sh` with the env unset; expect exit `1` and no extra parquet.
2. **Fill a gap** — delete one derived month file (e.g. `derived/late-trips/2026-08.parquet`), run with `METLAKE_ALLOW_BACKFILL=1`, assert the file and `_manifest.json` come back.
3. **Skip** — run it again with the flag; that month is left in place (no failure). No `FORCE` in smoke.
4. **Crontab** — `grep` that `crontab` does not mention `backfill-derived.sh`.

README’s manual-scripts section documents the two invocations above.

## Out of scope

- Scheduling the backfill
- Re-projecting curated or re-fetching raw
- `FROM` / `TO` ranges, job filters, dry-run, parallelism
- Changing derive SQL or monthly crontab jobs
