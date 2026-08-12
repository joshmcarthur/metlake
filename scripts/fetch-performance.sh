#!/usr/bin/env bash
# Snapshot Metlink bus performance daily CSV into raw/performance/YYYY/MM/DD.csv.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd curl
require_archive_root

FORCE="${FORCE:-0}"
captured_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ymd="$(utc_ymd)"
year="${ymd%%/*}"
rest="${ymd#*/}"
month="${rest%%/*}"
day="${rest#*/}"
dest="${ARCHIVE_ROOT}/raw/performance/${year}/${month}/${day}.csv"

if [[ -f "${dest}" && "${FORCE}" != "1" ]]; then
  log_info "performance snapshot already exists; skipping: ${dest}"
  exit 0
fi

resolve_performance_csv_url() {
  if [[ -n "${METLINK_PERFORMANCE_CSV_URL:-}" ]]; then
    printf '%s\n' "${METLINK_PERFORMANCE_CSV_URL}"
    return 0
  fi

  local page html url
  page="https://www.metlink.org.nz/about-us/performance-of-our-network"
  html="$(mktemp)"
  curl -sS -L -o "${html}" "${page}" || {
    rm -f "${html}"
    die "failed to download performance page ${page}"
  }

  # Prefer links whose text/href mention Daily + csv (case-insensitive).
  url="$(
    python3 - "${html}" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# Collect hrefs
hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
candidates = []
for h in hrefs:
    low = h.lower()
    if "csv" not in low:
        continue
    if "daily" in low or "performance" in low:
        candidates.append(h)
# Prefer daily explicitly
daily = [h for h in candidates if "daily" in h.lower()]
pick = daily[0] if daily else (candidates[0] if candidates else "")
if not pick:
    sys.exit(2)
if pick.startswith("//"):
    pick = "https:" + pick
elif pick.startswith("/"):
    pick = "https://www.metlink.org.nz" + pick
print(pick)
PY
  )" || {
    rm -f "${html}"
    die "could not discover performance daily CSV URL; set METLINK_PERFORMANCE_CSV_URL"
  }
  rm -f "${html}"
  printf '%s\n' "${url}"
}

url="$(resolve_performance_csv_url)"
log_info "performance CSV URL=${url}"

ensure_dir "$(dirname "${dest}")"
tmp="$(mktemp "$(dirname "${dest}")/.metlake.XXXXXX.tmp")"

http_code="$(
  curl -sS -L -o "${tmp}" -w '%{http_code}' "${url}" || true
)"
if [[ "${http_code}" != "200" ]]; then
  rm -f "${tmp}"
  die "performance CSV download failed HTTP ${http_code}"
fi
if [[ ! -s "${tmp}" ]]; then
  rm -f "${tmp}"
  die "performance CSV empty"
fi

sha="$(sha256_file "${tmp}")"
size="$(wc -c <"${tmp}" | tr -d ' ')"
atomic_mv "${tmp}" "${dest}"

rel_path="raw/performance/${year}/${month}/${day}.csv"
append_capture_record "performance" "${rel_path}" "${size}" "${sha}" "${captured_at}"
log_info "captured ${rel_path} (${size} bytes)"
