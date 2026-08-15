import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { PMTiles, Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

// Astro/Vite inlines maplibre into the page chunk; without an explicit worker URL
// the default ./maplibre-gl-worker.mjs sibling resolve fails and vector tiles never paint.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
} from "../../lib/manifest";
import { delayBand, positionAtPlayhead } from "../../lib/replay-motion";
import {
  mergeCaptureTimes,
  ReplayHourCache,
  routeLabel,
  shapeForTrip,
  vehiclesAt,
  type HourBundle,
  type ReplayVehicle,
} from "../../lib/replay-hours";
import {
  buildPeriodTicks,
  parseReplaySearch,
  serializeReplaySearch,
  utcHourKey,
} from "../../lib/replay-url";
import {
  boundsFromManifest,
  rangeForPeriod,
  todayNz,
  unionManifestMonths,
} from "../overview/period";

const PMTILES_URL = "/data/tiles/wellington-region.pmtiles";
/** west, south, east, north — Metlink / Wellington region extract */
const WELLINGTON_BOUNDS: [[number, number], [number, number]] = [
  [174.415458, -41.622667],
  [175.883728, -40.705113],
];
const CAPTURE_STEP_MS = 5 * 60 * 1000;
const URL_THROTTLE_MS = 500;
const PREFETCH_NEAR_MS = 10 * 60 * 1000;

const CLOCK_FMT = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

type Speed = 1 | 4 | 16;

interface PlayState {
  from: string;
  to: string;
  playheadMs: number;
  playing: boolean;
  speed: Speed;
  ticks: number[];
}

let cache: ReplayHourCache | null = null;
let map: maplibregl.Map | null = null;
let state: PlayState | null = null;
let rafId = 0;
let lastFrameTs = 0;
let lastUrlWrite = 0;
let bundles: Array<HourBundle | null> = [];
let loadedHourKey: string | null = null;
let hourLoadToken = 0;

function $(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}

function setStatus(message: string): void {
  const el = $("[data-replay-status]");
  if (el) el.textContent = message;
}

function formatDelay(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "unknown";
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const body = m > 0 ? `${m}m ${s}s` : `${s}s`;
  if (seconds > 0) return `${body} late`;
  if (seconds < 0) return `${body} early`;
  return "on time";
}

