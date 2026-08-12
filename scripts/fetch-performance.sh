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

  url="$(
    python3 - "${html}" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# Absolute asset URLs appear in page content (not always as href).
urls = re.findall(
    r'https://www\.metlink\.org\.nz/assets/[^"\'\s<>]+?\.csv',
    html,
    flags=re.I,
)
daily = [u for u in urls if "daily" in u.lower() and "bus-performance" in u.lower()]
pick = daily[0] if daily else ""
if not pick:
    # Fallback: any daily *.csv under Performance-Metrics
    daily2 = [u for u in urls if "daily" in u.lower()]
    pick = daily2[0] if daily2 else ""
if not pick:
    sys.exit(2)
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

# Reject HTML mistaken for CSV
if head -c 64 "${tmp}" | grep -qi '<!DOCTYPE\|<html'; then
  rm -f "${tmp}"
  die "performance download looks like HTML, not CSV (check METLINK_PERFORMANCE_CSV_URL)"
fi

sha="$(sha256_file "${tmp}")"
size="$(wc -c <"${tmp}" | tr -d ' ')"
atomic_mv "${tmp}" "${dest}"

rel_path="raw/performance/${year}/${month}/${day}.csv"
append_capture_record "performance" "${rel_path}" "${size}" "${sha}" "${captured_at}"
log_info "captured ${rel_path} (${size} bytes)"
