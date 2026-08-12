#!/usr/bin/env bash
# Capture GTFS-RT JSON feeds (tripupdates, vehiclepositions, servicealerts).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd curl
require_archive_root
require_env METLINK_API_KEY

feeds=(tripupdates vehiclepositions servicealerts)
captured_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ymd="$(utc_ymd)"
hhmm="$(utc_hhmm)"

first=1
for feed in "${feeds[@]}"; do
  if [[ "${first}" -eq 0 ]]; then
    rate_limit_sleep 200
  fi
  first=0

  url="${METLINK_BASE_URL}/gtfs-rt/${feed}"
  dest_dir="${ARCHIVE_ROOT}/raw/gtfs-rt/${feed}/${ymd}"
  dest="${dest_dir}/${hhmm}.json"
  ensure_dir "${dest_dir}"
  tmp="$(mktemp "${dest_dir}/.metlake.XXXXXX.tmp")"

  http_code="$(
    curl -sS -L \
      -H "x-api-key: ${METLINK_API_KEY}" \
      -H "Accept: application/json" \
      -o "${tmp}" \
      -w '%{http_code}' \
      "${url}" || true
  )"

  if [[ "${http_code}" != "200" ]]; then
    rm -f "${tmp}"
    die "GTFS-RT ${feed} failed HTTP ${http_code}"
  fi
  if [[ ! -s "${tmp}" ]]; then
    rm -f "${tmp}"
    die "GTFS-RT ${feed} empty response"
  fi
  # Require JSON object/array start
  first_char="$(head -c 1 "${tmp}")"
  if [[ "${first_char}" != "{" && "${first_char}" != "[" ]]; then
    rm -f "${tmp}"
    die "GTFS-RT ${feed} response is not JSON"
  fi

  sha="$(sha256_file "${tmp}")"
  size="$(wc -c <"${tmp}" | tr -d ' ')"
  atomic_mv "${tmp}" "${dest}"

  rel_path="raw/gtfs-rt/${feed}/${ymd}/${hhmm}.json"
  append_capture_record "gtfs-rt/${feed}" "${rel_path}" "${size}" "${sha}" "${captured_at}"
  log_info "captured ${rel_path} (${size} bytes)"
done
