# Route picker dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header typeahead with a native `<dialog>` that lists routes by mode, code, and name.

**Architecture:** Keep the DuckDB-WASM catalogue spine. Add a small pure `route-mode` helper for GTFS grouping/filter. `SiteHeader` owns the button + `<dialog>` markup; `route-picker.ts` opens it with `showModal()`, renders grouped rows, and navigates to `/routes/{id}/`.

**Tech Stack:** Astro static, TypeScript, DuckDB-WASM, native HTML `<dialog>`, existing CSS tokens.

## Global Constraints

- Colours: Wellington-adjacent tokens — not Metlink brand hexes.
- Copy: outcomes-first; no data-lake explainer.
- No new test runner; verify with `npm run check` and `npm run build` in `frontend/`.
- Do not merge scorecard and deep dive; do not delete `/routes/{id}/deep/`.
- Do not add icon fonts; inline SVG only.
- Header never shows a selected route on Overview or Query.

## File map

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/types.ts` | `RouteCatalogEntry.route_type` |
| `frontend/src/lib/performance.ts` | Catalogue SQL includes `route_type` |
| `frontend/src/lib/route-mode.ts` | Mode labels, filter, group (new) |
| `frontend/src/components/SiteHeader.astro` | Button + dialog markup |
| `frontend/src/scripts/nav/route-picker.ts` | Open/close, load, render, navigate |
| `frontend/src/styles/layout.css` | Button + dialog styles; remove typeahead styles |
| `frontend/src/pages/index.astro` | Remove deep-dive CTA |
| `frontend/src/pages/routes/[route].astro` | Remove deep-dive CTA |
| `frontend/src/scripts/route/route-app.ts` | Stop rewriting deep-dive href |
| `frontend/src/lib/route-memory.ts` | Delete |
| `frontend/src/lib/site.ts` | Nav comment |
| `README.md` | Header copy |

---

### Task 1: Catalogue type, SQL, and mode grouping

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/performance.ts`
- Create: `frontend/src/lib/route-mode.ts`

**Interfaces:**
- Consumes: existing `RouteCatalogEntry`, `getRouteCatalog`, `toNullableNumber` / `toNullableString`
- Produces:
  - `RouteCatalogEntry.route_type: number | null`
  - `modeGroupFor(routeType: number | null): RouteModeGroup`
  - `routeCode(entry: RouteCatalogEntry): string`
  - `filterRoutes(routes: readonly RouteCatalogEntry[], query: string): RouteCatalogEntry[]`
  - `groupRoutes(routes: readonly RouteCatalogEntry[]): GroupedRoutes[]`

- [ ] **Step 1: Add `route_type` to the catalogue type**

In `frontend/src/lib/types.ts`, change `RouteCatalogEntry` to:

```ts
export interface RouteCatalogEntry {
  route: string;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number | null;
}
```

- [ ] **Step 2: Return `route_type` from `getRouteCatalog`**

In `frontend/src/lib/performance.ts`, update the query and mapper:

```ts
export async function getRouteCatalog(conn: DuckDbConnection): Promise<RouteCatalogEntry[]> {
  const result = await conn.query(`
    SELECT
      route,
      any_value(route_short_name) AS route_short_name,
      any_value(route_long_name) AS route_long_name,
      any_value(route_type) AS route_type
    FROM ${ROUTE_PERFORMANCE_VIEW}
    GROUP BY route
    ORDER BY route ASC;
  `);

  return result.toArray().map((row) => ({
    route: String(row.route),
    route_short_name: toNullableString(row.route_short_name),
    route_long_name: toNullableString(row.route_long_name),
    route_type: toNullableNumber(row.route_type),
  }));
}
```

- [ ] **Step 3: Add `frontend/src/lib/route-mode.ts`**

