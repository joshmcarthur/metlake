# Recovery vs fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the route-page Recovery vs fade tiles from `derived/stop-delay` in DuckDB-WASM, with no new derive job.

**Architecture:** Optional stop-delay manifest + one monthly parquet, registered only when the selected range sits in a single calendar month. Pure SQL classifies each trip’s mid vs end delay; the route app writes four tiles and may attach `recovery` to the commentary brief. Overview never loads the census.

**Tech Stack:** TypeScript, DuckDB-WASM, Astro static, existing `frontend` `node:test`.

## Global Constraints

- No new crontab job, parquet tree, or appliance SQL.
- Route page only. Overview hour-heat / choke points stay on the thin anatomy files.
- Show tiles only when `range.from` and `range.to` share `YYYY-MM`.
- Do not fetch a prior month for Compare.
- Late threshold and grace are both **150 seconds**.
- Recovered / stayed late / got worse are exclusive. Coverage is classifiable (≥ 2 stops) / observed, not scheduled trips.
- Filter `route` / `direction_id` in SQL before window functions.
- SQL-string helpers in a pure module; `node:test` never imports DuckDB-WASM.
- Recovery tile values use `data-recovery`, never `data-metric` (`showRouteScorecardLoading` would clobber them).
- Copy: outcomes-first; these are not Metlink published definitions.
- Verify with `cd frontend && npm test && npm run check`.

## File map

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/recovery.ts` | Period gate, count → share math, types |
| `frontend/src/lib/recovery.test.ts` | Period gate + share tests |
| `frontend/src/lib/anatomy-sql.ts` | `routeRecoverySql` |
| `frontend/src/lib/anatomy-sql.test.ts` | SQL contract tests |
| `frontend/src/lib/types.ts` | `STOP_DELAY_BASE` |
| `frontend/src/lib/manifest.ts` | Stop-delay URLs + optional manifest fetch |
| `frontend/src/lib/duckdb.ts` | `STOP_DELAY_VIEW` + `registerStopDelayMonths` |
| `frontend/src/lib/anatomy.ts` | `ensureStopDelayView` |
| `frontend/src/data/placeholder.ts` | Optional `recovery` key on `Tile`; coverage delta copy |
| `frontend/src/components/SummaryTiles.astro` | `data-recovery` from tile key |
| `frontend/src/pages/routes/[route].astro` | `#recovery-root` wrapper |
| `frontend/src/scripts/route/charts/recovery.ts` | Paint tiles or empty note |
| `frontend/src/scripts/route/route-app.ts` | Load census, query, refresh with direction |
| `frontend/src/scripts/commentary/brief.ts` | Attach `recovery` when cohort is non-empty |
| `docs/specs/2026-08-13-stop-delay-anatomy-design.md` | Route-page census exception |
| `docs/specs/2026-08-13-route-page-design.md` | Direction chips include recovery |
| `docs/specs/2026-08-12-metlake-frontend-design.md` | Data table row |

---

### Task 1: Period gate, shares, and recovery SQL

**Files:**
- Create: `frontend/src/lib/recovery.ts`
- Create: `frontend/src/lib/recovery.test.ts`
- Modify: `frontend/src/lib/anatomy-sql.ts`
- Modify: `frontend/src/lib/anatomy-sql.test.ts`

**Interfaces:**
- Consumes: `DateRange` from `frontend/src/lib/types.ts`
- Produces:
  - `export const RECOVERY_LATE_SECONDS = 150`
  - `export interface RecoveryCounts { n_observed: number; n_classifiable: number; n_mid_late: number; n_recovered: number; n_stayed_late: number; n_got_worse: number }`
  - `export interface RecoveryShares { recovered: number | null; stayed_late: number | null; got_worse: number | null; coverage: number | null }` (`0–1` fractions)
  - `export function recoveryPeriodAllowed(range: DateRange): boolean`
  - `export function recoveryShares(counts: RecoveryCounts): RecoveryShares | null`
  - `export function routeRecoverySql(route: string, from: string, to: string, directionId: number): string`

