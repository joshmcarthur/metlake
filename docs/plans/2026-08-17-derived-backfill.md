# Local derived backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only operator script that re-runs existing monthly derive jobs across every month that already has that job’s curated (or upstream derived) inputs, filling gaps left while capture ran before those derives existed.

**Architecture:** A thin `scripts/backfill-derived.sh` orchestrator discovers months per job, skips existing outputs unless `FORCE=1` / `--force`, and invokes the current `derive-*.sh` scripts in dependency order. It does not fetch, project, or change SQL. Crontab stays single-month. The script refuses to run unless `METLAKE_ALLOW_BACKFILL=1`.

**Tech Stack:** bash, existing `lib/common.sh`, existing `derive-*.sh` + DuckDB CLI, `tests/smoke.sh`.

## Global Constraints

- Derived only: do not fetch, project, or touch `raw/` or `curated/`.
- Do not add `backfill-derived.sh` to `crontab`.
- Refuse to run unless `METLAKE_ALLOW_BACKFILL=1` (unset or any other value: log and exit `1` before touching the archive). `--force` without the guard still fails.
- `FORCE=1` and `--force` are equivalent. Default is skip when that job’s output parquet already exists.
- Stop-anatomy skip only when **all three** of stop-profile, delay-injectors, and hour-heat exist for the month.
- Per-job month discovery from that job’s own inputs (no `FROM`/`TO`, no job filter).
- Job order: route-performance, late-trips, trip-performance, rt-route-performance, stop-delay, stop-anatomy.
- A child non-zero exit stops the backfill (`set -e`). Child `exit 0` + warn is not a failure.
- No retry, no parallel month workers, no dry-run.
- Follow existing script pattern: `set -euo pipefail`, `lib/common.sh`, `chmod +x`.
- TDD: failing test before production code. Smoke via `./tests/smoke.sh`.
- Do not change derive SQL or the monthly crontab jobs.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/backfill-derived.sh` | Guard, month discovery, skip/force, invoke derive jobs |
| `tests/smoke.sh` | Guard, fill-gap, skip, crontab exclusion |
| `README.md` | Document the two invocations under manual scripts |
| `crontab` | Unchanged (asserted by smoke) |

---

### Task 1: Guard and crontab exclusion

**Files:**
- Create: `scripts/backfill-derived.sh`
- Modify: `tests/smoke.sh` (append after `status.sh`, before `smoke tests passed`)

**Interfaces:**
- Consumes: `METLAKE_ALLOW_BACKFILL`, `ARCHIVE_ROOT`, `lib/common.sh` (`die`, `log_info`, `require_archive_root`)
- Produces: `scripts/backfill-derived.sh` that exits `1` unless `METLAKE_ALLOW_BACKFILL=1`, then exits `0` without deriving (full loop is Task 2)

- [ ] **Step 1: Add failing smoke assertions**

In `tests/smoke.sh`, after `"${ROOT}/scripts/status.sh" >/dev/null` and before `echo "smoke tests passed"`, insert:

```bash
echo "== crontab excludes backfill =="
if grep -q 'backfill-derived.sh' "${ROOT}/crontab"; then
  echo "backfill-derived.sh must not be scheduled in crontab" >&2
  exit 1
fi

echo "== backfill guard =="
unset METLAKE_ALLOW_BACKFILL || true
before="$(find "${ARCHIVE_ROOT}/derived" -type f -name '*.parquet' | LC_ALL=C sort)"
set +e
"${ROOT}/scripts/backfill-derived.sh"
guard_status=$?
set -e
test "${guard_status}" -eq 1
after="$(find "${ARCHIVE_ROOT}/derived" -type f -name '*.parquet' | LC_ALL=C sort)"
test "${before}" = "${after}"
```

- [ ] **Step 2: Run smoke to verify it fails**

Run: `./tests/smoke.sh`

Expected: FAIL at `== backfill guard ==` with `backfill-derived.sh: No such file or directory` (or equivalent). Crontab assertion should pass (file is unchanged).

- [ ] **Step 3: Write the guard-only script**

Create `scripts/backfill-derived.sh`:

```bash
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
```

Then:

```bash
chmod +x scripts/backfill-derived.sh
```

- [ ] **Step 4: Run smoke to verify it passes**

Run: `./tests/smoke.sh`

Expected: `smoke tests passed`. Guard path exits `1` and parquet listing is unchanged. With the env still unset after the test, the stub never derives.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-derived.sh tests/smoke.sh
git commit -m "feat: guard local derived backfill behind METLAKE_ALLOW_BACKFILL"
```

---

### Task 2: Per-job discovery, skip/force, and invoke derives

**Files:**
- Modify: `scripts/backfill-derived.sh` (replace the post-guard body; keep the guard and `--force` parsing from Task 1)
- Modify: `tests/smoke.sh` (append fill-gap + skip after the guard block)
- Modify: `README.md` (manual scripts section)

