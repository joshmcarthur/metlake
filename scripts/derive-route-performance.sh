#!/usr/bin/env bash
# Derive route-performance Parquet from curated performance + GTFS routes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

MONTH="${MONTH:-$(default_previous_month)}"
year="${MONTH%%-*}"
mon="$(printf '%s' "${MONTH}" | cut -d- -f2)"

perf_glob="${ARCHIVE_ROOT}/curated/performance/daily/${year}-${mon}-*.parquet"
# Prefer monthly curated if present
if [[ -f "${ARCHIVE_ROOT}/curated/performance/monthly/${MONTH}.parquet" ]]; then
  perf_glob="${ARCHIVE_ROOT}/curated/performance/monthly/${MONTH}.parquet"
fi

# shellcheck disable=SC2086
compgen -G ${perf_glob} >/dev/null || die "missing performance parquet for ${MONTH}: ${perf_glob}"

# Use latest available GTFS routes snapshot on or before month end
routes=""
if [[ -n "${ROUTES_PARQUET:-}" ]]; then
  routes="${ROUTES_PARQUET}"
else
  # Prefer any curated gtfs/*/routes.parquet; pick lexicographically latest <= MONTH-31-ish
  while IFS= read -r candidate; do
    routes="${candidate}"
  done < <(find "${ARCHIVE_ROOT}/curated/gtfs" -type f -name routes.parquet 2>/dev/null | sort)
fi
[[ -n "${routes}" && -f "${routes}" ]] || die "missing curated GTFS routes.parquet (run project-gtfs.sh first)"

dest_dir="${ARCHIVE_ROOT}/derived/route-performance"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export PERFORMANCE_PARQUET_GLOB="${perf_glob}"
export ROUTES_PARQUET="${routes}"
export OUT_PARQUET_TMP="${tmp}"
log_info "deriving route-performance for ${MONTH} using routes=${routes}"
duckdb -c ".read ${SQL_DIR}/derive_route_performance.sql"
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
