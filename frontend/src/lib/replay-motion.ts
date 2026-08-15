export type DelayBand = "live" | "warn" | "bad" | "unknown";

export interface ShapePoint {
  lat: number;
  lon: number;
  dist: number;
}

export interface ProjectedPoint {
  dist: number;
  lat: number;
  lon: number;
  offsetMeters: number;
}

export interface VehiclePing {
  lat: number;
  lon: number;
  delaySeconds: number | null;
}

export interface PlayheadPosition {
  lat: number;
  lon: number;
  delaySeconds: number | null;
  source: "shape" | "gps";
}

const EARTH_RADIUS_M = 6_371_000;

/** Delay colour band: ≤150 live, ≤300 warn, else bad. */
export function delayBand(seconds: number | null | undefined): DelayBand {
  if (seconds == null || !Number.isFinite(seconds)) return "unknown";
  if (seconds <= 150) return "live";
  if (seconds <= 300) return "warn";
  return "bad";
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function ensureDistances(points: readonly ShapePoint[]): ShapePoint[] {
  if (points.length === 0) return [];
  let running = 0;
  return points.map((p, i) => {
    if (i === 0) {
      return { ...p, dist: Number.isFinite(p.dist) ? p.dist : 0 };
    }
    const prev = points[i - 1];
    if (Number.isFinite(p.dist) && Number.isFinite(prev.dist) && p.dist >= prev.dist) {
      running = p.dist;
      return { ...p, dist: p.dist };
    }
    running += haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
    return { ...p, dist: running };
  });
}

function pointOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { x: number; y: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { x: ax, y: ay, t: 0 };
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / len2);
  return { x: ax + abx * t, y: ay + aby * t, t };
}

/** Project a GPS ping onto the closest point of a shape polyline. */
export function projectOntoShape(
  lat: number,
  lon: number,
  points: readonly ShapePoint[],
): ProjectedPoint | null {
  const shape = ensureDistances(points);
  if (shape.length === 0) return null;
  if (shape.length === 1) {
    return {
      dist: shape[0].dist,
      lat: shape[0].lat,
      lon: shape[0].lon,
      offsetMeters: haversineMeters(lat, lon, shape[0].lat, shape[0].lon),
    };
  }

  let best: ProjectedPoint | null = null;
  for (let i = 0; i < shape.length - 1; i++) {
    const a = shape[i];
    const b = shape[i + 1];
    const proj = pointOnSegment(a.lon, a.lat, b.lon, b.lat, lon, lat);
    const plat = proj.y;
    const plon = proj.x;
    const offset = haversineMeters(lat, lon, plat, plon);
    const dist = a.dist + (b.dist - a.dist) * proj.t;
    if (!best || offset < best.offsetMeters) {
      best = { dist, lat: plat, lon: plon, offsetMeters: offset };
    }
  }
  return best;
}

/** Interpolate a point along the shape between two distances. */
export function lerpAlongShape(
  points: readonly ShapePoint[],
  distA: number,
  distB: number,
  frac: number,
): { lat: number; lon: number; dist: number } | null {
  const shape = ensureDistances(points);
  if (shape.length === 0) return null;
  const t = clamp01(frac);
  const target = distA + (distB - distA) * t;
  return pointAtDistance(shape, target);
}

function pointAtDistance(
  shape: readonly ShapePoint[],
  target: number,
): { lat: number; lon: number; dist: number } {
  if (shape.length === 1) {
    return { lat: shape[0].lat, lon: shape[0].lon, dist: shape[0].dist };
  }
  if (target <= shape[0].dist) {
    return { lat: shape[0].lat, lon: shape[0].lon, dist: shape[0].dist };
  }
  const last = shape[shape.length - 1];
  if (target >= last.dist) {
    return { lat: last.lat, lon: last.lon, dist: last.dist };
  }
  for (let i = 0; i < shape.length - 1; i++) {
    const a = shape[i];
    const b = shape[i + 1];
    if (target >= a.dist && target <= b.dist) {
      const span = b.dist - a.dist || 1;
      const u = (target - a.dist) / span;
      return {
        lat: a.lat + (b.lat - a.lat) * u,
        lon: a.lon + (b.lon - a.lon) * u,
        dist: target,
      };
    }
  }
  return { lat: last.lat, lon: last.lon, dist: last.dist };
}

/**
 * Position between two captures. Follow the shape when both pings project
 * within `offShapeMeters`; otherwise straight GPS lerp (snap-ish).
 */
export function positionAtPlayhead(
  prev: VehiclePing,
  next: VehiclePing,
  frac: number,
  shape: readonly ShapePoint[] | null | undefined,
  offShapeMeters = 150,
): PlayheadPosition {
  const t = clamp01(frac);
  const delaySeconds =
    prev.delaySeconds == null && next.delaySeconds == null
      ? null
      : (prev.delaySeconds ?? next.delaySeconds ?? 0) * (1 - t) +
        (next.delaySeconds ?? prev.delaySeconds ?? 0) * t;

  if (shape && shape.length > 0) {
    const a = projectOntoShape(prev.lat, prev.lon, shape);
    const b = projectOntoShape(next.lat, next.lon, shape);
    if (
      a &&
      b &&
      a.offsetMeters <= offShapeMeters &&
      b.offsetMeters <= offShapeMeters
    ) {
      const along = lerpAlongShape(shape, a.dist, b.dist, t);
      if (along) {
        return {
          lat: along.lat,
          lon: along.lon,
          delaySeconds,
          source: "shape",
        };
      }
    }
  }

  return {
    lat: prev.lat + (next.lat - prev.lat) * t,
    lon: prev.lon + (next.lon - prev.lon) * t,
    delaySeconds,
    source: "gps",
  };
}