**Interfaces:**
- Consumes: curated performance months; curated tripupdates daily/monthly months; `derived/trip-performance/*.parquet`; `derived/stop-delay/*.parquet`; existing `scripts/derive-*.sh`
- Produces: for each job, `MONTH=YYYY-MM` invocations in this order: `derive-route-performance.sh`, `derive-late-trips.sh`, `derive-trip-performance.sh`, `derive-rt-route-performance.sh`, `derive-stop-delay.sh`, `derive-stop-anatomy.sh`
- Skip dest: `derived/<tree>/<month>.parquet` except stop-anatomy, which skips only when all three of `stop-profile`, `delay-injectors`, `hour-heat` exist
- Env: `METLAKE_ALLOW_BACKFILL=1` required; `FORCE=1` or `--force` disables skip

- [ ] **Step 1: Add failing fill-gap and skip assertions**

In `tests/smoke.sh`, immediately after the guard block from Task 1 (still before `echo "smoke tests passed"`), add:

```bash
echo "== backfill fills a missing derived month =="
rm -f "${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet"
METLAKE_ALLOW_BACKFILL=1 "${ROOT}/scripts/backfill-derived.sh"
test -f "${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet"
test -f "${ARCHIVE_ROOT}/derived/late-trips/_manifest.json"
grep -q '"months":\["2026-08"\]' "${ARCHIVE_ROOT}/derived/late-trips/_manifest.json"

echo "== backfill skips existing months =="
METLAKE_ALLOW_BACKFILL=1 "${ROOT}/scripts/backfill-derived.sh"
test -f "${ARCHIVE_ROOT}/derived/late-trips/2026-08.parquet"
```

Do not pass `FORCE` in smoke.

- [ ] **Step 2: Run smoke to verify it fails**

Run: `./tests/smoke.sh`

Expected: FAIL at `== backfill fills a missing derived month ==` because `late-trips/2026-08.parquet` is missing after the stub exits without deriving.

- [ ] **Step 3: Implement month discovery and the job loop**

Replace `scripts/backfill-derived.sh` with this full file (guard and arg parsing unchanged):

```bash
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
```

Keep `chmod +x`. Use process substitution (`< <(...)`) so `backfill_one` / `backfill_anatomy` run in the current shell and a child non-zero exit aborts the script.

Month path shapes (must match existing projectors):

- performance daily: `curated/performance/daily/YYYY-MM-DD.parquet` → first 7 chars
- performance monthly: `curated/performance/monthly/YYYY-MM.parquet`
- tripupdates daily: `curated/gtfs-rt/tripupdates/daily/YYYY/MM/DD.parquet`
- tripupdates monthly: `curated/gtfs-rt/tripupdates/monthly/YYYY/MM.parquet`
- derived trees: `derived/<name>/YYYY-MM.parquet`

- [ ] **Step 4: Run smoke to verify it passes**

Run: `./tests/smoke.sh`

Expected: `smoke tests passed`. After `rm` of late-trips parquet, backfill recreates it and the manifest still lists `"2026-08"`. Second run exits 0 (skip). Other trees that already existed are skipped, not rewritten.

- [ ] **Step 5: Document invocations in the README**

In `README.md`, inside the `## Manual scripts (no Docker)` fenced block, after the `MONTH=… ./scripts/derive-stop-anatomy.sh` line and before `./scripts/status.sh`, add:

```bash
METLAKE_ALLOW_BACKFILL=1 ./scripts/backfill-derived.sh
METLAKE_ALLOW_BACKFILL=1 FORCE=1 ./scripts/backfill-derived.sh
```

`ARCHIVE_ROOT` is already exported at the top of that block.

- [ ] **Step 6: Run lint**

Run: `./tests/lint.sh`

Expected: `lint passed` (executable bit, shebang, shellcheck, shfmt). If shfmt diffs, run:

```bash
shfmt -w -i 2 -ci -bn scripts/backfill-derived.sh tests/smoke.sh
```

and re-run lint.

- [ ] **Step 7: Commit**

```bash
git add scripts/backfill-derived.sh tests/smoke.sh README.md
git commit -m "feat: backfill derived parquet across historical months"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Guard `METLAKE_ALLOW_BACKFILL=1`; `--force` without guard still fails | 1 (parse args then guard) |
| Not in crontab; lives in `scripts/` | 1 |
| Job order and child warn-exit 0 | 2 |
| Per-job month discovery table | 2 |
| Skip default; anatomy all-three; `FORCE=1` / `--force` | 2 |
| Non-zero child stops the run | 2 (`set -e` + process substitution) |
| Smoke: guard, fill-gap, skip, crontab | 1 + 2 |
| README invocations | 2 |
| Out of scope (schedule, re-project, ranges, dry-run, SQL/crontab changes) | no task |

**FORCE in smoke:** omitted on purpose (spec). `--force` parsing is still in the script so `FORCE=1` and `--force` stay equivalent.