function instantIsoFromMs(ms: number): string {
  // Prefer NZ offset for shareable URLs
  const date = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const offsetRaw = get("timeZoneName");
  const match = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(offsetRaw);
  const hours = match ? Number(match[1]) : 12;
  const mins = match?.[2] ? Number(match[2]) : 0;
  const sign = hours < 0 ? "-" : "+";
  const absH = String(Math.abs(hours)).padStart(2, "0");
  const absM = String(Math.abs(mins)).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${sign}${absH}:${absM}`;
}

function writeUrl(force = false): void {
  if (!state) return;
  const now = performance.now();
  if (!force && now - lastUrlWrite < URL_THROTTLE_MS) return;
  lastUrlWrite = now;
  const qs = serializeReplaySearch({
    from: state.from,
    to: state.to,
    t: instantIsoFromMs(state.playheadMs),
  });
  const next = `${window.location.pathname}?${qs}`;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    history.replaceState(null, "", next);
  }
}

function updateClock(): void {
  const el = $("[data-replay-clock]");
  if (!el || !state) return;
  el.textContent = CLOCK_FMT.format(state.playheadMs);
}

function updateScrubber(): void {
  const input = document.querySelector<HTMLInputElement>("[data-replay-scrub]");
  if (!input || !state || state.ticks.length === 0) return;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < state.ticks.length; i++) {
    const dist = Math.abs(state.ticks[i] - state.playheadMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  input.max = String(state.ticks.length - 1);
  input.value = String(best);
}

function bandColor(band: ReturnType<typeof delayBand>): string {
  switch (band) {
    case "live":
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--live")
        .trim() || "#3f7a2e";
    case "warn":
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--warn")
        .trim() || "#b86a00";
    case "bad":
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--bad")
        .trim() || "#a33b32";
    case "unknown":
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--ink-muted")
        .trim() || "#5c6b75";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

function surroundingCaptures(
  times: number[],
  playheadSec: number,
): { prev: number | null; next: number | null; frac: number } {
  if (times.length === 0) return { prev: null, next: null, frac: 0 };
  if (playheadSec <= times[0]) return { prev: times[0], next: times[0], frac: 0 };
  const last = times[times.length - 1];
  if (playheadSec >= last) return { prev: last, next: last, frac: 0 };
  for (let i = 0; i < times.length - 1; i++) {
    const a = times[i];
    const b = times[i + 1];
    if (playheadSec >= a && playheadSec <= b) {
      const span = b - a || 1;
      return { prev: a, next: b, frac: (playheadSec - a) / span };
    }
  }
  return { prev: last, next: last, frac: 0 };
}

function indexVehicles(list: ReplayVehicle[]): Map<string, ReplayVehicle> {
  const map = new Map<string, ReplayVehicle>();
  for (const v of list) {
    map.set(v.tripId, v);
  }
  return map;
}

function paintVehicles(): void {
  if (!map || !state) return;
  const source = map.getSource("vehicles") as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const playheadSec = state.playheadMs / 1000;
  const times = mergeCaptureTimes(...bundles);
  const { prev, next, frac } = surroundingCaptures(times, playheadSec);

  const features: GeoJSON.Feature[] = [];
  if (prev != null && next != null) {
    const prevMap = indexVehicles(vehiclesAt(bundles, prev));
    const nextMap = indexVehicles(vehiclesAt(bundles, next));
    const tripIds = new Set([...prevMap.keys(), ...nextMap.keys()]);

    for (const tripId of tripIds) {
      const a = prevMap.get(tripId) ?? nextMap.get(tripId);
      const b = nextMap.get(tripId) ?? prevMap.get(tripId);
      if (!a || !b) continue;
      const shape = shapeForTrip(bundles, tripId);
      const pos = positionAtPlayhead(
        {
          lat: a.lat,
          lon: a.lon,
          delaySeconds: a.delaySeconds,
        },
        {
          lat: b.lat,
          lon: b.lon,
          delaySeconds: b.delaySeconds,
        },
        frac,
        shape,
        150,
      );
      const band = delayBand(pos.delaySeconds);
      features.push({
        type: "Feature",
        properties: {
          tripId,
          routeId: a.routeId || b.routeId,
          vehicleId: a.vehicleId ?? b.vehicleId,
          delaySeconds: pos.delaySeconds,
          band,
          color: bandColor(band),
        },
        geometry: {
          type: "Point",
          coordinates: [pos.lon, pos.lat],
        },
      });
    }
  }

  source.setData({ type: "FeatureCollection", features });
  setStatus(
    features.length === 0
      ? "No vehicle captures for this moment."
      : `${features.length} vehicles · archive captures ~every 5 minutes`,
  );
}

function showCard(props: {
  tripId: string;
  routeId: string;
  vehicleId: string | null;
  delaySeconds: number | null;
}): void {
  const card = $("[data-replay-card]");
  if (!card) return;
  card.removeAttribute("hidden");
  const routeEl = $("[data-card-route]");
  const tripEl = $("[data-card-trip]");
  const delayEl = $("[data-card-delay]");
  const vehicleEl = $("[data-card-vehicle]");
  const link = document.querySelector<HTMLAnchorElement>("[data-card-route-link]");
  const label = routeLabel(bundles, props.routeId);
  if (routeEl) routeEl.textContent = label;
  if (tripEl) tripEl.textContent = props.tripId;
  if (delayEl) delayEl.textContent = formatDelay(props.delaySeconds);
  if (vehicleEl) vehicleEl.textContent = props.vehicleId ?? "—";
  if (link) {
    const code = label && label !== "—" ? label : props.routeId;
    link.href = `/routes/${encodeURIComponent(code)}/`;
    link.textContent = `Open route ${code}`;
  }
}

function hideCard(): void {
  $("[data-replay-card]")?.setAttribute("hidden", "");
}

async function ensureHoursForPlayhead(): Promise<void> {
  if (!cache || !state) return;
  const iso = instantIsoFromMs(state.playheadMs);
  const hourKey = utcHourKey(iso);
  if (hourKey === loadedHourKey && bundles.some(Boolean)) {
    // Still prefetch near boundary while playing
    if (state.playing) {
      const hourEnd = Date.parse(`${hourKey}:00:00Z`) + 60 * 60 * 1000;
      if (hourEnd - state.playheadMs < PREFETCH_NEAR_MS) {
        const following = utcHourKey(new Date(hourEnd + 1000).toISOString());
        void cache.loadHour(following);
      }
    }
    return;
  }

  const token = ++hourLoadToken;
  const { current, next } = await cache.ensureAround(iso);
  if (token !== hourLoadToken) return;
  bundles = [current, next];
  loadedHourKey = hourKey;

  if (state.playing) {
    const hourEnd = Date.parse(`${hourKey}:00:00Z`) + 60 * 60 * 1000;
    if (hourEnd - state.playheadMs < PREFETCH_NEAR_MS) {
      const following = utcHourKey(new Date(hourEnd + 1000).toISOString());
      void cache.loadHour(following);
    }
  }
}

function paintFrame(): void {
  paintVehicles();
  updateClock();
  updateScrubber();
  writeUrl();
}

async function refreshForPlayhead(): Promise<void> {
  await ensureHoursForPlayhead();
  paintFrame();
}

function setPlaying(playing: boolean): void {
  if (!state) return;
  state.playing = playing;
  const btn = document.querySelector<HTMLButtonElement>("[data-replay-play]");
  if (btn) {
    btn.textContent = playing ? "Pause" : "Play";
    btn.setAttribute("aria-pressed", String(playing));
  }
  if (playing) {
    lastFrameTs = performance.now();
    rafId = requestAnimationFrame(tick);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    writeUrl(true);
  }
}

function tick(now: number): void {
  if (!state?.playing) return;
  const dt = Math.min(0.1, (now - lastFrameTs) / 1000);
  lastFrameTs = now;
  // 1× = one capture (5 min archive) per wall-clock second
  const archiveMsPerSec = CAPTURE_STEP_MS * state.speed;
  state.playheadMs += archiveMsPerSec * dt;

  const lastTick = state.ticks[state.ticks.length - 1];
  if (state.playheadMs >= lastTick) {
    state.playheadMs = lastTick;
    setPlaying(false);
  }

  const iso = instantIsoFromMs(state.playheadMs);
  const hourKey = utcHourKey(iso);
  if (hourKey !== loadedHourKey) {
    void ensureHoursForPlayhead().then(() => {
      paintFrame();
      if (state?.playing) rafId = requestAnimationFrame(tick);
    });
    return;
  }

  paintFrame();
  rafId = requestAnimationFrame(tick);
}

async function initMap(container: HTMLElement): Promise<maplibregl.Map> {
  const protocol = new Protocol({ metadata: true });
  // MapLibre 6 may invoke custom protocols from workers; register on the
  // module namespace used to construct Map (same bundle instance).
  maplibregl.addProtocol("pmtiles", protocol.tile);

  // Absolute URL — required by MapLibre's PMTiles example (pmtiles://https://…).
  const archiveUrl = new URL(PMTILES_URL, window.location.origin).href;

  let hasTiles = false;
  let header: {
    minZoom: number;
    maxZoom: number;
    centerLon: number;
    centerLat: number;
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null = null;
  try {
    const archive = new PMTiles(archiveUrl);
    protocol.add(archive);
    header = await archive.getHeader();
    hasTiles = true;
  } catch {
    hasTiles = false;
  }

  const center: [number, number] = header
    ? [header.centerLon, header.centerLat]
    : [
        (WELLINGTON_BOUNDS[0][0] + WELLINGTON_BOUNDS[1][0]) / 2,
        (WELLINGTON_BOUNDS[0][1] + WELLINGTON_BOUNDS[1][1]) / 2,
      ];

  // Prefer explicit tiles[] over TileJSON `url` so MapLibre requests
  // pmtiles://…/{z}/{x}/{y} directly (avoids a silent TileJSON stall).
  const style: maplibregl.StyleSpecification = hasTiles && header
    ? {
        version: 8,
        sources: {
          basemap: {
            type: "vector",
            tiles: [`pmtiles://${archiveUrl}/{z}/{x}/{y}`],
            minzoom: header.minZoom,
            maxzoom: header.maxZoom,
            bounds: [
              header.minLon,
              header.minLat,
              header.maxLon,
              header.maxLat,
            ],
            attribution:
              '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#cfd8d4" },
          },
          {
            id: "earth",
            type: "fill",
            source: "basemap",
            "source-layer": "earth",
            paint: { "fill-color": "#d5ddd8" },
          },
          {
            id: "landcover",
            type: "fill",
            source: "basemap",
            "source-layer": "landcover",
            paint: { "fill-color": "#b9c9b4", "fill-opacity": 0.55 },
          },
          {
            id: "landuse",
            type: "fill",
            source: "basemap",
            "source-layer": "landuse",
            paint: { "fill-color": "#c5cfc8", "fill-opacity": 0.35 },
          },
          {
            id: "water",
            type: "fill",
            source: "basemap",
            "source-layer": "water",
            paint: { "fill-color": "#3d7ea6" },
          },
          {
            id: "roads",
            type: "line",
            source: "basemap",
            "source-layer": "roads",
            paint: {
              "line-color": "#3a4a54",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.6,
                14,
                2.8,
              ],
            },
          },
          {
            id: "boundaries",
            type: "line",
            source: "basemap",
            "source-layer": "boundaries",
            paint: {
              "line-color": "#8a96a0",
              "line-width": 0.8,
            },
          },
        ],
      }
    : {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e8eeea" },
          },
        ],
      };

  const m = new maplibregl.Map({
    container,
    style,
    center,
    zoom: 9,
    maxBounds: [
      [WELLINGTON_BOUNDS[0][0] - 0.35, WELLINGTON_BOUNDS[0][1] - 0.35],
      [WELLINGTON_BOUNDS[1][0] + 0.35, WELLINGTON_BOUNDS[1][1] + 0.35],
    ],
    minZoom: 8,
    attributionControl: { compact: true },
  });

  await new Promise<void>((resolve) => {
    m.once("load", () => resolve());
    window.setTimeout(() => resolve(), 4000);
  });

  m.fitBounds(WELLINGTON_BOUNDS, { padding: 24, duration: 0 });
  m.resize();

  m.on("error", (event) => {
    const message =
      event.error instanceof Error
        ? event.error.message
        : "Map failed to load a tile or style layer.";
    setStatus(`Map issue: ${message}`);
  });

  m.addSource("vehicles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  m.addLayer({
    id: "vehicles-circle",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": 5,
      "circle-color": ["get", "color"],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.45)",
    },
  });

  m.on("click", "vehicles-circle", (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
    const f = e.features?.[0];
    if (!f?.properties) return;
    showCard({
      tripId: String(f.properties.tripId),
      routeId: String(f.properties.routeId ?? ""),
      vehicleId: f.properties.vehicleId
        ? String(f.properties.vehicleId)
        : null,
      delaySeconds:
        f.properties.delaySeconds == null
          ? null
          : Number(f.properties.delaySeconds),
    });
  });
  m.on("mouseenter", "vehicles-circle", () => {
    m.getCanvas().style.cursor = "pointer";
  });
  m.on("mouseleave", "vehicles-circle", () => {
    m.getCanvas().style.cursor = "";
  });

  if (!hasTiles) {
    setStatus(
      "Basemap tiles missing — showing vehicles on a plain field. Add /data/tiles/wellington-region.pmtiles",
    );
  }

  return m;
}

