# Route picker dialog (2026-08-13)

Supersedes [`2026-08-12-route-picker-design.md`](./2026-08-12-route-picker-design.md) (inline typeahead).

## Goal

Replace the header typeahead with a **native `<dialog>`** so choosing a route is obvious and has room for mode, code, and name.

## Header

Nav stays **Overview** · **route control** · **Query** · **/data/**.

The typeahead input is replaced by one button that opens a shared `<dialog>` in the site layout.

| Page | Button |
| --- | --- |
| Overview, Query, route pages | Labelled **Select a route**, styled with the other nav items. On route pages it is the current nav item (filled), but still shows the same label — the route code and name stay in the page hero |

The header never shows a selected route on Overview or Query, even if the user visited a route earlier in the session.

## Dialog

Native `<dialog>` opened with `showModal()` (modal + backdrop). Title **Select a route**. Dismiss with the close control, Escape, or backdrop click.

- Search field at the top; focused when the dialog opens. Filters by route id, short name, or long name (case-insensitive substring). Groups with no matches are hidden.
- Scrollable catalogue below, grouped by GTFS mode in this order: Bus, Train, Ferry, Cable car, Other. Only groups that have at least one matching route are shown.
- Each row is a button: short mode label, route code (e.g. `83`), long name (e.g. `Wellington – Eastbourne`). On a route page, the current route is marked selected.
- Choosing a row navigates to `/routes/{id}/`, where `{id}` is `route_short_name` if present, otherwise `route` (same as today). No result cap — show the full filtered list.

## Mode groups

`route_type` is already on `derived/route-performance` parquet (GTFS join). The catalogue query returns it.

| `route_type` | Group |
| --- | --- |
| 3 | Bus |
| 2 | Train |
| 4 | Ferry |
| 5 | Cable car |
| null, missing, or anything else | Other |

**Other** appears only when at least one such row is present.

## Data and errors

Catalogue still comes from DuckDB-WASM over the latest published `route-performance` month (same spine as the current picker).

- Dialog may open before the catalogue is ready: show a short loading state, then the grouped list. Search works once rows are in.
- Manifest/archive failure: header button disabled, labelled **Routes unavailable**; dialog does not open.
- Filter with no hits: **No matching routes**.

Existing `/routes/__any__/` Caddy fallback continues to serve unknown static paths.

## Cleanup in this change

Last-route `sessionStorage` existed only to wire deep-dive CTAs. Remove:

- Overview and scorecard **Open deep dive** buttons / `data-deep-link`
- `wireDeepDiveLinks`
- `frontend/src/lib/route-memory.ts`

Do not remove `/routes/{id}/deep/` in this change.

## Out of scope

- Merging scorecard and deep dive into one page (follow-up)
- Server-side route index
- Redesigning scorecard or deep page content beyond removing the deep-dive CTA
- New test runner; verify with `astro check` and `astro build`
