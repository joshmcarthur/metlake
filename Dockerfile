# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

ARG DUCKDB_VERSION=1.5.5
ARG SUPERCRONIC_VERSION=0.2.34
ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    python3 \
    tini \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# DuckDB CLI
RUN set -eux; \
  arch="${TARGETARCH:-amd64}"; \
  case "${arch}" in \
    amd64|arm64) duck_arch="${arch}" ;; \
    *) echo "unsupported arch: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL \
    "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb_cli-linux-${duck_arch}.zip" \
    -o /tmp/duckdb.zip; \
  unzip -q /tmp/duckdb.zip -d /usr/local/bin; \
  chmod +x /usr/local/bin/duckdb; \
  rm -f /tmp/duckdb.zip; \
  duckdb --version

# supercronic
RUN set -eux; \
  arch="${TARGETARCH:-amd64}"; \
  case "${arch}" in \
    amd64) sc_arch=amd64 ;; \
    arm64) sc_arch=arm64 ;; \
    *) echo "unsupported arch: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${sc_arch}" \
    -o /usr/local/bin/supercronic; \
  chmod +x /usr/local/bin/supercronic; \
  supercronic -version

WORKDIR /opt/metlake

COPY lib /opt/metlake/lib
COPY sql /opt/metlake/sql
COPY scripts /opt/metlake/scripts
COPY crontab /opt/metlake/crontab

RUN chmod +x /opt/metlake/scripts/*.sh \
  && mkdir -p /archive

ENV ARCHIVE_ROOT=/archive \
    METLAKE_ROOT=/opt/metlake \
    SQL_DIR=/opt/metlake/sql \
    PATH="/usr/local/bin:/opt/metlake/scripts:${PATH}"

VOLUME ["/archive"]

ENTRYPOINT ["/opt/metlake/scripts/docker-entrypoint.sh"]
