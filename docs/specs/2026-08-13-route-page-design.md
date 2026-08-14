# Combined route page (2026-08-13)

Supersedes the separate route-deep screen in [`2026-08-12-metlake-frontend-design.md`](./2026-08-12-metlake-frontend-design.md). Completes the follow-up left in [`2026-08-13-route-picker-dialog-design.md`](./2026-08-13-route-picker-dialog-design.md).

## Goal

One route URL. Published scorecard and delay anatomy share `/routes/{id}/`. Delete `/routes/{id}/deep/` with no redirect.

## Page

Order on `/routes/{id}/`:

1. Hero — route id, name, metric chips (punctuality / reliability / cancellations / peak)
2. Period controls with compare
3. Summary tiles
4. Daily series
5. Delay anatomy
   - Section head: **Delay along the route** plus inbound/outbound chips (chips re-render delay charts only)
   - Stop profile chart
   - Two-column: injectors + hour heatmap
   - Recovery vs fade tiles
6. Export — Query, CSV, Parquet

Drop: “Open deep dive”, “Back to scorecard”, disabled stop-profile CSV, and the two deep-page callout bullets. Chart empty states already explain missing RT derives.

Attribution stays `route`. Remove unused `ATTRIBUTION.deep`.

## Behaviour

One DuckDB session in `route-app.ts`. Period changes refresh scorecard, series, commentary, and delay charts together.

| Control | Affects |
| --- | --- |
| Period / compare | Scorecard, series, commentary, delay charts |
| Metric chips | Daily series only |
| Direction chips | Delay charts + commentary `direction` field |

Empty archive or no rows for this route: existing scorecard empty state hides the whole page, including delay sections. When the scorecard has data, delay charts keep their “needs trip-update derives” empty state.

## Modules

Delete `frontend/src/pages/routes/[route]/deep.astro` and the entire `frontend/src/scripts/route-deep/` tree.

Move survivors into the route namespace:

```
frontend/src/scripts/route/
  route-app.ts          — owns session, period, commentary, chart refresh
  direction.ts
  charts/profile.ts
  charts/injectors.ts
  charts/heatmap.ts
  charts/empty-state.ts
```

No `route-deep` path, id (`route-deep-root`), or app entry.

## URLs and serving

- Caddy: drop `@routeDeep`. Unknown `/routes/{id}/` still falls back to `/routes/__any__/`.
- `parseRouteFromPathname` matches `/routes/{id}/` only.
- Overview choke-point **Open deep dive** (if still present) is removed, not retargeted. The header route picker is how you open a route.
- Strip remaining `/deep/` hrefs and `wireDeepDiveLinks` if that helper is still around.

## Docs

Update the frontend design page map: `/routes/[route]/` is scorecard + delay anatomy; no deep row. README should not mention a separate deep dive.

## Out of scope

- Wiring delay charts to real GTFS-RT derives (empty states stay)
- New test runner; verify with `astro check` and `astro build`
- Changing Overview network charts
