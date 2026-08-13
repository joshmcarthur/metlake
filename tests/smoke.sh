#!/usr/bin/env bash
# Offline smoke tests using fixtures (no live API key required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="${HOME}/.duckdb/cli/latest:${PATH}:/usr/local/bin"
export METLAKE_ROOT="${ROOT}"
export SQL_DIR="${ROOT}/sql"

command -v duckdb >/dev/null 2>&1 || {
  echo "duckdb CLI required for smoke tests" >&2
  exit 1
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/metlake-smoke.XXXXXX")"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

export ARCHIVE_ROOT="${TMP}/archive"
mkdir -p "${ARCHIVE_ROOT}"
unset METLINK_API_KEY || true

echo "== check.sh (no API key) =="
"${ROOT}/scripts/check.sh"

echo "== stage fixture GTFS-RT =="
ymd=2026/08/01
hh=12
mkdir -p "${ARCHIVE_ROOT}/raw/gtfs-rt/tripupdates/${ymd}"
cp "${ROOT}/tests/fixtures/gtfs-rt/tripupdates.json" \
  "${ARCHIVE_ROOT}/raw/gtfs-rt/tripupdates/${ymd}/${hh}-00.json"
cp "${ROOT}/tests/fixtures/gtfs-rt/tripupdates-object-stu.json" \
  "${ARCHIVE_ROOT}/raw/gtfs-rt/tripupdates/${ymd}/${hh}-05.json"
HOUR=2026-08-01T12 FEED=tripupdates "${ROOT}/scripts/project-gtfs-rt-hour.sh"
test -f "${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates/hourly/2026/08/01/12.parquet"

DATE=2026-08-01 FEED=tripupdates "${ROOT}/scripts/project-gtfs-rt-day.sh"
test -f "${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates/daily/2026/08/01.parquet"

MONTH=2026-08 FEED=tripupdates "${ROOT}/scripts/project-gtfs-rt-month.sh"
test -f "${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates/monthly/2026/08.parquet"

echo "== stage fixture performance =="
mkdir -p "${ARCHIVE_ROOT}/raw/performance/2026/08"
cp "${ROOT}/tests/fixtures/performance/sample.csv" \
  "${ARCHIVE_ROOT}/raw/performance/2026/08/01.csv"
DATE=2026-08-01 "${ROOT}/scripts/project-performance-day.sh"
test -f "${ARCHIVE_ROOT}/curated/performance/daily/2026-08-01.parquet"

MONTH=2026-08 "${ROOT}/scripts/project-performance-month.sh"
test -f "${ARCHIVE_ROOT}/curated/performance/monthly/2026-08.parquet"

echo "== stage fixture GTFS =="
mkdir -p "${ARCHIVE_ROOT}/raw/gtfs/2026/08/01"
cp "${ROOT}/tests/fixtures/gtfs/full.zip" \
  "${ARCHIVE_ROOT}/raw/gtfs/2026/08/01/full.zip"
DATE=2026-08-01 "${ROOT}/scripts/project-gtfs.sh"
test -f "${ARCHIVE_ROOT}/curated/gtfs/2026-08-01/routes.parquet"

MONTH=2026-08 "${ROOT}/scripts/derive-route-performance.sh"
test -f "${ARCHIVE_ROOT}/derived/route-performance/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/route-performance/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/route-performance/_manifest.json"

rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/route-performance/2026-08.parquet');" | tail -n 1)"
test "${rows}" -ge 1

echo "== derive late trips =="
MONTH=2026-08 "${ROOT}/scripts/derive-late-trips.sh"
test -f "${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/late-trips/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/late-trips/_manifest.json"

late_rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet');" | tail -n 1)"
test "${late_rows}" -eq 2

late_delays="$(duckdb -csv -c "SELECT delay_seconds FROM read_parquet('${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet') ORDER BY delay_seconds;" | tail -n +2 | tr '\n' ' ')"
echo "${late_delays}" | grep -q '180'
echo "${late_delays}" | grep -q '240'

late_routes="$(duckdb -csv -c "SELECT DISTINCT route FROM read_parquet('${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet');" | tail -n +2)"
test "${late_routes}" = "1"

echo "== derive trip-performance =="
MONTH=2026-08 "${ROOT}/scripts/derive-trip-performance.sh"
test -f "${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/trip-performance/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/trip-performance/_manifest.json"
tp_rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet');" | tail -n 1)"
test "${tp_rows}" -ge 1
tp_t1="$(duckdb -csv -c "SELECT scheduled, observed FROM read_parquet('${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet') WHERE trip_id = 't1';" | tail -n 1)"
test "${tp_t1}" = "true,true"
# Latest STU delay wins on a tied feed_timestamp; later CANCELED with no STUs still counts.
tp_t1_census="$(duckdb -csv -c "SELECT cancelled, delay_seconds FROM read_parquet('${ARCHIVE_ROOT}/derived/trip-performance/2026-08.parquet') WHERE trip_id = 't1';" | tail -n 1)"
test "${tp_t1_census}" = "true,180"

echo "== derive rt-route-performance =="
MONTH=2026-08 "${ROOT}/scripts/derive-rt-route-performance.sh"
test -f "${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/rt-route-performance/_manifest.json"
rt_sched="$(duckdb -csv -c "SELECT SUM(scheduled_trips) FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet');" | tail -n 1)"
test "${rt_sched}" -ge 1
rt_source="$(duckdb -csv -c "SELECT DISTINCT source FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet');" | tail -n 1)"
test "${rt_source}" = "gtfs_rt"
rt_cancels="$(duckdb -csv -c "SELECT SUM(cancellations) FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet');" | tail -n 1)"
test "${rt_cancels}" -ge 1
rt_pat_cols="$(duckdb -csv -c "SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet')) WHERE lower(column_name) IN ('patronage', 'seated_capacity', 'license_capacity', 'licence_capacity');" | tail -n +2)"
if [[ -n "${rt_pat_cols}" ]]; then
  while IFS= read -r col; do
    [[ -z "${col}" ]] && continue
    nonzero="$(duckdb -csv -c "SELECT COUNT(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/rt-route-performance/2026-08.parquet') WHERE \"${col}\" IS NOT NULL;" | tail -n 1)"
    test "${nonzero}" -eq 0
  done <<<"${rt_pat_cols}"
fi

echo "== derive stop-delay =="
MONTH=2026-08 "${ROOT}/scripts/derive-stop-delay.sh"
test -f "${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/stop-delay/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/stop-delay/_manifest.json"
sd_rows="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet');" | tail -n 1)"
test "${sd_rows}" -ge 2
sd_t1="$(duckdb -csv -c "SELECT count(*) FROM read_parquet('${ARCHIVE_ROOT}/derived/stop-delay/2026-08.parquet') WHERE trip_id = 't1';" | tail -n 1)"
test "${sd_t1}" -eq 2

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

echo "== status =="
"${ROOT}/scripts/status.sh" >/dev/null

echo "smoke tests passed"