- [ ] **Step 1: Write failing tests for the period gate and shares**

Create `frontend/src/lib/recovery.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { recoveryPeriodAllowed, recoveryShares } from "./recovery.ts";

test("allows ranges inside one calendar month", () => {
  assert.equal(
    recoveryPeriodAllowed({ from: "2026-08-01", to: "2026-08-14" }),
    true,
  );
  assert.equal(
    recoveryPeriodAllowed({ from: "2026-08-14", to: "2026-08-14" }),
    true,
  );
});

test("rejects ranges that span months or all-available windows", () => {
  assert.equal(
    recoveryPeriodAllowed({ from: "2026-07-20", to: "2026-08-20" }),
    false,
  );
  assert.equal(
    recoveryPeriodAllowed({ from: "2018-07-01", to: "2026-08-14" }),
    false,
  );
});

test("returns null when no observed trips", () => {
  assert.equal(
    recoveryShares({
      n_observed: 0,
      n_classifiable: 0,
      n_mid_late: 0,
      n_recovered: 0,
      n_stayed_late: 0,
      n_got_worse: 0,
    }),
    null,
  );
});

test("outcomes are null when the mid-late cohort is empty", () => {
  const shares = recoveryShares({
    n_observed: 10,
    n_classifiable: 8,
    n_mid_late: 0,
    n_recovered: 0,
    n_stayed_late: 0,
    n_got_worse: 0,
  });
  assert.deepEqual(shares, {
    recovered: null,
    stayed_late: null,
    got_worse: null,
    coverage: 0.8,
  });
});

test("partitions the mid-late cohort and coverage over observed trips", () => {
  const shares = recoveryShares({
    n_observed: 20,
    n_classifiable: 16,
    n_mid_late: 10,
    n_recovered: 4,
    n_stayed_late: 3,
    n_got_worse: 3,
  });
  assert.deepEqual(shares, {
    recovered: 0.4,
    stayed_late: 0.3,
    got_worse: 0.3,
    coverage: 0.8,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --experimental-strip-types --test src/lib/recovery.test.ts`

Expected: FAIL (`Cannot find module` / `recoveryPeriodAllowed` not exported).

- [ ] **Step 3: Implement `recovery.ts`**

```ts
import type { DateRange } from "./types";

export const RECOVERY_LATE_SECONDS = 150;

export interface RecoveryCounts {
  n_observed: number;
  n_classifiable: number;
  n_mid_late: number;
  n_recovered: number;
  n_stayed_late: number;
  n_got_worse: number;
}

export interface RecoveryShares {
  recovered: number | null;
  stayed_late: number | null;
  got_worse: number | null;
  coverage: number | null;
}

export function recoveryPeriodAllowed(range: DateRange): boolean {
  return range.from.slice(0, 7) === range.to.slice(0, 7);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function recoveryShares(counts: RecoveryCounts): RecoveryShares | null {
  if (counts.n_observed <= 0) return null;
  return {
    recovered: ratio(counts.n_recovered, counts.n_mid_late),
    stayed_late: ratio(counts.n_stayed_late, counts.n_mid_late),
    got_worse: ratio(counts.n_got_worse, counts.n_mid_late),
    coverage: ratio(counts.n_classifiable, counts.n_observed),
  };
}
```

- [ ] **Step 4: Add failing SQL contract tests**

Append to `frontend/src/lib/anatomy-sql.test.ts` (add `routeRecoverySql` to the existing import):

```ts
test("route recovery SQL classifies mid vs end on stop_delay", () => {
  const sql = routeRecoverySql("83", "2026-08-01", "2026-08-14", 1);
  assert.match(sql, /FROM stop_delay/);
  assert.match(sql, /direction_id = 1/);
  assert.match(sql, /150/);
  assert.match(sql, /mid_delay/);
  assert.match(sql, /end_delay/);
  assert.match(sql, /n_recovered/);
  assert.match(sql, /n_stayed_late/);
  assert.match(sql, /n_got_worse/);
  assert.match(sql, /n_classifiable/);
  assert.doesNotMatch(sql, /trip.performance/);
  assert.doesNotMatch(sql, /stop_profile/);
});
```

