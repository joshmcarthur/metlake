# Metlink Transit Archive — Implementation Brief

## Objective

Build a small, self-contained service for preserving historical Metlink transit data that is otherwise only available as a live feed.

The system should:

- Capture Metlink GTFS / GTFS-RT data on a schedule.
- Preserve the original responses unchanged.
- Project raw data into Parquet using DuckDB.
- Produce progressively larger/materialised Parquet datasets for convenient querying.
- Keep all persistent state as ordinary files in a configurable archive directory.
- Require no always-on database or application server.
- Be usable locally with nothing more than a filesystem and DuckDB.
- Be easy to mirror to S3, Cloudflare R2, another filesystem, or serve directly through nginx.
- Be packaged as a Docker image for easy installation/deployment.
- Prefer shell commands + DuckDB SQL over lots of custom data-processing scripts.

The guiding principle is:

> **The filesystem is the archive. DuckDB is the transformation/query engine. Everything else is orchestration.**

---

# Architecture

```text
                         Metlink
                            │
                            │ HTTP
                            ▼
                  ┌─────────────────────┐
                  │ capture shell       │
                  │ commands            │
                  └──────────┬──────────┘
                             │
                             ▼
                     archive/raw/
                             │
                   systemd scheduled jobs
                             │
                             ▼
                       DuckDB + SQL
                             │
                             ▼
                   archive/curated/
                             │
                             ▼
                    archive/derived/
```

The archive should be independent of the execution environment.

For example:

```text
/data/metlink/
```

could be:

- a local SSD
- a NAS mount
- an NFS mount
- a directory on a server
- a directory later mirrored to S3
- a directory later mirrored to Cloudflare R2

The application should not know or care.

---

# Docker packaging

The project should be distributed as a Docker image.

The image should contain:

- DuckDB
- the small amount of code required to fetch Metlink data
- shell scripts/commands for capture and projection
- DuckDB SQL files
- systemd unit templates
- installation/configuration tooling
- documentation

Avoid implementing a long-running application daemon.

The container should primarily provide commands such as:

```text
metlink-archive fetch-gtfs
metlink-archive fetch-gtfs-rt
metlink-archive fetch-performance
metlink-archive project-hour
metlink-archive project-day
metlink-archive project-month
```

These commands should be executable independently.

The actual scheduling should preferably be performed by **systemd on the host**, rather than running systemd inside the Docker container.

---

# Configuration

The primary configuration should be:

```text
ARCHIVE_ROOT=/data/metlink
METLINK_API_KEY=...
```

The installation mechanism should accept:

```text
--mountpoint /data/metlink
--api-key <key>
```

or equivalent environment variables.

The API key must never be written into the archive itself.

Prefer storing the API key in a host-side environment file or systemd credentials mechanism rather than embedding it into generated unit files.

For example:

```text
/etc/metlink-archive/env
```

with:

```text
METLINK_API_KEY=...
ARCHIVE_ROOT=/data/metlink
```

Permissions should restrict this file appropriately.

---

# Host systemd integration

The preferred deployment model is:

```text
Host
│
├── systemd
│   ├── metlink-fetch-gtfs-rt.timer
│   ├── metlink-project-hour.timer
│   ├── metlink-project-day.timer
│   ├── metlink-fetch-performance.timer
│   └── metlink-project-month.timer
│
└── Docker
    └── metlink-archive image
```

The systemd services invoke the Docker image with the archive mountpoint and configuration.

Do **not** run systemd inside the Docker container unless there is a compelling reason.

This keeps the container stateless and makes scheduling/retries/logging the host's responsibility.

An installation command could generate/install the units:

```bash
metlink-archive install-systemd \
  --mountpoint /data/metlink
```

The command should:

1. Validate configuration.
2. Create the archive directory if necessary.
3. Install systemd service/timer files.
4. Install the environment/configuration file.
5. Reload systemd.
6. Optionally enable and start the timers.
7. Run an initial connectivity check.

The exact installation mechanism can be refined during implementation.

---

# Capture philosophy

Capture operations should be deliberately dumb.

A capture operation should:

1. Request the upstream resource.
2. Validate that an HTTP response was received.
3. Write the response to a temporary file.
4. Atomically rename the temporary file into the archive.
5. Exit successfully.

It should **not** transform the data.

For example:

```text
HTTP response
    ↓
temporary file
    ↓
atomic rename
    ↓
archive/raw/...
```

