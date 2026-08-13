# Metlake frontend design (2026-08-12)

## Purpose

Serve historical Wellington Metlink performance from the filesystem archive: a static Astro site and `/data/` directory listing behind Caddy, separate from the capture appliance.

## UI

The Astro app under [`frontend/src/`](../../frontend/src/) is the UI source of truth.

| Path | Screen |
| --- | --- |
| `/` | Network scorecard + city-wide charts + auto commentary |
| `/routes/[route]/` | Published metrics + delay anatomy (pick route via [header dialog](./2026-08-13-route-picker-dialog-design.md)) |
| `/query/` | DuckDB-WASM SQL + file links |

See also [`2026-08-13-route-picker-dialog-design.md`](./2026-08-13-route-picker-dialog-design.md) and [`2026-08-13-route-page-design.md`](./2026-08-13-route-page-design.md).

## Product framing

- **What:** Historical Metlink performance to explore, compare, and download.
- **Not:** A live delay dashboard. One light sibling note on Overview only pointing at [MissingLink](https://www.missinglink.link/wellington) for today’s view.
- **Name:** “Metlake” / lake is branding only — no data-lake primer in the UI.
- **Visual:** Utility / open data; Wellington-*adjacent* colours (harbour navy, brass signal, muted lime). Do not copy Metlink brand hexes or marks.

## Information architecture

1. **Overview** — period control; commentary; summary tiles; most/least punctual routes; punctuality calendar; cancellations sparkline; peak-gap scatter; network hour×weekday heat; shared choke points.
2. **Route page** — chosen via header dialog; published reliability / punctuality / cancellations / series, then delay anatomy (stop profile, injectors, hour heat, recovery vs fade; needs GTFS-RT-derived tables).
3. **Query** — SQL against `/data/…`, CSV export, links into directory listing.

## Data

| UI surface | Primary data |
| --- | --- |
| Overview scorecard, route scorecard, calendar, peak gap, cancellations | `derived/route-performance/*.parquet` (+ `_manifest.json`); may include RT-estimated days from `derived/rt-route-performance/` when the published CSV has no row |
| Network/route hour heat, stop profile, injectors, corridors | New derives from GTFS-RT trip updates + static GTFS (phase after scorecard) |
| `/data/` listing | Full `$ARCHIVE_ROOT` browse; UI features `curated/` + `derived/` |

## Serving

- Separate Docker image: Astro static build → Caddy.
- Main metlake image unchanged; exclude `frontend/` from its build context.
- Compose sidecar mounts archive read-only at `/data`.
- No cloud SDKs in the capture path; no API server for v1.

## On-device commentary

Inject a **compact JSON stats brief** (aggregates already shown in the UI) into Chrome’s [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) (`LanguageModel`). Graceful sample fallback when unavailable. Rendered as plain prose at the top of scorecard pages.

## Out of scope (v1 product)

- Live MissingLink-style sit-reps as the primary UX
- S3/R2 sync, GHCR publish of frontend image
- Teaching “what is a data lake” in the UI