- [ ] **Step 5: Run SQL tests to verify they fail**

Run: `cd frontend && node --experimental-strip-types --test src/lib/anatomy-sql.test.ts`

Expected: FAIL (`routeRecoverySql is not a function` / not exported).

- [ ] **Step 6: Add `routeRecoverySql`**

At the top of `frontend/src/lib/anatomy-sql.ts` import `RECOVERY_LATE_SECONDS` from `./recovery`. Append:

```ts
export function routeRecoverySql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  const late = RECOVERY_LATE_SECONDS;
  return `
WITH spine AS (
  SELECT day, trip_id, stop_sequence, delay_seconds
  FROM stop_delay
  WHERE ${rangeClause(from, to)}
    AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
    AND direction_id = ${directionId}
    AND stop_sequence IS NOT NULL
    AND delay_seconds IS NOT NULL
),
bounds AS (
  SELECT
    day,
    trip_id,
    min(stop_sequence) AS min_seq,
    max(stop_sequence) AS max_seq,
    count(*)::INTEGER AS n_stops
  FROM spine
  GROUP BY day, trip_id
),
mid AS (
  SELECT s.day, s.trip_id, s.delay_seconds AS mid_delay
  FROM spine AS s
  JOIN bounds AS b ON s.day = b.day AND s.trip_id = b.trip_id
  WHERE b.n_stops >= 2
  QUALIFY row_number() OVER (
    PARTITION BY s.day, s.trip_id
    ORDER BY abs(s.stop_sequence - (b.min_seq + b.max_seq) / 2.0), s.stop_sequence
  ) = 1
),
fin AS (
  SELECT s.day, s.trip_id, s.delay_seconds AS end_delay
  FROM spine AS s
  JOIN bounds AS b ON s.day = b.day AND s.trip_id = b.trip_id
  WHERE b.n_stops >= 2
  QUALIFY row_number() OVER (
    PARTITION BY s.day, s.trip_id
    ORDER BY s.stop_sequence DESC
  ) = 1
),
classified AS (
  SELECT m.mid_delay, f.end_delay
  FROM mid AS m
  JOIN fin AS f ON m.day = f.day AND m.trip_id = f.trip_id
  WHERE m.mid_delay > ${late}
)
SELECT
  (SELECT count(*)::INTEGER FROM bounds) AS n_observed,
  (SELECT count(*)::INTEGER FROM bounds WHERE n_stops >= 2) AS n_classifiable,
  (SELECT count(*)::INTEGER FROM classified) AS n_mid_late,
  (SELECT count(*)::INTEGER FROM classified WHERE end_delay <= ${late}) AS n_recovered,
  (SELECT count(*)::INTEGER FROM classified
    WHERE end_delay > ${late} AND end_delay <= mid_delay) AS n_stayed_late,
  (SELECT count(*)::INTEGER FROM classified
    WHERE end_delay > mid_delay) AS n_got_worse;
`;
}
```

- [ ] **Step 7: Run tests and confirm they pass**

Run: `cd frontend && node --experimental-strip-types --test src/lib/recovery.test.ts src/lib/anatomy-sql.test.ts`

Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/recovery.ts frontend/src/lib/recovery.test.ts frontend/src/lib/anatomy-sql.ts frontend/src/lib/anatomy-sql.test.ts
git commit -m "$(cat <<'EOF'
feat: classify route recovery from stop-delay SQL

EOF
)"
```

---

### Task 2: Register stop-delay in DuckDB-WASM

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/manifest.ts`
- Modify: `frontend/src/lib/duckdb.ts`
- Modify: `frontend/src/lib/anatomy.ts`

