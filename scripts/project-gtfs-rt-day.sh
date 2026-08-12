#!/usr/bin/env bash
# Project hourly GTFS-RT Parquet into a daily Parquet per feed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

DATE="${DATE:-$(default_previous_date)}"
year="${DATE%%-*}"
month="$(printf '%s' "${DATE}" | cut -d- -f2)"
day="$(printf '%s' "${DATE}" | cut -d- -f3)"

feeds=(tripupdates vehiclepositions servicealerts)
if [[ -n "${FEED:-}" ]]; then
  feeds=("${FEED}")
fi

for feed in "${feeds[@]}"; do
  glob="${ARCHIVE_ROOT}/curated/gtfs-rt/${feed}/hourly/${year}/${month}/${day}/*.parquet"
  # shellcheck disable=SC2086
  if ! compgen -G ${glob} >/dev/null; then
    log_warn "no hourly parquet for ${feed} date ${DATE}: ${glob}"
    continue
  fi

  dest_dir="${ARCHIVE_ROOT}/curated/gtfs-rt/${feed}/daily/${year}/${month}"
  ensure_dir "${dest_dir}"
  dest="${dest_dir}/${day}.parquet"
  tmp="${dest}.tmp"
  rm -f "${tmp}"

  export HOURLY_GLOB="${glob}"
  export OUT_PARQUET_TMP="${tmp}"
  log_info "projecting ${feed} day ${DATE}"
  duckdb -c ".read ${SQL_DIR}/project_gtfs_rt_day.sql"
  atomic_mv "${tmp}" "${dest}"
  log_info "wrote ${dest}"
done
