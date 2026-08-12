# Contributing to metlake

Thanks for contributing.

## Development

1. Copy `.env.example` to `.env` and set `METLINK_API_KEY` (never commit `.env`).
2. Prefer small, linear shell scripts under `scripts/` and SQL under `sql/`.
3. Share helpers only via `lib/common.sh` — avoid an umbrella CLI.
4. Write outputs atomically (`*.tmp` then rename).
5. Keep the raw archive immutable; regenerate curated/derived from raw when needed.

## Commits

Use focused, semantic commits (e.g. `feat:`, `fix:`, `docs:`, `chore:`, `test:`).

## Tests

```bash
./tests/smoke.sh
```

Live API tests require `METLINK_API_KEY` and are skipped when unset.

## Code of conduct

Please follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