**Interfaces:**
- Consumes: `recoveryPeriodAllowed` from `./recovery`
- Produces:
  - `STOP_DELAY_BASE = "/data/derived/stop-delay"`
  - `fetchStopDelayManifest(fetchFn?: typeof fetch): Promise<RoutePerformanceManifest | null>`
  - `stopDelayParquetHttpUrlForMonth` / `stopDelayVirtualNameForMonth` (`stop_delay_${month}.parquet`)
  - `export const STOP_DELAY_VIEW = "stop_delay"`
  - `registerStopDelayMonths(conn, months)`
  - `ensureStopDelayView(conn, range, fetchFn?): Promise<boolean>` — `false` when the period is not a single month, manifest is missing, or no intersecting month. Does not throw.

- [ ] **Step 1: Add the base path and manifest helpers**

In `frontend/src/lib/types.ts`, next to `HOUR_HEAT_BASE`:

```ts
export const STOP_DELAY_BASE = "/data/derived/stop-delay";
```

In `frontend/src/lib/manifest.ts`, import `STOP_DELAY_BASE`, add `const STOP_DELAY_MANIFEST_URL = \`${STOP_DELAY_BASE}/_manifest.json\`;`, copy the hour-heat URL helper trio (`stopDelayParquetUrlForMonth`, `stopDelayParquetHttpUrlForMonth`, `stopDelayVirtualNameForMonth` returning `stop_delay_${month}.parquet`), and:

```ts
/** Missing stop-delay census is optional — return null instead of failing the page. */
export async function fetchStopDelayManifest(
  fetchFn: typeof fetch = fetch,
): Promise<RoutePerformanceManifest | null> {
  return fetchOptionalMonthManifest(STOP_DELAY_MANIFEST_URL, "stop-delay", fetchFn);
}
```

- [ ] **Step 2: Register the view**

In `frontend/src/lib/duckdb.ts`, import the two stop-delay URL helpers, add `export const STOP_DELAY_VIEW = "stop_delay";`, and:

```ts
export async function registerStopDelayMonths(
  conn: DuckDbConnection,
  months: readonly string[],
): Promise<void> {
  await registerParquetView(
    conn,
    STOP_DELAY_VIEW,
    months,
    stopDelayVirtualNameForMonth,
    stopDelayParquetHttpUrlForMonth,
    "No stop-delay parquet files intersect the selected period.",
  );
}
```

- [ ] **Step 3: Gate `ensureStopDelayView`**

In `frontend/src/lib/anatomy.ts`, import `registerStopDelayMonths`, `fetchStopDelayManifest`, and `recoveryPeriodAllowed`. Do **not** call this from Overview.

```ts
export async function ensureStopDelayView(
  conn: DuckDbConnection,
  range: DateRange,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!recoveryPeriodAllowed(range)) return false;

  const manifest = await fetchStopDelayManifest(fetchFn);
  if (!manifest) return false;

  const months = monthsIntersectingPeriod(manifest.months, range.from, range.to);
  if (months.length !== 1) return false;

  await registerStopDelayMonths(conn, months);
  return true;
}
```

`months.length !== 1` covers a missing month (0) and a two-file custom range that somehow shared a calendar month (should not happen if `from`/`to` share `YYYY-MM`).

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm test && npm run check`

Expected: existing tests pass; `astro check` clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/manifest.ts frontend/src/lib/duckdb.ts frontend/src/lib/anatomy.ts
git commit -m "$(cat <<'EOF'
feat: load stop-delay census for single-month route queries

EOF
)"
```

---

### Task 3: Paint tiles and wire the route page

**Files:**
- Modify: `frontend/src/data/placeholder.ts`
- Modify: `frontend/src/components/SummaryTiles.astro`
- Modify: `frontend/src/pages/routes/[route].astro`
- Create: `frontend/src/scripts/route/charts/recovery.ts`
- Create: `frontend/src/scripts/route/charts/recovery.test.ts`
- Modify: `frontend/src/scripts/route/route-app.ts`
- Modify: `frontend/src/scripts/commentary/brief.ts`

