#!/usr/bin/env bash
# Project raw GTFS zip tables into curated/gtfs/YYYY-MM-DD/*.parquet
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb unzip
require_archive_root

DATE="${DATE:-$(utc_date)}"
year="${DATE%%-*}"
month="$(printf '%s' "${DATE}" | cut -d- -f2)"
day="$(printf '%s' "${DATE}" | cut -d- -f3)"

zip_path="${ARCHIVE_ROOT}/raw/gtfs/${year}/${month}/${day}/full.zip"
[[ -f "${zip_path}" ]] || die "missing GTFS zip: ${zip_path}"

out_dir="${ARCHIVE_ROOT}/curated/gtfs/${DATE}"
ensure_dir "${out_dir}"

work="$(mktemp -d "${TMPDIR:-/tmp}/metlake-gtfs.XXXXXX")"
cleanup() { rm -rf "${work}"; }
trap cleanup EXIT

log_info "unzipping ${zip_path}"
unzip -q -o "${zip_path}" -d "${work}"

tables=(
  agency
  calendar
  calendar_dates
  feed_info
  routes
  shapes
  stop_pattern_trips
  stop_patterns
  stop_times
  stops
  transfers
  trips
)

for table in "${tables[@]}"; do
  txt="${work}/${table}.txt"
  if [[ ! -f "${txt}" ]]; then
    log_warn "skipping missing table ${table}.txt"
    continue
  fi
  dest="${out_dir}/${table}.parquet"
  tmp="${dest}.tmp"
  rm -f "${tmp}"
  export GTFS_TXT_PATH="${txt}"
  export OUT_PARQUET_TMP="${tmp}"
  log_info "projecting ${table}"
  duckdb -c ".read ${SQL_DIR}/project_gtfs_table.sql"
  atomic_mv "${tmp}" "${dest}"
done

log_info "GTFS projection complete: ${out_dir}"
