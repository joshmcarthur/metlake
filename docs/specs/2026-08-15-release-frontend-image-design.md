# Release both appliance and frontend images (2026-08-15)

A Metlake release currently publishes only the capture appliance to GHCR. Operators who want the UI must build `frontend/` locally. Publish the frontend image on the same release so both can be pulled.

Compose stays a local-build path. This work does not switch it to GHCR images.

## Images

Same Release Please version and tag set for both:

| Role | Context | Image |
| --- | --- | --- |
| Capture appliance | `.` | `ghcr.io/<owner>/metlake` |
| Frontend (Astro → Caddy) | `./frontend` | `ghcr.io/<owner>/metlake/frontend` |

Tags (unchanged patterns, applied to both): `latest`, git tag (`v1.2.3`), dotted version (`1.2.3`), `major.minor` (`1.2`). Platforms: `linux/amd64`, `linux/arm64`.

The nested name `…/metlake/frontend` is a second package under the same GitHub repo. The first successful push creates it. If GHCR leaves it private or unlinked, set visibility and repo connection to match the appliance package — operator step, not workflow code.

## Workflow

[`.github/workflows/release.yml`](../../.github/workflows/release.yml) `publish-image` becomes a two-entry matrix (`appliance` / `frontend`). Shared steps stay shared: checkout at the release tag, QEMU, Buildx, GHCR login, metadata tags, build-push.

- `fail-fast: false` so one failing leg does not cancel a push already in flight. The job still fails if either image does not publish.
- GHA build cache scoped per matrix entry (`scope` from the matrix name) so the two contexts do not overwrite each other.
- Frontend `context` is `./frontend` (its Dockerfile, not the repo root).
- Frontend Dockerfile pins the Node build stage to `$BUILDPLATFORM`. Dist is static; running `astro build` under QEMU for `linux/arm64` panics in the Go WASM compiler. The Caddy runtime stage still targets each platform.

Release Please, changelog, and the appliance Dockerfile are unchanged.

## Docs and Dependabot

README **Releases** documents both pulls:

```bash
docker pull ghcr.io/<owner>/metlake:latest
docker pull ghcr.io/<owner>/metlake/frontend:latest
```

(Version-tag examples follow the same two-image pattern.)

Dependabot Docker ecosystem also watches `frontend/` so `caddy:alpine` / `node:22-alpine` bumps open PRs.

[Frontend design](./2026-08-12-metlake-frontend-design.md) drops “GHCR publish of frontend image” from v1 out of scope.

## Tests

No new smoke fixture: publish only runs on a real release tag. Review the matrix YAML (contexts, image names, cache scopes, `fail-fast`). CI on the PR still runs lint, smoke, and the frontend `npm test` / `npm run build` job — that remains the proof the frontend image’s build context is sound.

## Out of scope

- Pointing `docker-compose.yml` at GHCR (`build:` stays)
- A separate frontend version or changelog
- Changing appliance image name or Dockerfile
- Automating GHCR package visibility after first push
