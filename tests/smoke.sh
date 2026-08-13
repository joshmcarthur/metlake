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

echo "== status =="
"${ROOT}/scripts/status.sh" >/dev/null

echo "smoke tests passed"
