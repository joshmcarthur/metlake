# Inline route picker (2026-08-12)

Superseded by [`2026-08-13-route-picker-dialog-design.md`](./2026-08-13-route-picker-dialog-design.md).

## Goal

Replace fixed “Route 83” / “Route deep” primary-nav links with an **inline typeahead** so any archive route can be opened.

## Behaviour

- Nav: **Overview** · **Route** typeahead · **Query** · **/data/**
- No separate **Route deep** nav item; deep dive remains a scorecard action only
- Typeahead filters by route id or long name; choosing a route navigates to `/routes/{id}/`
- Route list comes from DuckDB over published `route-performance` months (prefer latest month for catalog speed, fall back to intersecting available months)
- Current route page pre-fills the input; other pages show “Select a route…” and remember the last choice in `sessionStorage`
- Existing `/routes/__any__/` Caddy fallback continues to serve unknown static paths

## Out of scope

- Redesigning scorecard/deep pages beyond nav + deep CTA wiring
- Server-side route index generation
