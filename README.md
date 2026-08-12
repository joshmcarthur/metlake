# Metlake

Metlake preserves historical Wellington (Metlink) transit data that is otherwise only available as a live feed.

**Capture once. Preserve forever. Derive reproducibly. Serve files directly.**

The filesystem is the archive. DuckDB is the transformation/query engine. Everything else is orchestration.

Metlake is an independent open-source project. It is **not** affiliated with Metlink or Greater Wellington Regional Council. Upstream attribution lives in [docs/sources.md](docs/sources.md).

## What it does

- Captures Metlink GTFS, GTFS-RT (trip updates, vehicle positions, service alerts), and bus performance CSV on a schedule
- Stores original responses unchanged under `raw/`
- Projects raw data into Parquet under `curated/` with DuckDB
- Derives a thin route-performance join under `derived/`
- Runs as an **unprivileged** Docker appliance with [supercronic](https://github.com/aptible/supercronic) + a plain `crontab`

## Requirements

- Docker (for the appliance), or locally: `bash`, `curl`, `unzip`, `python3`, [DuckDB CLI](https://duckdb.org/docs/installation/)
- A Metlink Open Data API key from https://opendata.metlink.org.nz/

## Quick start (Docker)

```bash
cp .env.example .env
# set METLINK_API_KEY=... in .env (never commit .env)

mkdir -p ./archive
docker compose up -d --build
docker logs -f metlake
```

Equivalent `docker run`:

```bash
docker build -t metlake .
docker run -d \
  --name metlake \
  --env-file .env \
  -v "$(pwd)/archive:/archive" \
  metlake:latest
```

No privileged mode, cgroup mounts, or `SYS_ADMIN` are required.

## Web UI

The Astro SPA in [`frontend/`](frontend/) is served by a separate Caddy container. It reads the archive over HTTP at `/data/…` (DuckDB-WASM in the browser). Static HTML prototypes in [`frontend/prototypes/`](frontend/prototypes/) remain the design reference until SPA parity is signed off.

With the capture appliance already running (or at least `./archive` populated):

```bash
docker compose up -d --build frontend
open http://localhost:8080
```

Browse files at [http://localhost:8080/data/](http://localhost:8080/data/). The archive mount uses the same host path as the appliance: `${METLAKE_ARCHIVE_HOST_PATH:-./archive}:/data:ro`.

Local development without Docker:

```bash
cd frontend
npm ci
npm run dev
```

View prototypes only: `cd frontend/prototypes && python3 -m http.server 5173`

## Manual scripts (no Docker)

```bash
export ARCHIVE_ROOT=./archive
export METLINK_API_KEY=your-key   # from your environment; do not paste into git

./scripts/check.sh
./scripts/fetch-gtfs-rt.sh
./scripts/fetch-gtfs.sh
./scripts/fetch-performance.sh

HOUR=2026-08-12T09 ./scripts/project-gtfs-rt-hour.sh
DATE=2026-08-12 ./scripts/project-gtfs-rt-day.sh
DATE=2026-08-12 ./scripts/project-gtfs.sh
DATE=2026-08-12 ./scripts/project-performance-day.sh
MONTH=2026-08 ./scripts/derive-route-performance.sh

./scripts/status.sh
```

Each job is its own script under `scripts/`. Shared helpers live in `lib/common.sh`. Schedule definitions are in [`crontab`](crontab).

## Archive layout

```text
$ARCHIVE_ROOT/
  raw/
    gtfs/YYYY/MM/DD/full.zip
    gtfs-rt/{tripupdates,vehiclepositions,servicealerts}/YYYY/MM/DD/HH-MM.json
    performance/YYYY/MM/DD.csv
  curated/
    gtfs/YYYY-MM-DD/*.parquet
    gtfs-rt/{feed}/hourly|daily|monthly/...
    performance/daily|monthly/...
  derived/
    route-performance/YYYY-MM.parquet
  metadata/
    captures.jsonl
```

The archive directory is portable: rsync it, serve it with nginx, or mirror to S3/R2. Metlake never embeds cloud SDKs in the core path.

## Query examples

```sql
-- Daily trip updates
SELECT *
FROM read_parquet('/path/to/archive/curated/gtfs-rt/tripupdates/daily/*/*/*.parquet')
LIMIT 20;

-- Performance + route names
SELECT day, route, route_short_name, reliability, punctuality
FROM read_parquet('/path/to/archive/derived/route-performance/*.parquet')
WHERE route_short_name IS NOT NULL
LIMIT 20;
```

When files are published over HTTPS:

```sql
SELECT *
FROM read_parquet('https://data.example.nz/curated/gtfs-rt/tripupdates/daily/2026/08/12.parquet');
```

## Tests

```bash
./tests/lint.sh
./tests/smoke.sh
```

`lint.sh` runs ShellCheck, `shfmt` diff, shebang/executable checks, CRLF detection, and a light tracked-secrets hygiene check. Live fetch checks need `METLINK_API_KEY` and are optional.

GitHub Actions runs lint, smoke, and a frontend build on every pull request and on `main`.

## Releases

[Release Please](https://github.com/googleapis/release-please) opens release PRs from conventional commits and maintains `CHANGELOG.md`.

When a release lands on `main`, CI builds a multi-arch image and pushes to GitHub Container Registry:

```bash
docker pull ghcr.io/<owner>/metlake:latest
# or a version tag, e.g. ghcr.io/<owner>/metlake:v1.2.3
```

Dependabot opens weekly PRs for GitHub Actions and Docker base-image updates. After lint and smoke pass, patch and minor Dependabot PRs are squash-merged by a follow-on job in the same workflow.

## Documentation

- [Implementation brief](docs/brief.md)
- [Design](docs/specs/2026-08-12-metlake-design.md)
- [Plan](docs/plans/2026-08-12-metlake.md)
- [Upstream sources & attribution](docs/sources.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

Software: [MIT](LICENSE). Upstream Metlink open data is typically CC-BY-4.0 — see [docs/sources.md](docs/sources.md) before redistributing archived feeds.