**Interfaces:**
- Consumes: `ensureStopDelayView`, `routeRecoverySql`, `recoveryShares`, `RecoveryShares`, `directionIdFromChip`, `ANATOMY_EMPTY_NOTE`
- Produces:
  - `export const RECOVERY_MONTH_NOTE = "Recovery vs fade is shown for ranges within a single calendar month."`
  - `export type RecoveryView = { note: string | null; values: RecoveryShares | null }`
  - `export function recoveryView(shares: RecoveryShares | null, reason: "ok" | "month" | "empty"): RecoveryView`
  - `export function renderRecovery(root: HTMLElement, view: RecoveryView): void`
  - `buildRouteBrief(..., options: { direction?: string; includeRtFields?: boolean; recovery?: RecoveryShares | null })`

- [ ] **Step 1: Write a failing view test (no jsdom — match `profile.test.ts` stubs)**

Create `frontend/src/scripts/route/charts/recovery.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANATOMY_EMPTY_NOTE } from "./empty-state.ts";
import { RECOVERY_MONTH_NOTE, recoveryView } from "./recovery.ts";

test("month-span reason returns the month note and no values", () => {
  const view = recoveryView(null, "month");
  assert.equal(view.note, RECOVERY_MONTH_NOTE);
  assert.equal(view.values, null);
});

test("empty reason reuses the anatomy empty note", () => {
  const view = recoveryView(null, "empty");
  assert.equal(view.note, ANATOMY_EMPTY_NOTE);
  assert.equal(view.values, null);
});

test("ok with shares returns values and no note", () => {
  const shares = {
    recovered: 0.4,
    stayed_late: 0.3,
    got_worse: 0.3,
    coverage: 0.8,
  };
  const view = recoveryView(shares, "ok");
  assert.equal(view.note, null);
  assert.deepEqual(view.values, shares);
});

test("ok without shares falls back to the anatomy empty note", () => {
  const view = recoveryView(null, "ok");
  assert.equal(view.note, ANATOMY_EMPTY_NOTE);
  assert.equal(view.values, null);
});
```

- [ ] **Step 2: Run the view test to verify it fails**

Run: `cd frontend && node --experimental-strip-types --test src/scripts/route/charts/recovery.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `recoveryView` and `renderRecovery`**

Do not destroy tile markup. Hide `.tiles` when a note is shown; write percents onto `[data-recovery]` when values exist. `renderRecovery` can stay untested like other chart painters that need a real DOM — `recoveryView` is the contract.

```ts
import { formatPercent } from "../../../lib/format";
import type { RecoveryShares } from "../../../lib/recovery";
import { ANATOMY_EMPTY_NOTE } from "./empty-state";

export const RECOVERY_MONTH_NOTE =
  "Recovery vs fade is shown for ranges within a single calendar month.";

export interface RecoveryView {
  note: string | null;
  values: RecoveryShares | null;
}

const TILES = ["recovered", "stayed_late", "got_worse", "coverage"] as const;

