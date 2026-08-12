#!/usr/bin/env bash
# Validate metlake configuration and basic connectivity.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_cmd curl
require_archive_root

log_info "ARCHIVE_ROOT=${ARCHIVE_ROOT}"
log_info "METLAKE_ROOT=${METLAKE_ROOT}"

if [[ -z "${METLINK_API_KEY:-}" ]]; then
  log_warn "METLINK_API_KEY is unset (fetch scripts that need the API will fail)"
else
  log_info "METLINK_API_KEY is set"
  code="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -H "x-api-key: ${METLINK_API_KEY}" \
      -H "Accept: application/json" \
      "${METLINK_BASE_URL}/gtfs-rt/servicealerts" || true
  )"
  if [[ "${code}" == "200" ]]; then
    log_info "API connectivity check OK (servicealerts HTTP ${code})"
  else
    die "API connectivity check failed (servicealerts HTTP ${code})"
  fi
fi

for sub in raw curated derived metadata; do
  ensure_dir "${ARCHIVE_ROOT}/${sub}"
done

log_info "check passed"
