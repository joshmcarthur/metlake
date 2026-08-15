# syntax=docker/dockerfile:1

# Astro's compiler is Go WASM. `astro build` under QEMU (buildx linux/arm64 on
# an amd64 runner) panics: invalid memory address or nil pointer dereference.
# Dist is architecture-independent, so compile on the builder's native platform
# and copy into the target Caddy image.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
