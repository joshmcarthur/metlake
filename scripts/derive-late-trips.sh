#!/usr/bin/env bash
# Derive late-trip last-stop delays from curated trip updates + GTFS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

if [[ -z "${MONTH:-}" ]]; then
  DATE="${DATE:-$(default_previous_date)}"
  MONTH="${DATE:0:7}"
fi
export MONTH
resolve_tripupdates_inputs
if [[ -z "${trip_glob}" ]]; then
  log_warn "no tripupdates parquet for ${MONTH}"
  exit 0
fi

routes=""
stop_times=""
if [[ -n "${ROUTES_PARQUET:-}" ]]; then
  routes="${ROUTES_PARQUET}"
else
  while IFS= read -r candidate; do
    routes="${candidate}"
  done < <(find "${ARCHIVE_ROOT}/curated/gtfs" -type f -name routes.parquet 2>/dev/null | sort)
fi
[[ -n "${routes}" && -f "${routes}" ]] || die "missing curated GTFS routes.parquet (run project-gtfs.sh first)"

if [[ -n "${STOP_TIMES_PARQUET:-}" ]]; then
  stop_times="${STOP_TIMES_PARQUET}"
else
  stop_times="$(dirname "${routes}")/stop_times.parquet"
fi
[[ -f "${stop_times}" ]] || die "missing curated GTFS stop_times.parquet (run project-gtfs.sh first)"

dest_dir="${ARCHIVE_ROOT}/derived/late-trips"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export TRIPUPDATES_GLOB="${trip_glob}"
export ROUTES_PARQUET="${routes}"
export STOP_TIMES_PARQUET="${stop_times}"
export MIN_DELAY_SECONDS="${MIN_DELAY_SECONDS:-60}"
export OUT_PARQUET_TMP="${tmp}"
log_info "deriving late-trips for ${MONTH} using routes=${routes}"
duckdb -c ".read ${SQL_DIR}/derive_late_trips.sql"
atomic_mv "${tmp}" "${dest}"
log_info "wrote ${dest}"

manifest="${dest_dir}/_manifest.json"
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
