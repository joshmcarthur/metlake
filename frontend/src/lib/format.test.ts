import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPendingTrips } from "./format.ts";

test("formatPendingTrips is empty when there is nothing pending", () => {
  assert.equal(formatPendingTrips(null), null);
  assert.equal(formatPendingTrips(0), null);
  assert.equal(formatPendingTrips(-1), null);
});

test("formatPendingTrips names the unseen trip count", () => {
  assert.equal(formatPendingTrips(340), "340 not yet seen");
  assert.equal(formatPendingTrips(1), "1 not yet seen");
});
