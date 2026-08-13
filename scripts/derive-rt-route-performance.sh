#!/usr/bin/env bash
# Derive route-day RT performance from trip-performance census + GTFS routes.
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

trip_performance="${ARCHIVE_ROOT}/derived/trip-performance/${MONTH}.parquet"
if [[ ! -f "${trip_performance}" ]]; then
  log_warn "no trip-performance parquet for ${MONTH}: ${trip_performance}"
  exit 0
fi

routes=""
if [[ -n "${ROUTES_PARQUET:-}" ]]; then
  routes="${ROUTES_PARQUET}"
else
  while IFS= read -r candidate; do
    routes="${candidate}"
  done < <(find "${ARCHIVE_ROOT}/curated/gtfs" -type f -name routes.parquet 2>/dev/null | sort)
fi
[[ -n "${routes}" && -f "${routes}" ]] || die "missing curated GTFS routes.parquet (run project-gtfs.sh first)"

dest_dir="${ARCHIVE_ROOT}/derived/rt-route-performance"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export TRIP_PERFORMANCE_PARQUET="${trip_performance}"
export ROUTES_PARQUET="${routes}"
export OUT_PARQUET_TMP="${tmp}"
log_info "deriving rt-route-performance for ${MONTH} using routes=${routes}"
duckdb -c ".read ${SQL_DIR}/derive_rt_route_performance.sql"
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
