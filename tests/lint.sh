#!/usr/bin/env bash
# Consistency checks for shell scripts and repo hygiene.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# shellcheck disable=SC2206
FILES=(lib/common.sh scripts/*.sh tests/smoke.sh tests/lint.sh)

fail=0

have() { command -v "$1" >/dev/null 2>&1; }

echo "== shellcheck =="
if have shellcheck; then
  if ! shellcheck -x -S warning "${FILES[@]}"; then
    fail=1
  fi
else
  echo "shellcheck not installed" >&2
  fail=1
fi

echo "== shfmt =="
if have shfmt; then
  if ! shfmt -d -i 2 -ci -bn "${FILES[@]}"; then
    echo "Run: shfmt -w -i 2 -ci -bn ${FILES[*]}" >&2
    fail=1
  fi
else
  echo "shfmt not installed" >&2
  fail=1
fi

echo "== shebang + executable bit =="
for f in "${FILES[@]}"; do
  [[ -f "${f}" ]] || continue
  first="$(head -n 1 "${f}")"
  if [[ "${first}" != '#!/usr/bin/env bash' ]]; then
    echo "unexpected shebang in ${f}: ${first}" >&2
    fail=1
  fi

  case "${f}" in
    lib/*)
      if [[ -x "${f}" ]]; then
        echo "library script should not be executable: ${f}" >&2
        fail=1
      fi
      ;;
    *)
      if [[ ! -x "${f}" ]]; then
        echo "not executable: ${f}" >&2
        fail=1
      fi
      ;;
  esac
done

echo "== no CRLF in shell files =="
for f in "${FILES[@]}"; do
  if grep -q $'\r' "${f}"; then
    echo "CRLF line endings in ${f}" >&2
    fail=1
  fi
done

echo "== tracked secrets hygiene =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo ".env is tracked by git" >&2
    fail=1
  fi
  # Fail if a tracked file contains an assigned non-empty Metlink-looking key.
  if git grep -nE 'METLINK_API_KEY=[A-Za-z0-9_-]{16,}' -- . ':(exclude).env.example' >/dev/null 2>&1; then
    echo "possible API key assignment in tracked files:" >&2
    git grep -nE 'METLINK_API_KEY=[A-Za-z0-9_-]{16,}' -- . ':(exclude).env.example' >&2 || true
    fail=1
  fi
fi

if [[ "${fail}" -ne 0 ]]; then
  echo "lint failed" >&2
  exit 1
fi

echo "lint passed"
