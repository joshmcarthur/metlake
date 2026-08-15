import type { ShapePoint } from "./replay-motion";

export interface ReplayVehicle {
  feedTimestamp: number;
  tripId: string;
  routeId: string;
  directionId: number | null;
  vehicleId: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  delaySeconds: number | null;
}

export interface HourBundle {
  hourKey: string;
  /** Capture unix seconds → vehicles at that feed timestamp. */
  captures: Map<number, ReplayVehicle[]>;
  /** Sorted unique capture timestamps in this hour. */
  captureTimes: number[];
  shapes: Map<string, ShapePoint[]>;
  routeNames: Map<string, { short: string | null; long: string | null }>;
}

/** Merge capture timelines from cached hours around the playhead. */
export function mergeCaptureTimes(
  ...bundles: Array<HourBundle | null>
): number[] {
  const times = new Set<number>();
  for (const bundle of bundles) {
    if (!bundle) continue;
    for (const t of bundle.captureTimes) times.add(t);
  }
  return [...times].sort((a, b) => a - b);
}

export function vehiclesAt(
  bundles: Array<HourBundle | null>,
  captureTs: number,
): ReplayVehicle[] {
  for (const bundle of bundles) {
    const hit = bundle?.captures.get(captureTs);
    if (hit) return hit;
  }
  return [];
}

export function shapeForTrip(
  bundles: Array<HourBundle | null>,
  tripId: string,
): ShapePoint[] | null {
  for (const bundle of bundles) {
    const shape = bundle?.shapes.get(tripId);
    if (shape && shape.length > 0) return shape;
  }
  return null;
}

export function routeLabel(
  bundles: Array<HourBundle | null>,
  routeId: string,
): string {
  for (const bundle of bundles) {
    const name = bundle?.routeNames.get(routeId);
    if (name?.short) return name.short;
    if (name?.long) return name.long;
  }
  return routeId || "—";
}
