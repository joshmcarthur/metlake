#!/usr/bin/env bash
# Re-derive monthly derived trees for every month that already has inputs.
# Local operator tool: not scheduled. Requires METLAKE_ALLOW_BACKFILL=1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

FORCE="${FORCE:-0}"
for arg in "$@"; do
  case "${arg}" in
    --force) FORCE=1 ;;
    *) die "unknown argument: ${arg}" ;;
  esac
done

if [[ "${METLAKE_ALLOW_BACKFILL:-}" != "1" ]]; then
  die "refusing to run: set METLAKE_ALLOW_BACKFILL=1"
fi

require_archive_root
log_info "derived backfill authorized under ${ARCHIVE_ROOT} (force=${FORCE})"

sorted_unique_months() {
  LC_ALL=C sort -u
}

list_performance_months() {
  local daily="${ARCHIVE_ROOT}/curated/performance/daily"
  local monthly="${ARCHIVE_ROOT}/curated/performance/monthly"
  local path base
  if [[ -d "${daily}" ]]; then
    while IFS= read -r path; do
      [[ -z "${path}" ]] && continue
      base="$(basename "${path}" .parquet)"
      printf '%s\n' "${base:0:7}"
    done < <(find "${daily}" -maxdepth 1 -type f -name '*.parquet')
  fi
  if [[ -d "${monthly}" ]]; then
    while IFS= read -r path; do
      [[ -z "${path}" ]] && continue
      basename "${path}" .parquet
    done < <(find "${monthly}" -maxdepth 1 -type f -name '*.parquet')
  fi
}

list_tripupdate_months() {
  local root="${ARCHIVE_ROOT}/curated/gtfs-rt/tripupdates"
  local path year mon
  if [[ -d "${root}/daily" ]]; then
    while IFS= read -r path; do
      [[ -z "${path}" ]] && continue
      mon="$(basename "$(dirname "${path}")")"
      year="$(basename "$(dirname "$(dirname "${path}")")")"
      printf '%s-%s\n' "${year}" "${mon}"
    done < <(find "${root}/daily" -type f -name '*.parquet')
  fi
  if [[ -d "${root}/monthly" ]]; then
    while IFS= read -r path; do
      [[ -z "${path}" ]] && continue
      mon="$(basename "${path}" .parquet)"
      year="$(basename "$(dirname "${path}")")"
      printf '%s-%s\n' "${year}" "${mon}"
    done < <(find "${root}/monthly" -type f -name '*.parquet')
  fi
}

list_derived_months() {
  local dest_dir="$1"
  local path
  [[ -d "${dest_dir}" ]] || return 0
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    basename "${path}" .parquet
  done < <(find "${dest_dir}" -maxdepth 1 -type f -name '*.parquet')
}

backfill_one() {
  local name="$1"
  local script="$2"
  local dest_dir="$3"
  local month dest
  while IFS= read -r month; do
    [[ -z "${month}" ]] && continue
    dest="${dest_dir}/${month}.parquet"
    if [[ "${FORCE}" != "1" && -f "${dest}" ]]; then
      log_info "skipping ${name} ${month}: already exists"
      continue
    fi
    log_info "backfilling ${name} ${month}"
    MONTH="${month}" "${SCRIPT_DIR}/${script}"
  done
}

backfill_anatomy() {
  local month
  while IFS= read -r month; do
    [[ -z "${month}" ]] && continue
    if [[ "${FORCE}" != "1" &&
      -f "${ARCHIVE_ROOT}/derived/stop-profile/${month}.parquet" &&
      -f "${ARCHIVE_ROOT}/derived/delay-injectors/${month}.parquet" &&
      -f "${ARCHIVE_ROOT}/derived/hour-heat/${month}.parquet" ]]; then
      log_info "skipping stop-anatomy ${month}: already exists"
      continue
    fi
    log_info "backfilling stop-anatomy ${month}"
    MONTH="${month}" "${SCRIPT_DIR}/derive-stop-anatomy.sh"
  done
}

backfill_one route-performance derive-route-performance.sh \
  "${ARCHIVE_ROOT}/derived/route-performance" \
  < <(list_performance_months | sorted_unique_months)

backfill_one late-trips derive-late-trips.sh \
  "${ARCHIVE_ROOT}/derived/late-trips" \
  < <(list_tripupdate_months | sorted_unique_months)

backfill_one trip-performance derive-trip-performance.sh \
  "${ARCHIVE_ROOT}/derived/trip-performance" \
  < <(list_tripupdate_months | sorted_unique_months)

backfill_one rt-route-performance derive-rt-route-performance.sh \
  "${ARCHIVE_ROOT}/derived/rt-route-performance" \
  < <(list_derived_months "${ARCHIVE_ROOT}/derived/trip-performance" | sorted_unique_months)

backfill_one stop-delay derive-stop-delay.sh \
  "${ARCHIVE_ROOT}/derived/stop-delay" \
  < <(list_tripupdate_months | sorted_unique_months)

backfill_anatomy \
  < <(list_derived_months "${ARCHIVE_ROOT}/derived/stop-delay" | sorted_unique_months)

log_info "derived backfill complete"