function bindControls(): void {
  document.querySelector("[data-replay-play]")?.addEventListener("click", () => {
    if (!state) return;
    setPlaying(!state.playing);
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-replay-speed]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state) return;
        const speed = Number(btn.dataset.replaySpeed) as Speed;
        state.speed = speed;
        document
          .querySelectorAll<HTMLButtonElement>("[data-replay-speed]")
          .forEach((b) => {
            b.setAttribute(
              "aria-pressed",
              String(Number(b.dataset.replaySpeed) === speed),
            );
          });
      });
    });

  const scrub = document.querySelector<HTMLInputElement>("[data-replay-scrub]");
  scrub?.addEventListener("input", () => {
    if (!state || !scrub) return;
    setPlaying(false);
    const idx = Number(scrub.value);
    const tick = state.ticks[idx];
    if (tick != null) {
      state.playheadMs = tick;
      void refreshForPlayhead();
      writeUrl(true);
    }
  });

  document
    .querySelector("[data-replay-card-close]")
    ?.addEventListener("click", () => hideCard());
}

async function resolveDefaultPeriod(): Promise<{ from: string; to: string }> {
  try {
    const official = await fetchRoutePerformanceManifest();
    const rt = await fetchRtRoutePerformanceManifest();
    const months = unionManifestMonths(official?.months, rt?.months);
    if (months.length > 0) {
      const bounds = boundsFromManifest(months);
      return rangeForPeriod("month", bounds);
    }
  } catch {
    // fall through
  }
  const asOf = todayNz();
  return { from: `${asOf.slice(0, 7)}-01`, to: asOf };
}