```ts
import type { RouteCatalogEntry } from "./types";

export type RouteModeGroup = "Bus" | "Train" | "Ferry" | "Cable car" | "Other";

export const MODE_GROUP_ORDER: readonly RouteModeGroup[] = [
  "Bus",
  "Train",
  "Ferry",
  "Cable car",
  "Other",
];

export interface GroupedRoutes {
  group: RouteModeGroup;
  routes: RouteCatalogEntry[];
}

export function modeGroupFor(routeType: number | null): RouteModeGroup {
  switch (routeType) {
    case 3:
      return "Bus";
    case 2:
      return "Train";
    case 4:
      return "Ferry";
    case 5:
      return "Cable car";
    default:
      return "Other";
  }
}

export function routeCode(entry: RouteCatalogEntry): string {
  return entry.route_short_name ?? entry.route;
}

export function filterRoutes(
  routes: readonly RouteCatalogEntry[],
  query: string,
): RouteCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...routes];
  return routes.filter((entry) => {
    const id = routeCode(entry).toLowerCase();
    const name = (entry.route_long_name ?? "").toLowerCase();
    return id.includes(q) || name.includes(q) || entry.route.toLowerCase().includes(q);
  });
}

export function groupRoutes(routes: readonly RouteCatalogEntry[]): GroupedRoutes[] {
  const buckets = new Map<RouteModeGroup, RouteCatalogEntry[]>();
  for (const group of MODE_GROUP_ORDER) {
    buckets.set(group, []);
  }
  for (const entry of routes) {
    const group = modeGroupFor(entry.route_type);
    buckets.get(group)?.push(entry);
  }
  return MODE_GROUP_ORDER.map((group) => ({
    group,
    routes: buckets.get(group) ?? [],
  })).filter((section) => section.routes.length > 0);
}
```

`modeGroupFor` uses `default` (not `never`) because `route_type` is `number | null`, not a closed union.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run check`
Expected: no errors from these files. Other pre-existing errors are out of scope only if they are unrelated; new `route_type` must not break callers of `RouteCatalogEntry` (only `route-picker.ts` constructs/consumes the catalogue today).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/performance.ts frontend/src/lib/route-mode.ts
git commit -m "$(cat <<'EOF'
feat: include GTFS route_type in the route catalogue

EOF
)"
```

---

### Task 2: Header button, dialog markup, picker script, styles

**Files:**
- Modify: `frontend/src/components/SiteHeader.astro`
- Modify: `frontend/src/scripts/nav/route-picker.ts`
- Modify: `frontend/src/styles/layout.css`
- Modify: `frontend/src/lib/site.ts`

**Interfaces:**
- Consumes: `getRouteCatalog`, `filterRoutes`, `groupRoutes`, `routeCode`, `parseRouteFromPathname`
- Produces: `initRoutePicker(root: HTMLElement): Promise<void>` (no `wireDeepDiveLinks`)

- [ ] **Step 1: Replace the typeahead in `SiteHeader.astro`**

Keep the existing brand + Overview / Query / `/data/` links. Replace the `nav-route` combobox with:

```astro
<div
  class="nav-route"
  data-route-picker
  data-current={current === "route" ? "page" : undefined}
>
  <button
    type="button"
    class="nav-route-btn"
    data-route-open
    aria-haspopup="dialog"
    aria-controls="route-picker-dialog"
  >
    <span class="nav-route-label">Select a route</span>
    <svg class="nav-route-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9ZM4.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-7ZM6 5h4v1.25H6V5Zm0 2.5h4V8.75H6V7.5Zm0 2.5h2.5V11.25H6V10Z"
      />
    </svg>
  </button>
  <dialog id="route-picker-dialog" class="route-dialog" data-route-dialog>
    <div class="route-dialog-panel">
      <div class="route-dialog-head">
        <h2 id="route-picker-title">Select a route</h2>
        <button type="button" class="route-dialog-close" data-route-close aria-label="Close">
          Close
        </button>
      </div>
      <label class="visually-hidden" for="route-picker-search">Search routes</label>
      <input
        id="route-picker-search"
        class="route-dialog-search"
        type="search"
        data-route-search
        placeholder="Search by code or name"
        autocomplete="off"
        spellcheck="false"
      />
      <div
        class="route-dialog-catalog"
        data-route-catalog
        role="listbox"
        aria-labelledby="route-picker-title"
      ></div>
    </div>
  </dialog>
</div>
```

