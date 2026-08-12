#!/usr/bin/env bash
# Project curated daily performance Parquet files into a monthly file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd duckdb
require_archive_root

MONTH="${MONTH:-$(default_previous_month)}"
year="${MONTH%%-*}"
mon="$(printf '%s' "${MONTH}" | cut -d- -f2)"

glob="${ARCHIVE_ROOT}/curated/performance/daily/${year}-${mon}-*.parquet"
# shellcheck disable=SC2086
compgen -G ${glob} >/dev/null || die "no daily performance parquet for ${MONTH}: ${glob}"

dest_dir="${ARCHIVE_ROOT}/curated/performance/monthly"
ensure_dir "${dest_dir}"
dest="${dest_dir}/${MONTH}.parquet"
tmp="${dest}.tmp"
rm -f "${tmp}"

export PERFORMANCE_DAY_GLOB="${glob}"
export OUT_PARQUET_TMP="${tmp}"
log_info "projecting performance month ${MONTH}"
duckdb -c ".read ${SQL_DIR}/project_performance_month.sql"
atomic_mv "${tmp}" "${dest}"
log_info "wrote ${dest}"
