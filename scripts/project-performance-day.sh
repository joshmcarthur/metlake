#!/usr/bin/env bash
# Project raw performance CSV day into curated/performance/daily/YYYY-MM-DD.parquet
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

src="${ARCHIVE_ROOT}/raw/performance/${year}/${month}/${day}.csv"
[[ -f "${src}" ]] || die "missing performance CSV: ${src}"

dest_dir="${ARCHIVE_ROOT}/curated/performance/daily"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${DATE}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export PERFORMANCE_CSV_PATH="${src}"
export OUT_PARQUET_TMP="${tmp}"
log_info "projecting performance day ${DATE}"
duckdb -c ".read ${SQL_DIR}/project_performance_day.sql"
atomic_mv "${tmp}" "${dest}"
log_info "wrote ${dest}"
