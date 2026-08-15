import assert from "node:assert/strict";
import { test } from "node:test";
import {
  delayBand,
  lerpAlongShape,
  positionAtPlayhead,
  projectOntoShape,
  type ShapePoint,
} from "./replay-motion.ts";

const LINE: ShapePoint[] = [
  { lat: -41.28, lon: 174.77, dist: 0 },
  { lat: -41.29, lon: 174.77, dist: 1113 },
  { lat: -41.29, lon: 174.78, dist: 1946 },
];

test("delayBand maps seconds to live/warn/bad/unknown", () => {
  assert.equal(delayBand(0), "live");
  assert.equal(delayBand(150), "live");
  assert.equal(delayBand(151), "warn");
  assert.equal(delayBand(300), "warn");
  assert.equal(delayBand(301), "bad");
  assert.equal(delayBand(null), "unknown");
});

test("projectOntoShape returns distance along polyline", () => {
  const mid = projectOntoShape(-41.285, 174.77, LINE);
  assert.ok(mid);
  assert.ok(Math.abs(mid.dist - 556.5) < 80);
  assert.ok(mid.offsetMeters < 5);
});

test("projectOntoShape reports large offset when far from shape", () => {
  const far = projectOntoShape(-41.0, 175.5, LINE);
  assert.ok(far);
  assert.ok(far.offsetMeters > 150);
});

test("lerpAlongShape moves between distances", () => {
  const p = lerpAlongShape(LINE, 0, 1113, 0.5);
  assert.ok(p);
  assert.ok(Math.abs(p.lat - -41.285) < 0.002);
  assert.equal(p.lon, 174.77);
});

test("positionAtPlayhead follows shape when both pings project", () => {
  const prev = { lat: -41.28, lon: 174.77, delaySeconds: 0 };
  const next = { lat: -41.29, lon: 174.77, delaySeconds: 60 };
  const pos = positionAtPlayhead(prev, next, 0.5, LINE, 150);
  assert.ok(Math.abs(pos.lat - -41.285) < 0.002);
  assert.equal(pos.source, "shape");
  assert.equal(pos.delaySeconds, 30);
});

test("positionAtPlayhead snaps to GPS when off shape", () => {
  const prev = { lat: -41.0, lon: 175.5, delaySeconds: 200 };
  const next = { lat: -41.01, lon: 175.51, delaySeconds: 400 };
  const pos = positionAtPlayhead(prev, next, 0.25, LINE, 150);
  assert.equal(pos.source, "gps");
  assert.ok(Math.abs(pos.lat - -41.0025) < 0.0001);
  assert.equal(pos.delaySeconds, 250);
});
