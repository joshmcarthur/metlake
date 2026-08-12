#!/usr/bin/env bash
# Shared helpers for metlake scripts. Source from scripts; do not execute directly.

set -euo pipefail

METLAKE_ROOT="${METLAKE_ROOT:-}"
if [[ -z "${METLAKE_ROOT}" ]]; then
  _here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  METLAKE_ROOT="$(cd "${_here}/.." && pwd)"
fi
export METLAKE_ROOT

SQL_DIR="${SQL_DIR:-${METLAKE_ROOT}/sql}"
export SQL_DIR

METLINK_BASE_URL="${METLINK_BASE_URL:-https://api.opendata.metlink.org.nz/v1}"
METLINK_STATIC_GTFS_URL="${METLINK_STATIC_GTFS_URL:-https://static.opendata.metlink.org.nz/v1/gtfs/full.zip}"
export METLINK_BASE_URL METLINK_STATIC_GTFS_URL

log() {
  local level="$1"
  shift
  printf '%s [%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${level}" "$*" >&2
}

log_info() { log INFO "$*"; }
log_warn() { log WARN "$*"; }
log_error() { log ERROR "$*"; }

die() {
  log_error "$*"
  exit 1
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "${cmd}" >/dev/null 2>&1 || die "required command not found: ${cmd}"
  done
}

require_env() {
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      die "required environment variable not set: ${name}"
    fi
  done
}

require_archive_root() {
  require_env ARCHIVE_ROOT
  [[ -d "${ARCHIVE_ROOT}" ]] || mkdir -p "${ARCHIVE_ROOT}"
  [[ -w "${ARCHIVE_ROOT}" ]] || die "ARCHIVE_ROOT is not writable: ${ARCHIVE_ROOT}"
}

ensure_dir() {
  mkdir -p "$@"
}

# Atomic replace: move SRC onto DEST (same filesystem preferred).
atomic_mv() {
  local src="$1"
  local dest="$2"
  ensure_dir "$(dirname "${dest}")"
  mv -f "${src}" "${dest}"
}

# Write stdin to DEST via a sibling temp file, then rename.
atomic_write_stdin() {
  local dest="$1"
  local dir tmp
  dir="$(dirname "${dest}")"
  ensure_dir "${dir}"
  tmp="$(mktemp "${dir}/.metlake.XXXXXX.tmp")"
  cat >"${tmp}"
  atomic_mv "${tmp}" "${dest}"
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${path}" | awk '{print $1}'
  else
    die "neither sha256sum nor shasum found"
  fi
}

rate_limit_sleep() {
  # Stay well under ~10 req/s (burst 20).
  local ms="${1:-200}"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import time; time.sleep(${ms}/1000.0)"
  else
    # Fallback: sleep whole seconds when fractional sleep unavailable.
    sleep 1
  fi
}

utc_ymd() {
  date -u +'%Y/%m/%d'
}

utc_hhmm() {
  date -u +'%H-%M'
}

utc_date() {
  date -u +'%Y-%m-%d'
}

# Previous calendar hour in UTC as YYYY-MM-DDTHH
default_previous_hour() {
  if date -u -v-1H +'%Y-%m-%dT%H' >/dev/null 2>&1; then
    date -u -v-1H +'%Y-%m-%dT%H'
  else
    date -u -d '1 hour ago' +'%Y-%m-%dT%H'
  fi
}

default_previous_date() {
  if date -u -v-1d +'%Y-%m-%d' >/dev/null 2>&1; then
    date -u -v-1d +'%Y-%m-%d'
  else
    date -u -d 'yesterday' +'%Y-%m-%d'
  fi
}

default_previous_month() {
  if date -u -v-1m +'%Y-%m' >/dev/null 2>&1; then
    date -u -v-1m +'%Y-%m'
  else
    date -u -d '1 month ago' +'%Y-%m'
  fi
}

append_capture_record() {
  local source="$1"
  local rel_path="$2"
  local size="$3"
  local sha="$4"
  local captured_at="${5:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
  local meta_dir meta_file
  meta_dir="${ARCHIVE_ROOT}/metadata"
  ensure_dir "${meta_dir}"
  meta_file="${meta_dir}/captures.jsonl"
  printf '{"captured_at":"%s","source":"%s","path":"%s","size":%s,"sha256":"%s"}\n' \
    "${captured_at}" "${source}" "${rel_path}" "${size}" "${sha}" >>"${meta_file}"
}

# Download URL to DEST atomically. Optional: pass extra curl args after DEST.
# Sets global HTTP_CODE on success path for callers that care.
HTTP_CODE=""
fetch_to_file() {
  local url="$1"
  local dest="$2"
  shift 2
  local dir tmp code
  dir="$(dirname "${dest}")"
  ensure_dir "${dir}"
  tmp="$(mktemp "${dir}/.metlake.XXXXXX.tmp")"
  code="$(
    curl -sS -L \
      --fail-with-body \
      -o "${tmp}" \
      -w '%{http_code}' \
      "$@" \
      "${url}"
  )" || {
    rm -f "${tmp}"
    die "HTTP download failed for ${url} (curl exit $?)"
  }
  HTTP_CODE="${code}"
  if [[ "${code}" != "200" && "${code}" != "000" ]]; then
    # curl --fail may already have exited; keep a belt-and-suspenders check.
    :
  fi
  if [[ ! -s "${tmp}" ]]; then
    rm -f "${tmp}"
    die "empty response from ${url}"
  fi
  atomic_mv "${tmp}" "${dest}"
}

metlink_curl_headers() {
  local -a args=()
  if [[ -n "${METLINK_API_KEY:-}" ]]; then
    args+=(-H "x-api-key: ${METLINK_API_KEY}")
  fi
  args+=(-H "Accept: application/json")
  printf '%s\n' "${args[@]}"
}

run_duckdb_sql_file() {
  local sql_file="$1"
  require_cmd duckdb
  [[ -f "${sql_file}" ]] || die "SQL file not found: ${sql_file}"
  # Remaining env vars are available to the SQL via getenv if needed;
  # callers typically substitute with envsubst or duckdb -c SET.
  duckdb -c ".read ${sql_file}"
}