If transformation subsequently fails, the raw data remains available.

This is an important archival property.

---

# Raw data layout

Use timestamps in filesystem paths.

Example:

```text
archive/
└── raw/
    ├── gtfs/
    │   └── 2026/
    │       └── 08/
    │           └── 12/
    │               └── gtfs.json
    │
    ├── gtfs-rt/
    │   └── 2026/
    │       └── 08/
    │           └── 12/
    │               ├── 09-00.json
    │               ├── 09-05.json
    │               ├── 09-10.json
    │               └── ...
    │
    └── performance/
        └── 2026/
            └── 08/
                └── 12.csv
```

The exact filename extension should reflect the actual response format.

If GTFS-RT JSON is available and contains the complete information needed, prefer JSON for the first implementation because it can be consumed directly by DuckDB.

If protobuf is the canonical/only complete representation, retain protobuf as raw data and implement the smallest possible conversion layer.

Do not discard the original response.

---

# GTFS-RT capture schedule

Capture GTFS-RT approximately every five minutes.

Target:

```text
12 captures/hour
288 captures/day
105,120 captures/year
```

The capture job should be safe to run slightly late or early.

It should derive its timestamp from the actual capture time rather than assuming the scheduled time is the observation time.

The filename should therefore represent the actual capture timestamp.

---

# GTFS capture

Fetch the GTFS dataset daily, or whenever the Metlink source indicates a new feed/version is available.

Preserve the original response.

For example:

```text
raw/gtfs/2026/08/12/gtfs.json
```

If the upstream feed provides a version identifier, also preserve that identifier in metadata.

Do not overwrite an existing snapshot.

---

# Performance CSV capture

Fetch the daily performance CSV independently.

For example:

```text
raw/performance/2026/08/12.csv
```

The original CSV should remain unchanged.

The capture job should not attempt to merge it with GTFS or GTFS-RT.

---

# Curated data

The curated layer is the first layer where data is transformed.

Use Parquet.

Example:

```text
archive/
└── curated/
    ├── gtfs/
    │   └── 2026-08-12.parquet
    │
    ├── gtfs-rt/
    │   ├── hourly/
    │   │   └── 2026/
    │   │       └── 08/
    │   │           └── 12/
    │   │               ├── 09.parquet
    │   │               └── 10.parquet
    │   │
    │   ├── daily/
    │   │   └── 2026/
    │   │       └── 08/
    │   │           └── 12.parquet
    │   │
    │   └── monthly/
    │       └── 2026/
    │           └── 08.parquet
    │
    └── performance/
        ├── daily/
        │   └── 2026-08-12.parquet
        │
        └── monthly/
            └── 2026-08.parquet
```

The exact partitioning can be adjusted based on actual query patterns.

---

# DuckDB should perform the transformations

Avoid Python/Pandas/Polars data-mangling code unless DuckDB genuinely cannot perform the required operation.

The preferred pattern is:

```text
raw file
    ↓
DuckDB read_*()
    ↓
SQL
    ↓
COPY (...query...) TO ... FORMAT PARQUET
```

For example:

```sql
COPY (
    SELECT *
    FROM read_csv_auto(
        '/data/metlink/raw/performance/2026/08/12.csv'
    )
)
TO '/data/metlink/curated/performance/daily/2026-08-12.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

For JSON:

```sql
COPY (
    SELECT *
    FROM read_json_auto(
        '/data/metlink/raw/gtfs/2026/08/12/gtfs.json'
    )
)
TO '/data/metlink/curated/gtfs/2026-08-12.parquet'
(FORMAT PARQUET, COMPRESSION ZSTD);
```

The actual GTFS JSON structure should be inspected before deciding the exact projection SQL.

---

# Keep SQL in files

Do not embed large SQL strings in shell scripts.

Use:

```text
sql/
├── project_gtfs.sql
├── project_gtfs_rt_hour.sql
├── project_gtfs_rt_day.sql
├── project_gtfs_rt_month.sql
├── project_performance.sql
└── derive_performance.sql
```

The shell command should mostly provide variables/paths and invoke DuckDB.

For example:

```bash
duckdb < sql/project_gtfs_rt_day.sql
```

or use DuckDB's parameter facilities to provide the relevant date.

This allows the same transformations to be run:

- manually
- locally during development
- by systemd
- in CI
- in future batch environments

---

# Hourly GTFS-RT projection

Every hour, project the previous hour's raw GTFS-RT captures into one Parquet file.

Conceptually:

```text
raw/gtfs-rt/2026/08/12/09/*.json
                ↓
             DuckDB
                ↓
curated/gtfs-rt/hourly/2026/08/12/09.parquet
```

The projection should read all captures for that hour.

It should not depend on an incremental database state.

If the command is run twice, the second run should safely replace/recreate the same output.

This makes the operation idempotent.

---

# Daily GTFS-RT projection

Once per day, project the previous day's hourly/raw data into a single daily Parquet file.

Preferred source:

```text
curated/gtfs-rt/hourly/
```

rather than re-reading thousands of raw files, unless there is a reason to regenerate directly from raw.

Example:

```text
288 raw JSON files
       ↓
24 hourly Parquet files
       ↓
1 daily Parquet file
```

The daily file becomes the primary convenient analytical/public dataset.

---

# Monthly GTFS-RT projection

Once per month, project the previous month's daily Parquet files into a monthly Parquet file.

Example:

```text
31 daily Parquet files
        ↓
1 monthly Parquet file
```

This is primarily an optimisation for bulk querying.

The raw and daily data should remain available.

---

# Raw vs curated vs derived

Maintain a strict distinction.

## Raw

Exact upstream responses.

```text
raw/
```

Immutable.

## Curated

Lossless or near-lossless tabular representation suitable for analysis.

```text
curated/
```

Regenerable from raw.

## Derived

Interpretations/inferences.

```text
derived/
```

Examples:

```text
derived/
├── trip-performance/
├── stop-performance/
├── route-performance/
├── cancellations/
└── headway-performance/
```

Derived data can change as analysis improves.

The raw data should never need to change.

---

# Derived analysis

Do not initially attempt sophisticated performance inference during capture.

For example, determining whether a bus was late should be a separate transformation involving:

```text
GTFS
+
GTFS-RT
+
performance data
```

rather than being baked into the raw GTFS-RT projection.

This makes it possible to change the methodology later and regenerate derived datasets from the preserved archive.

---

# Filesystem-first design

All code should assume only that it has a filesystem.

Do not introduce S3/R2-specific APIs into the core application.

For example:

```text
ARCHIVE_ROOT=/data/metlink
```

is the abstraction boundary.

The application should work identically with:

```text
/data/metlink
```

on a local disk.

Later, that directory can be:

- served by nginx
- backed up with rsync
- mirrored with rclone
- uploaded to S3
- uploaded to Cloudflare R2
- placed on a NAS

without modifying the data-processing logic.

---

# Public distribution

Parquet should be considered a first-class public output format.

A user should be able to obtain:

```text
https://example.org/curated/gtfs-rt/daily/2026/08/12.parquet
```

and query it directly with DuckDB:

```sql
SELECT *
FROM read_parquet(
    'https://example.org/curated/gtfs-rt/daily/2026/08/12.parquet'
);
```

The archive should not require an API server for basic access.

An API/web UI can be added later as a convenience layer.

---

# Queryability

The archive should be designed around DuckDB.

Examples should work locally:

```sql
SELECT *
FROM read_parquet(
    '/data/metlink/curated/gtfs-rt/daily/*.parquet'
);
```

and, when publicly served:

```sql
SELECT *
FROM read_parquet(
    'https://data.example.nz/curated/gtfs-rt/daily/*.parquet'
);
```

This makes the Parquet files themselves the durable interface.

---

# Atomic writes

All generated files must be written atomically.

Do not expose a partially written Parquet file.

Use a temporary filename:

```text
2026-08-12.parquet.tmp
```

then atomically rename:

```text
2026-08-12.parquet.tmp
    →
2026-08-12.parquet
```

The same principle applies to raw captures.

---

# Failure handling

A failed fetch must not create a misleading valid-looking file.

A failed projection must not destroy the previous successful projection.

Jobs should:

- exit non-zero on failure
- log useful error information
- leave raw inputs untouched
- write outputs atomically
- be safe to retry

Systemd should handle service logging and restart/retry policy where appropriate.

---

# No database

Do not introduce Postgres, SQLite, Redis, or another persistent database for the initial implementation.

All persistent data should be represented by:

- raw source files
- Parquet files
- optional small metadata/manifest files

DuckDB is the query and transformation engine, not the canonical datastore.

A DuckDB `.duckdb` file may be created later as a convenience/cache, but should not be required for the archive to function.

---

# Metadata and manifests

It may be useful to maintain lightweight metadata such as:

```text
metadata/
├── captures.jsonl
├── projections.jsonl
└── schema-version.json
```

A capture record could include:

```json
{
  "captured_at": "2026-08-12T09:05:12Z",
  "source": "gtfs-rt",
  "path": "raw/gtfs-rt/2026/08/12/09-05.json",
  "size": 18342,
  "sha256": "..."
}
```

This is optional for the first implementation.

Do not create a database just to track this information.

---

# Scheduling

Initial schedules:

| Job | Frequency | Purpose |
|---|---:|---|
| GTFS-RT capture | Every 5 minutes | Preserve live feed |
| GTFS projection | Daily / feed update | Normalise GTFS |
| GTFS-RT hourly projection | Hourly | Compact raw captures |
| Performance CSV capture | Daily | Preserve performance data |
| Performance projection | Daily | CSV → Parquet |
| GTFS-RT daily projection | Daily | Compact hourly data |
| Monthly projection | Monthly | Convenient large-file dataset |
| Derived analysis | Initially daily/monthly | Performance inference |

Exact schedules should be configurable.

---

# CLI design

Prefer one executable with subcommands over many tiny executables.

For example:

```text
metlink-archive fetch gtfs
metlink-archive fetch gtfs-rt
metlink-archive fetch performance

metlink-archive project gtfs
metlink-archive project gtfs-rt-hour
metlink-archive project gtfs-rt-day
metlink-archive project gtfs-rt-month
metlink-archive project performance

metlink-archive derive performance

metlink-archive install-systemd
metlink-archive status
```

Internally these can be implemented primarily as shell commands invoking DuckDB and HTTP tooling.

Avoid a large application framework.

The implementation should favour:

```text
curl/http client
+
shell
+
DuckDB
+
SQL
```

over a large Python application.

A small amount of code is fine where necessary, especially around Metlink authentication, timestamp handling, response validation, or protobuf decoding.

---

# Installation experience

The desired experience should be approximately:

```bash
docker run --rm \
  -v /data/metlink:/archive \
  metlink-archive install \
  --mountpoint /data/metlink \
  --api-key "$METLINK_API_KEY"
```

However, because systemd belongs on the host, the final installation mechanism may instead be:

```bash
metlink-archive install-systemd \
  --mountpoint /data/metlink \
  --api-key "$METLINK_API_KEY"
```

with the Docker image providing the implementation.

The exact UX can be determined during implementation.

The important requirement is that installation should result in a machine that:

1. starts capturing automatically;
2. survives reboot;
3. retries failed jobs;
4. produces Parquet automatically;
5. requires no manual intervention for normal operation.

---

# Design constraints

Prioritise the following, in order:

1. **Preservation of original data**
2. **Reproducibility**
3. **Simplicity**
4. **Low operational overhead**
5. **Low storage/compute cost**
6. **Easy public distribution**
7. **Query performance**

Do not sacrifice the archival properties of the system merely to optimise current query performance.

The raw feed is the irreplaceable asset.

---

# Non-goals

Do not initially build:

- a web dashboard
- a REST API
- a database server
- a streaming/event-processing system
- an Airflow-like workflow engine
- a cloud-specific storage abstraction
- an always-running service
- sophisticated real-time analytics

These can all be added later if the archive proves useful.

---

# Desired end state

A single Linux machine with a mounted directory should be capable of running the entire archive:

```text
/data/metlink/
```

with systemd providing scheduling and Docker providing the software environment.

After installation, the machine should effectively do:

```text
Every 5 minutes:
    fetch → raw/

Every hour:
    raw → hourly Parquet

Every day:
    fetch performance CSV
    raw → daily Parquet

Every day:
    hourly → daily Parquet

Every month:
    daily → monthly Parquet

As required:
    GTFS + GTFS-RT + performance → derived Parquet
```

No database server should be required.

No cloud provider should be required.

The resulting directory should be a self-contained archive that can be copied elsewhere and remain useful.

The same directory should be suitable for:

```text
DuckDB
    +
nginx
    +
rsync
    +
rclone
    +
S3
    +
R2
```

without changing the data itself.

## Core principle

**Capture once. Preserve forever. Derive reproducibly. Serve files directly.**
