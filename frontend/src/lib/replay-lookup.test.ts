import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeCaptureTimes,
  routeLabel,
  shapeForTrip,
  vehiclesAt,
  type HourBundle,
  type ReplayVehicle,
} from "./replay-lookup.ts";

function vehicle(partial: Partial<ReplayVehicle> & { tripId: string }): ReplayVehicle {
  return {
    feedTimestamp: 1,
    routeId: "1",
    directionId: 0,
    vehicleId: "v1",
    lat: -41.28,
    lon: 174.77,
    bearing: null,
    delaySeconds: null,
    ...partial,
  };
}

function bundle(partial: Partial<HourBundle> & { hourKey: string }): HourBundle {
  return {
    captures: new Map(),
    captureTimes: [],
    shapes: new Map(),
    routeNames: new Map(),
    ...partial,
  };
}

test("mergeCaptureTimes unions and sorts, skipping null hours", () => {
  const a = bundle({ hourKey: "a", captureTimes: [30, 10] });
  const b = bundle({ hourKey: "b", captureTimes: [20, 10] });
  assert.deepEqual(mergeCaptureTimes(a, null, b), [10, 20, 30]);
  assert.deepEqual(mergeCaptureTimes(null, null), []);
});

test("vehiclesAt returns the first hour that has that capture", () => {
  const v = vehicle({ tripId: "t1", feedTimestamp: 10 });
  const a = bundle({
    hourKey: "a",
    captures: new Map([[10, [v]]]),
    captureTimes: [10],
  });
  assert.deepEqual(vehiclesAt([null, a], 10), [v]);
  assert.deepEqual(vehiclesAt([a], 99), []);
});

test("shapeForTrip skips empty polylines", () => {
  const pts = [
    { lat: -41.28, lon: 174.77, dist: 0 },
    { lat: -41.29, lon: 174.77, dist: 100 },
  ];
  const empty = bundle({
    hourKey: "empty",
    shapes: new Map([["t1", []]]),
  });
  const filled = bundle({
    hourKey: "filled",
    shapes: new Map([["t1", pts]]),
  });
  assert.equal(shapeForTrip([empty], "t1"), null);
  assert.deepEqual(shapeForTrip([empty, filled], "t1"), pts);
});

test("routeLabel prefers short name, then long, then the id", () => {
  const named = bundle({
    hourKey: "n",
    routeNames: new Map([
      ["110", { short: "110", long: "Airport Flyer" }],
      ["only-long", { short: null, long: "Night bus" }],
    ]),
  });
  assert.equal(routeLabel([named], "110"), "110");
  assert.equal(routeLabel([named], "only-long"), "Night bus");
  assert.equal(routeLabel([named], "missing"), "missing");
  assert.equal(routeLabel([named], ""), "—");
});
