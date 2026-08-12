# Metlake frontend implementation plan

> **Status:** Tasks 1–8 complete. SPA under `frontend/src/` is the UI source of truth (HTML prototypes removed after parity).

**Goal:** Ship a Caddy-served Astro static SPA that reads the archive under `/data/`, without changing the main capture image.

**Architecture:** `frontend/` multi-stage Docker (Node build → Caddy). Compose mounts `$ARCHIVE_ROOT` read-only. DuckDB-WASM in the browser.

**Tech stack:** Astro (static), DuckDB-WASM, Caddy, optional Chrome `LanguageModel` commentary.

## Global constraints

- Exclude `frontend/` from the root appliance image (`.dockerignore`).
- Do not add cloud SDKs to capture scripts.
- Copy: outcomes-first; no data-lake explainer; MissingLink only as a light Overview sibling note.
- Colours: Wellington-adjacent tokens — not Metlink brand hexes.
- Keep SPA as the UI source of truth (prototypes removed after parity).

## Page map

| Route | Implement as |
| --- | --- |
| Overview | `src/pages/index.astro` + islands |
| Route scorecard | `src/pages/routes/[route].astro` (header typeahead) |
| Route deep | `src/pages/routes/[route]/deep.astro` |
| Query | `src/pages/query.astro` |
| Tokens / styles | `src/styles/` |
| Commentary | `src/scripts/commentary/` |

---

### Task 1: Spec already written — scaffold Astro from prototypes

**Files:**
- Create: `frontend/package.json`, `frontend/astro.config.mjs`, `frontend/tsconfig.json`
- Create: `frontend/src/pages/*` mirroring prototype routes
- Create: `frontend/src/styles/tokens.css` (port CSS variables from `prototypes/styles.css`)
- Keep: `frontend/prototypes/**` unchanged

**Steps:**
- [ ] Scaffold Astro `output: 'static'` under `frontend/` (app root = `frontend/`, prototypes stay in `frontend/prototypes/`).
- [ ] Port layout chrome (header, nav, sibling note, footer attribution) from prototypes.
- [ ] Stub pages with prototype section structure and placeholder chart slots.
- [ ] `npm run build` succeeds with empty/mock data.
- [ ] Commit: `feat: scaffold metlake frontend from UI prototypes`

---

### Task 2: Manifest + DuckDB-WASM performance spine

**Files:**
- Modify: `scripts/derive-route-performance.sh`
- Create: `frontend/src/lib/duckdb.ts`, `frontend/src/lib/performance.ts`, `frontend/src/lib/manifest.ts`

**Steps:**
- [ ] After writing monthly Parquet, rewrite `derived/route-performance/_manifest.json` with sorted `months` + `updated_at`.
- [ ] Frontend: fetch `/data/derived/route-performance/_manifest.json`, load intersecting month URLs into DuckDB-WASM.
- [ ] SQL helpers for period summary, leaderboard, daily series, peak-gap by route.
- [ ] Empty-archive friendly error state.
- [ ] Commit: `feat: wire DuckDB-WASM to route-performance parquet`

---

### Task 3: Overview SPA = scorecard + high-value network charts

**Reference:** `frontend/prototypes/index.html`, `network-deep.js`

**Steps:**
- [ ] Period chips + compare prior period (prototype behaviour).
- [ ] Summary tiles + best / needs-attention lists.
- [ ] Charts: punctuality calendar, cancellations sparkline, peak-gap scatter.
- [ ] Stub or feature-flag hour heat + choke points until RT derives exist (UI present, empty/disabled with short note).
- [ ] Commit: `feat: implement overview scorecard and network charts`

---

### Task 4: Route scorecard + query page

**Reference:** `prototypes/route.html`, `prototypes/query.html`

**Steps:**
- [ ] Route page: metric chips, tiles, daily series, export affordances, link to deep.
- [ ] Query page: SQL editor, run via DuckDB-WASM, CSV download, `/data/` links.
- [ ] Commit: `feat: add route scorecard and query pages`

---

### Task 5: Route deep (phased data)

**Reference:** `prototypes/route-deep.html`, `deep-dive.js`

**Steps:**
- [ ] Port UI: direction toggle, stop profile, injectors, hour heat, recovery tiles.
- [ ] If RT-derived Parquet not yet available: keep UI with clear “needs trip-update derives” empty state (same as prototype honesty).
- [ ] Follow-up (can be same PR or next): `derived/delay-by-stop`, `derived/delay-by-hour` jobs + wire charts.
- [ ] Commit: `feat: add route deep dive UI`

---

### Task 6: Optional Chrome Prompt API commentary

**Reference:** `prototypes/commentary.js`

**Steps:**
- [ ] Port brief-builder from visible aggregates + `LanguageModel` session with system rules.
- [ ] Sample fallback when API unsupported/unavailable.
- [ ] Commit: `feat: add on-device performance commentary`

---

### Task 7: Caddy image, compose, CI, docs

**Files:**
- Create: `frontend/Dockerfile`, `frontend/Caddyfile`
- Modify: `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `README.md`

**Steps:**
- [ ] Multi-stage image: build Astro → `caddy:alpine` with browse on `/data/*`.
- [ ] Compose `frontend` service port `8080:80`, archive `:ro`.
- [ ] `.dockerignore` excludes `frontend/` from appliance context (prototypes included under frontend/).
- [ ] CI job: `npm ci && npm run build` in `frontend/`.
- [ ] README Web UI section; point at prototypes for design reference until removed.
- [ ] Commit: `feat: serve frontend with Caddy sidecar`

---

### Task 8: Remove prototypes (only after parity)

**Steps:**
- [x] Walk prototype pages vs SPA checklist with human.
- [x] Delete `frontend/prototypes/` and update docs links.
- [x] Commit: `chore: remove frontend HTML prototypes after SPA parity`
