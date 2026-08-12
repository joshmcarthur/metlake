#!/usr/bin/env bash
# Project daily GTFS-RT Parquet into a monthly Parquet per feed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

MONTH="${MONTH:-$(default_previous_month)}"
year="${MONTH%%-*}"
mon="$(printf '%s' "${MONTH}" | cut -d- -f2)"

feeds=(tripupdates vehiclepositions servicealerts)
if [[ -n "${FEED:-}" ]]; then
  feeds=("${FEED}")
fi

for feed in "${feeds[@]}"; do
  glob="${ARCHIVE_ROOT}/curated/gtfs-rt/${feed}/daily/${year}/${mon}/*.parquet"
  # shellcheck disable=SC2086
  if ! compgen -G ${glob} >/dev/null; then
    log_warn "no daily parquet for ${feed} month ${MONTH}: ${glob}"
    continue
  fi

  dest_dir="${ARCHIVE_ROOT}/curated/gtfs-rt/${feed}/monthly/${year}"
  ensure_dir "${dest_dir}"
  dest="${dest_dir}/${mon}.parquet"
  tmp="${dest}.tmp"
  rm -f "${tmp}"

  export DAILY_GLOB="${glob}"
  export OUT_PARQUET_TMP="${tmp}"
  log_info "projecting ${feed} month ${MONTH}"
  duckdb -c ".read ${SQL_DIR}/project_gtfs_rt_month.sql"
  atomic_mv "${tmp}" "${dest}"
  log_info "wrote ${dest}"
done
