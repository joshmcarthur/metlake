# Metlake UI prototypes

**Temporary UX reference** for the Astro SPA. Do not delete until the SPA matches these screens and someone signs off (see [docs/plans/2026-08-12-metlake-frontend.md](../../docs/plans/2026-08-12-metlake-frontend.md)).

Design intent: [docs/specs/2026-08-12-metlake-frontend-design.md](../../docs/specs/2026-08-12-metlake-frontend-design.md).

## View

```bash
cd frontend/prototypes
python3 -m http.server 5173
```

Open [http://localhost:5173](http://localhost:5173).

| Page | File | Maps to Astro |
| --- | --- | --- |
| Overview | `index.html` | `/` — scorecard + network charts |
| Route scorecard | `route.html` | `/routes/[route]` |
| Route deep | `route-deep.html` | `/routes/[route]/deep` |
| Query | `query.html` | `/query` |

`network-deep.html` redirects to Overview (merged). Supporting JS/CSS: `prototype.js`, `network-deep.js`, `deep-dive.js`, `commentary.js`, `styles.css`, `network-deep.css`.

## Design direction

- Utility / open data; Wellington-adjacent colours (not Metlink brand hexes)
- Copy leads with *what* users get; light MissingLink note on Overview only
- Overview = network scorecard + high-value city-wide charts
- Route deep = where delay forms on one service
- Optional on-device commentary via Chrome Prompt API (`commentary.js`)
