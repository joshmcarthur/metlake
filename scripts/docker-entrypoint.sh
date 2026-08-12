#!/usr/bin/env bash
# Validate runtime env then exec supercronic.
set -euo pipefail

ARCHIVE_ROOT="${ARCHIVE_ROOT:-/archive}"
export ARCHIVE_ROOT
export METLAKE_ROOT="${METLAKE_ROOT:-/opt/metlake}"
export SQL_DIR="${SQL_DIR:-/opt/metlake/sql}"

if [[ ! -d "${ARCHIVE_ROOT}" ]]; then
  mkdir -p "${ARCHIVE_ROOT}" || true
fi

if [[ ! -w "${ARCHIVE_ROOT}" ]]; then
  echo "ARCHIVE_ROOT is not writable: ${ARCHIVE_ROOT}" >&2
  exit 1
fi

if [[ -z "${METLINK_API_KEY:-}" ]]; then
  echo "METLINK_API_KEY is required" >&2
  exit 1
fi

mkdir -p "${ARCHIVE_ROOT}/raw" "${ARCHIVE_ROOT}/curated" "${ARCHIVE_ROOT}/derived" "${ARCHIVE_ROOT}/metadata"

# tini is PID 1 (zombie reaping). supercronic must not also reap when not PID 1.
exec /usr/bin/tini -g -- supercronic -no-reap -passthrough-logs /opt/metlake/crontab