Keep the existing script:

```astro
<script>
  import { initRoutePicker } from "../scripts/nav/route-picker";

  const root = document.querySelector<HTMLElement>("[data-route-picker]");
  if (root) void initRoutePicker(root);
</script>
```

On route pages (`data-current="page"`), CSS hides `.nav-route-label` and the button’s accessible name is set in JS to **Change route**. On other pages the visible label is **Select a route**.

- [ ] **Step 2: Rewrite `frontend/src/scripts/nav/route-picker.ts`**

Replace the file. Do not import `route-memory`. Do not export `wireDeepDiveLinks`.

```ts
import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import { getRouteCatalog } from "../../lib/performance";
import { parseRouteFromPathname } from "../../lib/route-path";
import { filterRoutes, groupRoutes, routeCode } from "../../lib/route-mode";
import { RoutePerformanceSession } from "../../lib/session";
import type { RouteCatalogEntry } from "../../lib/types";

function endOfMonthIso(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNum, 0));
  return last.toISOString().slice(0, 10);
}

function navigateToRoute(route: string): void {
  const target = `/routes/${encodeURIComponent(route)}/`;
  if (window.location.pathname === target) return;
  window.location.assign(target);
}

function setCatalogMessage(catalog: HTMLElement, message: string): void {
  catalog.replaceChildren();
  const p = document.createElement("p");
  p.className = "route-dialog-status";
  p.textContent = message;
  catalog.append(p);
}

function renderCatalog(
  catalog: HTMLElement,
  routes: readonly RouteCatalogEntry[],
  query: string,
  currentRoute: string | null,
): void {
  const matches = filterRoutes(routes, query);
  const sections = groupRoutes(matches);
  catalog.replaceChildren();

  if (sections.length === 0) {
    setCatalogMessage(catalog, "No matching routes");
    return;
  }

  for (const section of sections) {
    const heading = document.createElement("h3");
    heading.className = "route-dialog-group";
    heading.textContent = section.group;
    catalog.append(heading);

    const list = document.createElement("ul");
    list.className = "route-dialog-list";
    for (const entry of section.routes) {
      const id = routeCode(entry);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-dialog-row";
      button.dataset.route = id;
      if (currentRoute && (id === currentRoute || entry.route === currentRoute)) {
        button.setAttribute("aria-current", "true");
      }

      const mode = document.createElement("span");
      mode.className = "route-dialog-mode";
      mode.textContent = section.group;

      const code = document.createElement("span");
      code.className = "route-dialog-code";
      code.textContent = id;

      const name = document.createElement("span");
      name.className = "route-dialog-name";
      name.textContent = entry.route_long_name?.trim() || id;

      button.append(mode, code, name);
      item.append(button);
      list.append(item);
    }
    catalog.append(list);
  }
}

export async function initRoutePicker(root: HTMLElement): Promise<void> {
  const openBtn = root.querySelector<HTMLButtonElement>("[data-route-open]");
  const dialog = root.querySelector<HTMLDialogElement>("[data-route-dialog]");
  const closeBtn = root.querySelector<HTMLButtonElement>("[data-route-close]");
  const search = root.querySelector<HTMLInputElement>("[data-route-search]");
  const catalog = root.querySelector<HTMLElement>("[data-route-catalog]");
  if (!openBtn || !dialog || !closeBtn || !search || !catalog) return;

  const currentRoute = parseRouteFromPathname();
  const onRoutePage = root.dataset.current === "page";
  openBtn.setAttribute("aria-label", onRoutePage ? "Change route" : "Select a route");

  let routes: RouteCatalogEntry[] = [];
  let loaded = false;
  let failed = false;
  let loading = false;

  const session = new RoutePerformanceSession();

  function paint(): void {
    if (failed) {
      setCatalogMessage(catalog, "Routes unavailable");
      return;
    }
    if (!loaded) {
      setCatalogMessage(catalog, "Loading routes…");
      return;
    }
    renderCatalog(catalog, routes, search.value, currentRoute);
  }

  async function ensureCatalog(): Promise<void> {
    if (loaded || failed || loading) return;
    loading = true;
    paint();
    try {
      const manifest = await fetchRoutePerformanceManifest();
      session.primeManifest(manifest);
      const latest = manifest.months[manifest.months.length - 1];
      if (!latest) throw new Error("No route-performance months published.");
      const conn = await session.ensure({
        from: `${latest}-01`,
        to: endOfMonthIso(latest),
      });
      routes = await getRouteCatalog(conn);
      loaded = true;
    } catch (error) {
      console.error(error);
      failed = true;
      openBtn.disabled = true;
      openBtn.querySelector(".nav-route-label")?.replaceChildren(document.createTextNode("Routes unavailable"));
      openBtn.setAttribute("aria-label", "Routes unavailable");
      if (dialog.open) dialog.close();
    } finally {
      loading = false;
      paint();
    }
  }

  openBtn.addEventListener("click", () => {
    if (openBtn.disabled) return;
    paint();
    dialog.showModal();
    search.focus();
    void ensureCatalog();
  });

  closeBtn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  search.addEventListener("input", () => {
    if (!loaded || failed) return;
    renderCatalog(catalog, routes, search.value, currentRoute);
  });

  catalog.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-route]");
    if (!target?.dataset.route) return;
    navigateToRoute(target.dataset.route);
  });

  window.addEventListener("pagehide", () => {
    void session.close();
  });
}
```

