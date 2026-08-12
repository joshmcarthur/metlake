# Metlake design (2026-08-12)

## Purpose

Preserve Metlink live and published transit feeds as an ordinary filesystem archive that can be queried with DuckDB and mirrored with rsync/rclone/S3/R2/nginx.

## Principles

1. Preservation of original data
2. Reproducibility
3. Simplicity
4. Low operational overhead

## Components

- **`scripts/`** — one linear shell script per job (fetch / project / derive / check / status)
- **`lib/common.sh`** — logging, atomic rename, env helpers, rate spacing
- **`sql/`** — DuckDB projection and derive SQL
- **`crontab` + supercronic** — schedule inside an unprivileged Docker container
- **`$ARCHIVE_ROOT`** — only persistent state

## Layers

| Layer | Path | Rule |
| --- | --- | --- |
| Raw | `raw/` | Exact upstream bytes; immutable |
| Curated | `curated/` | Near-lossless Parquet; regenerable from raw |
| Derived | `derived/` | Interpretations; regenerable; may change methodology |

## Capture

HTTP → temp file → validate → atomic rename into `raw/`. No transforms in fetch scripts.

## Projection

DuckDB `read_*` → SQL → `COPY … TO … FORMAT PARQUET` via temp file + rename.

## Scheduling

Container entrypoint validates env, then runs **tini** as PID 1 with **supercronic** (`-no-reap -passthrough-logs`) reading `/opt/metlake/crontab`. No systemd and no privileged cgroup mounts.

## Secrets

`METLINK_API_KEY` via environment / env-file only. Never under `$ARCHIVE_ROOT` or in the image.
