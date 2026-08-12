#!/usr/bin/env bash
# Project previous (or HOUR=) hour of raw GTFS-RT JSON into hourly Parquet per feed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

HOUR="${HOUR:-$(default_previous_hour)}"
# HOUR format: YYYY-MM-DDTHH
date_part="${HOUR%T*}"
hh="${HOUR#*T}"
year="${date_part%%-*}"
month="$(printf '%s' "${date_part}" | cut -d- -f2)"
day="$(printf '%s' "${date_part}" | cut -d- -f3)"

feeds=(tripupdates vehiclepositions servicealerts)
if [[ -n "${FEED:-}" ]]; then
  feeds=("${FEED}")
fi

for feed in "${feeds[@]}"; do
  raw_dir="${ARCHIVE_ROOT}/raw/gtfs-rt/${feed}/${year}/${month}/${day}"
  glob="${raw_dir}/${hh}-*.json"
  # shellcheck disable=SC2086
  if ! compgen -G ${glob} >/dev/null; then
    log_warn "no raw files for ${feed} hour ${HOUR}: ${glob}"
    continue
  fi

  dest_dir="${ARCHIVE_ROOT}/curated/gtfs-rt/${feed}/hourly/${year}/${month}/${day}"
  ensure_dir "${dest_dir}"
  dest="${dest_dir}/${hh}.parquet"
  tmp="${dest}.tmp"
  rm -f "${tmp}"

  export RAW_GLOB="${glob}"
  export OUT_PARQUET_TMP="${tmp}"
  export CAPTURE_HOUR="${HOUR}"
  export FEED_NAME="${feed}"
  log_info "projecting ${feed} hour ${HOUR}"
  duckdb -c ".read ${SQL_DIR}/project_gtfs_rt_hour.sql"
  atomic_mv "${tmp}" "${dest}"
  log_info "wrote ${dest}"
done
