# Historical Map Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/replay/?from=&to=&t=` — network-wide historical vehicle map from curated GTFS-RT (no new derive), MapLibre + local PMTiles, shape-following motion, shareable playhead.

**Architecture:** DuckDB-WASM loads at most the UTC hour of `t` plus the next hour of vehiclepositions + tripupdates; flatten once into a JS capture map; rAF interpolates along GTFS shapes; MapLibre paints delay-coloured dots. Basemap is operator-supplied `/data/tiles/wellington.pmtiles`.

**Tech Stack:** Astro static, TypeScript, DuckDB-WASM, MapLibre GL, PMTiles protocol, node:test.

## Global Constraints

- No new `derived/` tree, crontab job, or parquet schema.
- Never query DuckDB on animation frames.
- SQL-string helpers stay in pure modules so `node:test` never imports DuckDB-WASM.
- Delay bands: ≤150 s `--live`, 150–300 s `--warn`, >300 s `--bad`, unknown muted.
- Off-shape threshold: 150 m → snap to GPS.
- `?route=` reserved but ignored in v1.

---

### Task 1: Replay URL helpers

**Files:**
- Create: `frontend/src/lib/replay-url.ts`
- Test: `frontend/src/lib/replay-url.test.ts`
- Modify: `frontend/src/lib/site.ts` (add `replayPageHref`)

**Interfaces:**
- Produces: `parseReplaySearch(search)`, `serializeReplaySearch(state)`, `replayPageHref({ from, to, t? })`, `utcHourKey(isoInstant)`, `nzDayStartIso(yyyyMmDd)`

- [ ] **Step 1: Write failing tests** for parse/serialize/`replayPageHref`/hour key.
- [ ] **Step 2: Implement** and pass tests.
- [ ] **Step 3: Commit** `feat: add replay URL helpers`

### Task 2: Replay SQL flatten helpers

**Files:**
- Create: `frontend/src/lib/replay-sql.ts`
- Test: `frontend/src/lib/replay-sql.test.ts`

**Interfaces:**
- Produces: `vehiclePositionsHourUrl(yyyy, mm, dd, hh)`, `tripUpdatesHourUrl(...)`, `flattenHourSql(vpVirtual, tuVirtual)`, `shapesForTripsSql(gtfsDirVirtual, tripIds)`

- [ ] **Step 1: Write failing tests** asserting SQL mentions nested fields, object/array `stop_time_update`, and URL shape.
- [ ] **Step 2: Implement** and pass tests.
- [ ] **Step 3: Commit** `feat: add replay SQL flatten helpers`

### Task 3: Shape motion helpers

**Files:**
- Create: `frontend/src/lib/replay-motion.ts`
- Test: `frontend/src/lib/replay-motion.test.ts`

**Interfaces:**
- Produces: `projectOntoShape(lat, lon, points)`, `lerpAlongShape(a, b, t)`, `positionAtPlayhead(prev, next, frac, shape)`, `delayBand(seconds | null)`

- [ ] **Step 1: Write failing tests** with synthetic polylines (on-shape lerp, off-shape snap, delay bands).
- [ ] **Step 2: Implement** and pass tests.
- [ ] **Step 3: Commit** `feat: add replay shape motion helpers`

### Task 4: Replay page shell + Overview link

**Files:**
- Create: `frontend/src/pages/replay.astro`
- Create: `frontend/src/styles/replay.css`
- Modify: `frontend/src/pages/index.astro` (link)
- Modify: `frontend/src/scripts/overview/overview-app.ts` (wire href from period)
- Modify: `docs/specs/2026-08-12-metlake-frontend-design.md` (page map)
- Modify: `README.md` (PMTiles note)

- [ ] **Step 1: Add** Astro page with map root, clock, play/scrub controls, vehicle card slot.
- [ ] **Step 2: Wire** Overview “Replay this period” link updating with period `from`/`to`.
- [ ] **Step 3: Document** `/replay/` and operator-supplied tiles path.
- [ ] **Step 4: Commit** `feat: add replay page shell and overview link`

### Task 5: Replay app — hour LRU + MapLibre overlay

**Files:**
- Create: `frontend/src/scripts/replay/replay-app.ts`
- Create: `frontend/src/lib/replay-hours.ts` (register/load hour, LRU)
- Modify: `frontend/package.json` (maplibre-gl, pmtiles)
- Modify: `frontend/src/lib/duckdb.ts` if shared register helpers need export

**Interfaces:**
- Consumes: Task 1–3 helpers, `connectDuckDb`, `registerFileURL`
- Produces: working `/replay/` that loads hours around `t`, plays, scrubs, paints dots

- [ ] **Step 1: Install** maplibre-gl + pmtiles.
- [ ] **Step 2: Implement** hour loader (vp+tu flatten → capture map; shapes for active trips; LRU ≤3).
- [ ] **Step 3: Implement** playhead (5-min grid, speeds 1×/4×/16×, throttled `?t=` replaceState).
- [ ] **Step 4: Implement** MapLibre map (PMTiles basemap with navy fallback; GeoJSON vehicles; click card).
- [ ] **Step 5: Run** `npm test`, `npm run check`, `npm run build`.
- [ ] **Step 6: Commit** `feat: wire map replay hour load and MapLibre overlay`

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| `/replay/?from&to&t` | 1, 4, 5 |
| Hybrid play + scrubber | 5 |
| Delay-coloured dots + card | 3, 5 |
| Hour LRU, no derive | 2, 5 |
| Shape follow / off-shape snap | 3, 5 |
| Overview link | 4 |
| PMTiles operator path | 4, 5 |
| No DuckDB on rAF | 5 |
