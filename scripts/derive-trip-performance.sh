#!/usr/bin/env bash
# Derive trip-day census from curated trip updates + GTFS.
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
year="${MONTH%%-*}"
mon="$(printf '%s' "${MONTH}" | cut -d- -f2)"

daily_glob="${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates/daily/${year}/${mon}/*.parquet"
monthly_file="${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates/monthly/${year}/${mon}.parquet"
trip_glob=""
# shellcheck disable=SC2086
if compgen -G ${daily_glob} >/dev/null; then
  trip_glob="${daily_glob}"
elif [[ -f "${monthly_file}" ]]; then
  trip_glob="${monthly_file}"
else
  log_warn "no tripupdates parquet for ${MONTH}: ${daily_glob}"
  exit 0
fi

routes=""
stop_times=""
trips=""
calendar=""
if [[ -n "${ROUTES_PARQUET:-}" ]]; then
  routes="${ROUTES_PARQUET}"
else
  while IFS= read -r candidate; do
    routes="${candidate}"
  done < <(find "${ARCHIVE_ROOT}/curated/gtfs" -type f -name routes.parquet 2>/dev/null | sort)
fi
[[ -n "${routes}" && -f "${routes}" ]] || die "missing curated GTFS routes.parquet (run project-gtfs.sh first)"

gtfs_dir="$(dirname "${routes}")"

if [[ -n "${STOP_TIMES_PARQUET:-}" ]]; then
  stop_times="${STOP_TIMES_PARQUET}"
else
  stop_times="${gtfs_dir}/stop_times.parquet"
fi
[[ -f "${stop_times}" ]] || die "missing curated GTFS stop_times.parquet (run project-gtfs.sh first)"

if [[ -n "${TRIPS_PARQUET:-}" ]]; then
  trips="${TRIPS_PARQUET}"
else
  trips="${gtfs_dir}/trips.parquet"
fi
[[ -f "${trips}" ]] || die "missing curated GTFS trips.parquet (run project-gtfs.sh first)"

if [[ -n "${CALENDAR_PARQUET:-}" ]]; then
  calendar="${CALENDAR_PARQUET}"
else
  calendar="${gtfs_dir}/calendar.parquet"
fi
[[ -f "${calendar}" ]] || die "missing curated GTFS calendar.parquet (run project-gtfs.sh first)"

calendar_dates=""
calendar_dates_tmp=""
if [[ -n "${CALENDAR_DATES_PARQUET:-}" ]]; then
  calendar_dates="${CALENDAR_DATES_PARQUET}"
elif [[ -f "${gtfs_dir}/calendar_dates.parquet" ]]; then
  calendar_dates="${gtfs_dir}/calendar_dates.parquet"
else
  calendar_dates_tmp="$(mktemp "${TMPDIR:-/tmp}/metlake-calendar-dates.XXXXXX.parquet")"
  duckdb -c "COPY (SELECT CAST(NULL AS VARCHAR) AS service_id, CAST(NULL AS INTEGER) AS date, CAST(NULL AS INTEGER) AS exception_type WHERE FALSE) TO '${calendar_dates_tmp}' (FORMAT PARQUET);"
  calendar_dates="${calendar_dates_tmp}"
fi

dest_dir="${ARCHIVE_ROOT}/derived/trip-performance"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export MONTH
export TRIPUPDATES_GLOB="${trip_glob}"
export ROUTES_PARQUET="${routes}"
export TRIPS_PARQUET="${trips}"
export CALENDAR_PARQUET="${calendar}"
export CALENDAR_DATES_PARQUET="${calendar_dates}"
export STOP_TIMES_PARQUET="${stop_times}"
export OUT_PARQUET_TMP="${tmp}"
log_info "deriving trip-performance for ${MONTH} using routes=${routes}"
duckdb -c ".read ${SQL_DIR}/derive_trip_performance.sql"
atomic_mv "${tmp}" "${dest}"
log_info "wrote ${dest}"

[[ -n "${calendar_dates_tmp}" ]] && rm -f "${calendar_dates_tmp}"

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