If the catalogue fails **before** the dialog is open, the button is disabled and labelled **Routes unavailable** (spec). If it fails while open, close the dialog after disabling the button.

- [ ] **Step 3: Replace `.nav-route*` styles in `frontend/src/styles/layout.css`**

Delete `.nav-route-input`, `.nav-route-list`, and related typeahead rules. Add:

```css
.nav-route {
  display: flex;
  align-items: center;
}

.nav-route-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.4rem 0.7rem;
  cursor: pointer;
}

.nav-route-btn:hover {
  background: var(--paper);
}

.nav-route[data-current="page"] .nav-route-btn {
  background: var(--ink);
  color: white;
}

.nav-route[data-current="page"] .nav-route-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.nav-route:not([data-current="page"]) .nav-route-icon {
  display: none;
}

.nav-route-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--transit) 55%, white);
  outline-offset: 1px;
}

.nav-route-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.route-dialog {
  width: min(36rem, calc(100vw - 2rem));
  max-height: min(36rem, calc(100vh - 2rem));
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--ink);
}

.route-dialog::backdrop {
  background: rgb(19 40 51 / 45%);
}

.route-dialog-panel {
  display: flex;
  flex-direction: column;
  max-height: min(36rem, calc(100vh - 2rem));
}

.route-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1rem 0.55rem;
}

.route-dialog-head h2 {
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}

.route-dialog-close {
  appearance: none;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--ink-muted);
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.3rem 0.55rem;
  cursor: pointer;
}

.route-dialog-close:hover {
  background: var(--paper);
  color: var(--ink);
}

.route-dialog-search {
  margin: 0 1rem 0.65rem;
  font: inherit;
  font-size: 0.92rem;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
}

.route-dialog-search:focus {
  outline: 2px solid color-mix(in srgb, var(--transit) 55%, white);
  outline-offset: 1px;
}

.route-dialog-catalog {
  overflow: auto;
  padding: 0 0.65rem 0.85rem;
}

.route-dialog-status {
  margin: 0.5rem 0.35rem;
  color: var(--ink-muted);
  font-size: 0.88rem;
}

.route-dialog-group {
  margin: 0.7rem 0.35rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.route-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.route-dialog-row {
  appearance: none;
  width: 100%;
  display: grid;
  grid-template-columns: 5.5rem 3.5rem minmax(0, 1fr);
  gap: 0.55rem;
  align-items: baseline;
  text-align: left;
  font: inherit;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) - 2px);
  padding: 0.45rem 0.5rem;
  cursor: pointer;
}

.route-dialog-row:hover,
.route-dialog-row[aria-current="true"] {
  background: var(--paper);
}

.route-dialog-mode {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--transit);
}

.route-dialog-code {
  font-family: var(--mono);
  font-size: 0.84rem;
  font-weight: 600;
}

.route-dialog-name {
  font-size: 0.88rem;
  color: var(--ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Update the nav comment in `frontend/src/lib/site.ts`**

Change `Primary text links only — Route uses an inline picker in the header.` to `Primary text links only — Route uses a dialog opened from the header.`

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SiteHeader.astro frontend/src/scripts/nav/route-picker.ts frontend/src/styles/layout.css frontend/src/lib/site.ts
git commit -m "$(cat <<'EOF'
feat: open route picker in a native dialog

EOF
)"
```

