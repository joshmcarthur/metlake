#!/usr/bin/env bash
# Derive stop-anatomy aggregates (profile, injectors, hour heat) from stop-delay census.
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

stop_delay="${ARCHIVE_ROOT}/derived/stop-delay/${MONTH}.parquet"
if [[ ! -f "${stop_delay}" ]]; then
  log_warn "no stop-delay parquet for ${MONTH}: ${stop_delay}"
  exit 0
fi

write_manifest() {
  local dest_dir="$1"
  local manifest="${dest_dir}/_manifest.json"
  local updated_at months_json first parquet_path month
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
}

derive_tree() {
  local dest_name="$1"
  local sql_file="$2"
  local dest_dir="${ARCHIVE_ROOT}/derived/${dest_name}"
  local dest tmp
  ensure_dir "${dest_dir}"
  dest="${dest_dir}/${MONTH}.parquet"
  tmp="${dest}.tmp"
  rm -f "${tmp}"

  export STOP_DELAY_PARQUET="${stop_delay}"
  export OUT_PARQUET_TMP="${tmp}"
  log_info "deriving ${dest_name} for ${MONTH} using stop-delay=${stop_delay}"
  duckdb -c ".read ${SQL_DIR}/${sql_file}"
  atomic_mv "${tmp}" "${dest}"
  log_info "wrote ${dest}"
  write_manifest "${dest_dir}"
}

derive_tree stop-profile derive_stop_profile.sql
derive_tree delay-injectors derive_delay_injectors.sql
derive_tree hour-heat derive_hour_heat.sql
