# Combined route page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold delay anatomy onto `/routes/{id}/` and delete the separate deep-dive page.

**Architecture:** One Astro page and one `route-app.ts` session. Move delay chart helpers into `frontend/src/scripts/route/`. Period refresh drives scorecard, series, commentary, and delay charts; direction chips re-render delay charts and the commentary direction field only.

**Tech Stack:** Astro static, TypeScript, DuckDB-WASM, existing CSS tokens.

## Global Constraints

- Colours: Wellington-adjacent tokens — not Metlink brand hexes.
- Copy: outcomes-first; no data-lake explainer.
- No new test runner; verify with `npm run check` and `npm run build` in `frontend/`.
- Delete `/routes/{id}/deep/` with no redirect.
- No `route-deep` path, id, or app entry. Modules live under `frontend/src/scripts/route/`.
- Do not wire delay charts to real GTFS-RT derives; keep RT empty states.
- Keep the existing “When trips ran late” scorecard chart; it sits with published metrics, before delay anatomy.

## File map

| File | Responsibility |
| --- | --- |
| `frontend/src/scripts/route/direction.ts` | Direction type + chip binding (moved; drop unused hero helper) |
| `frontend/src/scripts/route/charts/{profile,injectors,heatmap,empty-state}.ts` | RT empty-state chart renderers (moved) |
| `frontend/src/scripts/route/route-app.ts` | Session, period, commentary, delay-chart refresh |
| `frontend/src/pages/routes/[route].astro` | Combined markup |
| `frontend/src/pages/routes/[route]/deep.astro` | Delete |
| `frontend/src/scripts/route-deep/**` | Delete |
| `frontend/Caddyfile` | Drop `@routeDeep` |
| `frontend/src/lib/route-path.ts` | Scorecard path only |
| `frontend/src/lib/site.ts` | Drop `ATTRIBUTION.deep` |
| `frontend/src/styles/route.css` | Direction chips in viz-head; drop unused callout styles |
| `docs/specs/2026-08-12-metlake-frontend-design.md` | Page map |

---

### Task 1: Move delay modules into `scripts/route/`

**Files:**
- Create: `frontend/src/scripts/route/direction.ts`
- Create: `frontend/src/scripts/route/charts/empty-state.ts`
- Create: `frontend/src/scripts/route/charts/profile.ts`
- Create: `frontend/src/scripts/route/charts/injectors.ts`
- Create: `frontend/src/scripts/route/charts/heatmap.ts`
- Delete: `frontend/src/scripts/route-deep/` (entire tree)

**Interfaces:**
- Produces:
  - `export type Direction = "inbound" | "outbound"`
  - `export function bindDirectionToggle(root: HTMLElement, onChange: (direction: Direction) => void): void`
  - `export function renderStopProfile(root: HTMLElement): void`
  - `export function renderInjectors(root: HTMLElement): void`
  - `export function renderHourHeatmap(root: HTMLElement): void`
  - `export function renderRtEmptyState(root: HTMLElement, className: string): void`

- [ ] **Step 1: Copy chart files into `frontend/src/scripts/route/charts/`**

Keep bodies unchanged. `empty-state.ts` still exports `RT_DERIVE_NOTE` and `renderRtEmptyState`. Profile / injectors / heatmap still import `./empty-state`.

- [ ] **Step 2: Move `direction.ts` without the hero helper**

`heroForDirection` is unused once chips live on the delay section, not the page hero.

```ts
export type Direction = "inbound" | "outbound";

export function bindDirectionToggle(
  root: HTMLElement,
  onChange: (direction: Direction) => void,
): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-direction]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction;
      if (direction !== "inbound" && direction !== "outbound") return;

      for (const chip of buttons) {
        chip.setAttribute("aria-pressed", String(chip === button));
      }

      onChange(direction);
    });
  }
}
```

- [ ] **Step 3: Delete `frontend/src/scripts/route-deep/`**

---

### Task 2: Combined route page markup

**Files:**
- Modify: `frontend/src/pages/routes/[route].astro`
- Modify: `frontend/src/styles/route.css`
- Delete: `frontend/src/pages/routes/[route]/deep.astro`

**Interfaces:**
- Consumes: `RECOVERY_TILES`, `HeatmapLegend`, `SummaryTiles`
- Produces: DOM ids `profile-root`, `injector-list`, `heatmap-root`; `[data-direction]` chips inside the delay section head

- [ ] **Step 1: Add delay anatomy after “When trips ran late”, before Export**

Imports: add `HeatmapLegend` and `RECOVERY_TILES`.

Insert:

```astro
        <section class="section viz-panel" aria-labelledby="profile-heading">
          <div class="viz-head">
            <div>
              <h2 id="profile-heading">Delay along the route</h2>
              <p>Median delay at each stop · band = 25th–75th percentile (seconds late)</p>
            </div>
            <div class="direction-toggle" role="group" aria-label="Direction">
              <button type="button" class="chip" data-direction="inbound" aria-pressed="true">
                Inbound
              </button>
              <button type="button" class="chip" data-direction="outbound" aria-pressed="false">
                Outbound
              </button>
            </div>
          </div>
          <div id="profile-root" class="chart-slot-disabled" aria-label="Stop profile chart"></div>
        </section>

        <section class="section viz-grid two">
          <article class="viz-panel" aria-labelledby="inject-heading">
            <div class="viz-head">
              <h2 id="inject-heading">Where delay is introduced</h2>
              <p>Average extra seconds added between consecutive stops</p>
            </div>
            <ol class="injector-list" id="injector-list" aria-label="Delay injector list"></ol>
          </article>

          <article class="viz-panel" aria-labelledby="tod-heading">
            <div class="viz-head">
              <h2 id="tod-heading">Delay through the day</h2>
              <p>Median trip delay (seconds) by weekday × departure hour</p>
            </div>
            <div class="heatmap" id="heatmap-root" aria-label="Time-of-day heatmap"></div>
            <HeatmapLegend lowLabel="on time" highLabel="+4m+" />
          </article>
        </section>

        <section class="section viz-panel" aria-labelledby="recovery-heading">
          <div class="viz-head">
            <h2 id="recovery-heading">Recovery vs fade</h2>
            <p>
              Share of trips that were &gt;2.5 min late mid-route, then finished within grace
            </p>
          </div>
          <SummaryTiles tiles={RECOVERY_TILES} bare />
        </section>
```

Do not add callouts, deep-dive CTAs, or stop-profile CSV.

- [ ] **Step 2: Direction chips in viz-head; drop unused callout CSS**

In `frontend/src/styles/route.css`, add:

```css
.viz-head .direction-toggle {
  margin-top: 0;
  align-self: start;
}
```

Delete `.callout-insights` rules (no longer used).

- [ ] **Step 3: Delete `frontend/src/pages/routes/[route]/deep.astro`**

---

### Task 3: Wire delay charts in `route-app.ts`

**Files:**
- Modify: `frontend/src/scripts/route/route-app.ts`

**Interfaces:**
- Consumes: `bindDirectionToggle`, `Direction`, `renderStopProfile`, `renderInjectors`, `renderHourHeatmap`, `buildRouteBrief`
- Produces: period refresh re-renders delay charts; direction change re-renders delay charts and commentary `direction`

- [ ] **Step 1: Import delay helpers and keep direction + last summaries**

```ts
import { bindDirectionToggle, type Direction } from "./direction";
import { renderHourHeatmap } from "./charts/heatmap";
import { renderInjectors } from "./charts/injectors";
import { renderStopProfile } from "./charts/profile";
import type { PeriodSummary } from "../../lib/types";
```

Add module state:

```ts
let currentDirection: Direction = "inbound";
let cachedSummary: PeriodSummary | null = null;
let cachedPrior: PeriodSummary | null = null;
```

- [ ] **Step 2: Render delay charts and pass direction into commentary**

```ts
function renderDelayAnatomy(root: HTMLElement): void {
  const profile = root.querySelector<HTMLElement>("#profile-root");
  const injectors = root.querySelector<HTMLElement>("#injector-list");
  const heatmap = root.querySelector<HTMLElement>("#heatmap-root");
  if (profile) renderStopProfile(profile);
  if (injectors) renderInjectors(injectors);
  if (heatmap) renderHourHeatmap(heatmap);
}

function updateRouteBrief(): void {
  if (!cachedSummary) return;
  commentaryPanel?.updateBrief(
    buildRouteBrief(routeId, routeName, cachedSummary, cachedPrior, {
      direction: currentDirection,
      includeRtFields: false,
    }),
  );
}
```

In `refreshRoute`, after a successful load, set `cachedSummary` / `cachedPrior`, call `updateRouteBrief()` instead of `buildRouteBrief(...)` directly, and `renderDelayAnatomy(root)` (pass the route root, or query `document.getElementById("route-root")`).

- [ ] **Step 3: Bind direction chips in `initRouteApp`**

After `bindMetricChips`:

```ts
    bindDirectionToggle(root, (direction) => {
      currentDirection = direction;
      renderDelayAnatomy(root);
      updateRouteBrief();
    });
    renderDelayAnatomy(root);
```

---

### Task 4: URLs, Caddy, attribution, docs

**Files:**
- Modify: `frontend/Caddyfile`
- Modify: `frontend/src/lib/route-path.ts`
- Modify: `frontend/src/lib/site.ts`
- Modify: `docs/specs/2026-08-12-metlake-frontend-design.md`

- [ ] **Step 1: Drop `@routeDeep` from `frontend/Caddyfile`**

Delete the `@routeDeep` matcher and its `handle` block. Keep `@routeScorecard` fallback to `/routes/__any__/index.html`.

- [ ] **Step 2: Scorecard-only path parser**

```ts
const ROUTE_PATH_RE = /^\/routes\/([^/]+)\/?$/;

/** Extract route id from `/routes/{id}/`. */
```

- [ ] **Step 3: Remove `ATTRIBUTION.deep`**

Leave `network` and `route` only.

- [ ] **Step 4: Update frontend design page map**

`/routes/[route]/` is the published scorecard plus delay anatomy. Remove the `/deep/` row and the separate “Route deep” IA item. Point at [`2026-08-13-route-page-design.md`](../specs/2026-08-13-route-page-design.md).

Confirm README has no separate deep-dive mention (already “Select a route”). Confirm no remaining `/deep/` hrefs or `wireDeepDiveLinks`.

---

### Task 5: Verify

- [ ] **Step 1: Typecheck**

Run: `npm run check` in `frontend/`

Expected: no errors.

- [ ] **Step 2: Build**

Run: `npm run build` in `frontend/`

Expected: success. Dist has `routes/{id}/index.html` and `routes/__any__/index.html`. No `routes/*/deep/` output.