---

### Task 3: Remove deep-dive CTAs and last-route memory

**Files:**
- Modify: `frontend/src/pages/index.astro`
- Modify: `frontend/src/pages/routes/[route].astro`
- Modify: `frontend/src/scripts/route/route-app.ts`
- Delete: `frontend/src/lib/route-memory.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: none
- Produces: no `wireDeepDiveLinks`; no `getLastRoute` / `setLastRoute`

- [ ] **Step 1: Overview — remove the deep-dive button and script**

In `frontend/src/pages/index.astro`:

- Delete the `.actions` block under Shared choke points that contains `data-deep-link`.
- Delete the inline `<script>` that imports `wireDeepDiveLinks`.

Leave the choke-points `ChartSlot` in place.

- [ ] **Step 2: Scorecard — remove the deep-dive button**

In `frontend/src/pages/routes/[route].astro`, in the Export `.actions` div, delete:

```astro
<a class="btn primary-signal" href={`/routes/${resolved.route}/deep/`}>Open deep dive</a>
```

Keep Query / CSV / Parquet.

- [ ] **Step 3: Stop rewriting the deep-dive href**

In `frontend/src/scripts/route/route-app.ts` `syncRouteHero`, remove `deepLink` lookup and assignment. Keep title, desc, dataset, and `document.title`.

- [ ] **Step 4: Delete `frontend/src/lib/route-memory.ts`**

Confirm no remaining imports of `getLastRoute`, `setLastRoute`, or `wireDeepDiveLinks`.

- [ ] **Step 5: README**

Replace:

`Use the header **route typeahead** to open any published route scorecard; deep dive stays linked from the scorecard.`

with:

`Use **Select a route** in the header to open any published route scorecard.`

- [ ] **Step 6: Typecheck and build**

Run:

```bash
cd frontend && npm run check && npm run build
```

Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/index.astro frontend/src/pages/routes/[route].astro frontend/src/scripts/route/route-app.ts frontend/src/lib/route-memory.ts README.md
git commit -m "$(cat <<'EOF'
chore: drop deep-dive CTAs and last-route memory

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| Header labelled vs icon-only | 2 |
| Native `showModal()` dialog, search, groups, rows | 2 |
| Mode map Bus/Train/Ferry/Cable car/Other | 1 |
| Catalogue from latest month + `route_type` | 1 |
| Loading / unavailable / no matches | 2 |
| Navigate to `/routes/{id}/` via short name | 2 |
| Remove deep-dive CTAs + `route-memory` | 3 |
| Keep `/deep/` page | 3 (does not delete it) |
| `astro check` / `astro build` | 1, 2, 3 |
