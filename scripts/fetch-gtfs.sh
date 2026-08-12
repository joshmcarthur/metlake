#!/usr/bin/env bash
# Capture the canonical Metlink static GTFS zip into raw/gtfs/YYYY/MM/DD/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd curl
require_archive_root

FORCE="${FORCE:-0}"
captured_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ymd="$(utc_ymd)"
day_dir="${ARCHIVE_ROOT}/raw/gtfs/${ymd}"
dest="${day_dir}/full.zip"
meta_dest="${day_dir}/meta.json"

if [[ -f "${dest}" && "${FORCE}" != "1" ]]; then
  log_info "GTFS snapshot already exists; skipping: ${dest}"
  exit 0
fi

ensure_dir "${day_dir}"
tmp="$(mktemp "${day_dir}/.metlake.XXXXXX.tmp")"
headers_file="$(mktemp)"

cleanup() {
  rm -f "${tmp}" "${headers_file}"
}
trap cleanup EXIT

curl_args=(-sS -L -D "${headers_file}" -o "${tmp}")
if [[ -n "${METLINK_API_KEY:-}" ]]; then
  curl_args+=(-H "x-api-key: ${METLINK_API_KEY}")
fi

http_code="$(
  curl "${curl_args[@]}" -w '%{http_code}' "${METLINK_STATIC_GTFS_URL}" || true
)"

if [[ "${http_code}" != "200" ]]; then
  die "GTFS download failed HTTP ${http_code} from ${METLINK_STATIC_GTFS_URL}"
fi
if [[ ! -s "${tmp}" ]]; then
  die "GTFS download empty from ${METLINK_STATIC_GTFS_URL}"
fi

# Basic zip magic check
if ! head -c 2 "${tmp}" | grep -q 'PK'; then
  die "GTFS download does not look like a zip file"
fi

sha="$(sha256_file "${tmp}")"
size="$(wc -c <"${tmp}" | tr -d ' ')"
etag="$(awk 'BEGIN{IGNORECASE=1} /^etag:/ {sub(/\r$/,""); sub(/^[^:]*:[[:space:]]*/,""); print; exit}' "${headers_file}" || true)"

atomic_mv "${tmp}" "${dest}"
trap - EXIT
rm -f "${headers_file}"

rel_path="raw/gtfs/${ymd}/full.zip"
meta_tmp="$(mktemp "${day_dir}/.metlake.XXXXXX.tmp")"
printf '{\n  "captured_at": "%s",\n  "source": "gtfs",\n  "url": "%s",\n  "path": "%s",\n  "size": %s,\n  "sha256": "%s",\n  "etag": "%s"\n}\n' \
  "${captured_at}" \
  "${METLINK_STATIC_GTFS_URL}" \
  "${rel_path}" \
  "${size}" \
  "${sha}" \
  "${etag//\"/}" >"${meta_tmp}"
atomic_mv "${meta_tmp}" "${meta_dest}"

append_capture_record "gtfs" "${rel_path}" "${size}" "${sha}" "${captured_at}"
log_info "captured GTFS ${rel_path} (${size} bytes, sha256=${sha})"
