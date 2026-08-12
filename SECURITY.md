# Security Policy

## Reporting a vulnerability

Please report security issues privately to the repository maintainers (GitHub Security Advisories preferred when available). Do not open a public issue that includes secrets or exploit details.

## Secrets

- Never commit API keys, `.env` files, or credentials.
- Never write `METLINK_API_KEY` into `$ARCHIVE_ROOT`.
- Inject secrets at runtime with `--env-file` or `-e`.
- Rotate any key that may have been exposed in chat, logs, or git history.

## Scope

Metlake is an archival client for public transit open data. Treat the archive directory as public-facing data once published; keep credentials out of it.