export async function initReplayApp(): Promise<void> {
  const root = document.getElementById("replay-root");
  const mapEl = document.getElementById("replay-map");
  if (!root || !mapEl) return;

  const parsed = parseReplaySearch(window.location.search);
  const defaults = await resolveDefaultPeriod();
  const from = parsed.from ?? defaults.from;
  const to = parsed.to ?? (parsed.from && parsed.from > defaults.to ? parsed.from : defaults.to);
  const rangeTo = to < from ? from : to;
  const ticks = buildPeriodTicks(from, rangeTo);
  let playheadMs = parsed.t ? Date.parse(parsed.t) : ticks[0] ?? Date.now();
  if (!Number.isFinite(playheadMs)) playheadMs = ticks[0] ?? Date.now();
  if (ticks.length > 0) {
    if (playheadMs < ticks[0]) playheadMs = ticks[0];
    if (playheadMs > ticks[ticks.length - 1]) playheadMs = ticks[ticks.length - 1];
  }

  state = {
    from,
    to: rangeTo,
    playheadMs,
    playing: false,
    speed: 1,
    ticks,
  };

  cache = new ReplayHourCache();
  window.addEventListener("pagehide", () => {
    void cache?.close();
    if (rafId) cancelAnimationFrame(rafId);
  });

  bindControls();
  writeUrl(true);
  updateClock();
  updateScrubber();

  try {
    map = await initMap(mapEl);
  } catch (error) {
    setStatus(
      error instanceof Error
        ? `Map failed to start: ${error.message}`
        : "Map failed to start.",
    );
    return;
  }

  setStatus("Loading vehicle positions…");
  await refreshForPlayhead();
}

initReplayApp();
