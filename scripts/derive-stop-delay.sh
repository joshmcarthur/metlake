#!/usr/bin/env bash
# Derive trip × stop × day stop-delay census from curated trip updates + GTFS.
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
stops=""
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

if [[ -n "${STOPS_PARQUET:-}" ]]; then
  stops="${STOPS_PARQUET}"
else
  stops="${gtfs_dir}/stops.parquet"
fi
[[ -f "${stops}" ]] || die "missing curated GTFS stops.parquet (run project-gtfs.sh first)"

dest_dir="${ARCHIVE_ROOT}/derived/stop-delay"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

trips_for_sql="${trips}"
trips_norm=""
has_direction_id="$(duckdb -csv -noheader -c "
  SELECT count(*)
  FROM (DESCRIBE SELECT * FROM read_parquet('${trips}'))
  WHERE column_name = 'direction_id'
")"
if [[ "${has_direction_id}" != "1" ]]; then
  trips_norm="$(mktemp "${TMPDIR:-/tmp}/metlake-stop-delay-trips.XXXXXX.parquet")"
  duckdb -c "
    COPY (
      SELECT *, CAST(NULL AS INTEGER) AS direction_id
      FROM read_parquet('${trips}')
    ) TO '${trips_norm}' (FORMAT PARQUET);
  "
  trips_for_sql="${trips_norm}"
fi

export MONTH
export TRIPUPDATES_GLOB="${trip_glob}"
export ROUTES_PARQUET="${routes}"
export TRIPS_PARQUET="${trips_for_sql}"
export STOP_TIMES_PARQUET="${stop_times}"
export STOPS_PARQUET="${stops}"
export OUT_PARQUET_TMP="${tmp}"
log_info "deriving stop-delay for ${MONTH} using routes=${routes}"
duckdb -c ".read ${SQL_DIR}/derive_stop_delay.sql"
if [[ -n "${trips_norm:-}" ]]; then
  rm -f "${trips_norm}"
fi
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