export function recoveryView(
  shares: RecoveryShares | null,
  reason: "ok" | "month" | "empty",
): RecoveryView {
  switch (reason) {
    case "month":
      return { note: RECOVERY_MONTH_NOTE, values: null };
    case "empty":
      return { note: ANATOMY_EMPTY_NOTE, values: null };
    case "ok":
      if (!shares) return { note: ANATOMY_EMPTY_NOTE, values: null };
      return { note: null, values: shares };
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function renderRecovery(root: HTMLElement, view: RecoveryView): void {
  const tiles = root.querySelector<HTMLElement>(".tiles");
  let note = root.querySelector<HTMLElement>("[data-recovery-note]");
  if (!note) {
    note = root.ownerDocument.createElement("p");
    note.className = "rt-stub-note";
    note.setAttribute("data-recovery-note", "");
    root.insertBefore(note, tiles);
  }

  if (view.values) {
    note.hidden = true;
    if (tiles) tiles.hidden = false;
    const values = view.values;
    for (const key of TILES) {
      const el = root.querySelector<HTMLElement>(`[data-recovery='${key}']`);
      if (el) el.textContent = formatPercent(values[key]);
    }
    return;
  }

  note.hidden = false;
  if (tiles) tiles.hidden = true;
  note.textContent = view.note ?? ANATOMY_EMPTY_NOTE;
}
```

- [ ] **Step 4: Mark tiles with `data-recovery`**

In `frontend/src/data/placeholder.ts`, add `recovery?: "recovered" | "stayed_late" | "got_worse" | "coverage"` to `Tile`. Update `RECOVERY_TILES`:

```ts
export const RECOVERY_TILES: Tile[] = [
  { kicker: "Recovered", value: AWAITING_DATA, delta: "of mid-route late trips", trend: "flat", recovery: "recovered" },
  { kicker: "Stayed late", value: AWAITING_DATA, delta: "finished >2.5 min late", trend: "flat", recovery: "stayed_late" },
  { kicker: "Got worse", value: AWAITING_DATA, delta: "delay grew after midpoint", trend: "flat", recovery: "got_worse" },
  { kicker: "RT coverage", value: AWAITING_DATA, delta: "observed trips with a mid and end sample", trend: "flat", recovery: "coverage" },
];
```

In `SummaryTiles.astro`, on the value `<p>`:

```astro
data-recovery={tile.recovery}
```

In `frontend/src/pages/routes/[route].astro`, wrap the tiles:

```astro
<div id="recovery-root">
  <SummaryTiles tiles={RECOVERY_TILES} bare />
</div>
```

Leave the heading and subtitle outside `#recovery-root`.

- [ ] **Step 5: Query and refresh from `route-app.ts`**

Import `ensureStopDelayView`, `routeRecoverySql`, `recoveryPeriodAllowed`, `recoveryShares`, `recoveryView`, `renderRecovery`.

Add `renderRouteRecovery(conn, range, route, direction)` next to `renderDelayAnatomy`. Call it from the same two places: period refresh (after `renderDelayAnatomy`) and the direction-chip handler.

```ts
async function renderRouteRecovery(
  conn: DuckDbConnection | null,
  range: DateRange | null,
  route: string,
  direction: Direction,
): Promise<void> {
  const root = document.getElementById("recovery-root");
  if (!root) return;

  if (!range || !recoveryPeriodAllowed(range)) {
    renderRecovery(root, recoveryView(null, "month"));
    cachedRecovery = null;
    updateRouteBrief();
    return;
  }
  if (!conn) {
    renderRecovery(root, recoveryView(null, "empty"));
    cachedRecovery = null;
    updateRouteBrief();
    return;
  }

  const ready = await ensureStopDelayView(conn, range);
  if (!ready) {
    renderRecovery(root, recoveryView(null, "empty"));
    cachedRecovery = null;
    updateRouteBrief();
    return;
  }

  const table = await conn.query(
    routeRecoverySql(route, range.from, range.to, directionIdFromChip(direction)),
  );
  const row = table.toArray()[0];
  const shares = recoveryShares({
    n_observed: Number(row?.n_observed ?? 0),
    n_classifiable: Number(row?.n_classifiable ?? 0),
    n_mid_late: Number(row?.n_mid_late ?? 0),
    n_recovered: Number(row?.n_recovered ?? 0),
    n_stayed_late: Number(row?.n_stayed_late ?? 0),
    n_got_worse: Number(row?.n_got_worse ?? 0),
  });
  cachedRecovery = shares;
  renderRecovery(root, recoveryView(shares, shares ? "ok" : "empty"));
  updateRouteBrief();
}
```

Declare `let cachedRecovery: RecoveryShares | null = null;` with the other caches. Pass it into `buildRouteBrief`:

```ts
buildRouteBrief(routeId, routeName, cachedSummary, cachedPrior, {
  direction: currentDirection,
  includeRtFields: false,
  recovery: cachedRecovery,
});
```

On period start, skip a loading flash; leave the placeholder tiles until the query returns.

- [ ] **Step 6: Attach recovery to the commentary brief**

In `frontend/src/scripts/commentary/brief.ts`, extend options with `recovery?: RecoveryShares | null`. After building `stats`, if `options.recovery?.recovered != null`:

```ts
stats.recovery = {
  recovered_pct: pct(options.recovery.recovered) ?? 0,
  stayed_late_pct: pct(options.recovery.stayed_late) ?? 0,
  got_worse_pct: pct(options.recovery.got_worse) ?? 0,
  rt_coverage_pct: pct(options.recovery.coverage) ?? 0,
};
```

Omit `stats.recovery` when the cohort is empty (`recovered` is null). Import `RecoveryShares` from `../../lib/recovery`.

- [ ] **Step 7: Run tests and check**

Run: `cd frontend && npm test && npm run check`

Expected: 0 failures, 0 `astro check` errors.

Manual: with `docker compose up` and the local archive, open a route, **This month** — tiles should fill from 12 Aug onward. **All available** — month note. Direction chips should change the numbers without a second parquet download (Network panel: one `2026-08.parquet` request).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/data/placeholder.ts frontend/src/components/SummaryTiles.astro frontend/src/pages/routes/\[route\].astro frontend/src/scripts/route/charts/recovery.ts frontend/src/scripts/route/charts/recovery.test.ts frontend/src/scripts/route/route-app.ts frontend/src/scripts/commentary/brief.ts
git commit -m "$(cat <<'EOF'
feat: fill recovery vs fade tiles from stop-delay

EOF
)"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/specs/2026-08-13-stop-delay-anatomy-design.md`
- Modify: `docs/specs/2026-08-13-route-page-design.md`
- Modify: `docs/specs/2026-08-12-metlake-frontend-design.md`

**Interfaces:**
- Consumes: [`docs/specs/2026-08-14-recovery-vs-fade-design.md`](../specs/2026-08-14-recovery-vs-fade-design.md)
- Produces: anatomy / route-page / frontend-design text that matches the implementation

- [ ] **Step 1: Anatomy spec — allow the route-page fetch**

Principle / UI / Out of scope currently say never fetch `stop-delay`. Change to: Overview never fetches it; the route page may register one month for Recovery vs fade (see the 2026-08-14 spec). Leave the three thin trees as the source for profile / injectors / hour-heat.

In **Out of scope**, replace “Scanning `stop-delay` or raw GTFS-RT in the browser” with “Scanning raw GTFS-RT in the browser; Overview scanning `stop-delay`”.

- [ ] **Step 2: Route-page spec — direction chips**

In the delay-anatomy bullet and the behaviour table, direction chips re-render the three delay charts **and** Recovery vs fade.

- [ ] **Step 3: Frontend design data table**

Add a row: Route Recovery vs fade → `derived/stop-delay` (browser aggregate; single calendar month). Keep the thin-tree row for hour heat / profile / injectors / corridors.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-08-13-stop-delay-anatomy-design.md docs/specs/2026-08-13-route-page-design.md docs/specs/2026-08-12-metlake-frontend-design.md
git commit -m "$(cat <<'EOF'
docs: allow route-page stop-delay reads for recovery tiles

EOF
)"
```

---

## Spec coverage

| Spec | Task |
| --- | --- |
| No new derive | 1–3 (frontend only) |
| 150 s late / exclusive outcomes | 1 |
| Coverage = classifiable / observed | 1, 3 (delta copy) |
| Single calendar month gate | 1, 2, 3 |
| Optional stop-delay manifest | 2 |
| Filter route before windows | 1 |
| Direction chips refresh tiles | 3 |
| Overview unchanged | 2 (no overview imports) |
| Commentary `recovery` when cohort non-empty | 3 |
| Anatomy / route-page / frontend docs | 4 |

## Implementer notes

- August local archive is **one RT day**. “This month” will classify 12 Aug only; that is enough to see tiles move.
- `showRouteScorecardLoading` selects `[data-metric]`. Recovery values must stay on `data-recovery`.
- HTTP range requests will still download the whole monthly file (one row group, unsorted by route). The month gate is the bandwidth cap.
- Do not hive-partition or add `derived/recovery/` in this work.
