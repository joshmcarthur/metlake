# Metlake

Metlake preserves historical Wellington (Metlink) transit data that is otherwise only available as a live feed.

**Capture once. Preserve forever. Derive reproducibly. Serve files directly.**

The filesystem is the archive. DuckDB is the transformation/query engine. Everything else is orchestration.

## What it does

- Captures Metlink GTFS, GTFS-RT, and bus performance CSV on a schedule
- Stores original responses unchanged under `raw/`
- Projects raw data into Parquet under `curated/` with DuckDB
- Optionally derives thin analytical joins under `derived/`
- Runs as an unprivileged Docker appliance with [supercronic](https://github.com/aptible/supercronic)

Metlake is an independent open-source project. It is not affiliated with Metlink or Greater Wellington Regional Council. Upstream data is attributed in [docs/sources.md](docs/sources.md).

## Quick start

```bash
cp .env.example .env
# edit .env and set METLINK_API_KEY

mkdir -p ./archive
docker compose up -d --build
```

Or without Compose:

```bash
docker build -t metlake .
docker run -d \
  --name metlake \
  --env-file .env \
  -v "$(pwd)/archive:/archive" \
  metlake:latest
```

Manual one-shot (no Docker):

```bash
export ARCHIVE_ROOT=./archive
export METLINK_API_KEY=your-key
./scripts/fetch-gtfs-rt.sh
./scripts/check.sh
./scripts/status.sh
```

## Archive layout

```text
$ARCHIVE_ROOT/
  raw/
  curated/
  derived/
  metadata/
```

See [docs/specs/2026-08-12-metlake-design.md](docs/specs/2026-08-12-metlake-design.md) for the full layout.

## Query examples

```sql
SELECT *
FROM read_parquet('/path/to/archive/curated/gtfs-rt/tripupdates/daily/*.parquet')
LIMIT 10;
```

## Documentation

- [Implementation brief](docs/brief.md)
- [Design](docs/specs/2026-08-12-metlake-design.md)
- [Plan](docs/plans/2026-08-12-metlake.md)
- [Upstream sources & attribution](docs/sources.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

Software: [MIT](LICENSE). Upstream Metlink open data is typically CC-BY-4.0 — see [docs/sources.md](docs/sources.md).
