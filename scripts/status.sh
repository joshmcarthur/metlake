#!/usr/bin/env bash
# Summarize recent archive contents.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_archive_root

echo "ARCHIVE_ROOT=${ARCHIVE_ROOT}"
echo

for layer in raw curated derived metadata; do
  path="${ARCHIVE_ROOT}/${layer}"
  if [[ -d "${path}" ]]; then
    count="$(find "${path}" -type f 2>/dev/null | wc -l | tr -d ' ')"
    echo "${layer}/: ${count} files"
  else
    echo "${layer}/: (missing)"
  fi
done

echo
echo "Recent files:"
find "${ARCHIVE_ROOT}" -type f -print 2>/dev/null \
  | head -n 40 \
  || true
