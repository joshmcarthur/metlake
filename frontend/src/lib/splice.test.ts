import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldFetchRtMonths,
  splicedRoutePerformanceSql,
} from "./splice.ts";
import { formatPeriodLabel } from "./format.ts";

test("skips RT files when published rows cover every day in the window", () => {
  assert.equal(shouldFetchRtMonths(13, "2026-03-01", "2026-03-13"), false);
});

test("fetches RT files when the window has unpublished days", () => {
  assert.equal(shouldFetchRtMonths(0, "2026-08-01", "2026-08-13"), true);
  assert.equal(shouldFetchRtMonths(10, "2026-08-01", "2026-08-13"), true);
});

test("spliced SQL unions RT days the CSV lacks", () => {
  const sql = splicedRoutePerformanceSql(true, true);
  assert.match(sql, /UNION ALL BY NAME/);
  assert.match(sql, /NOT IN/);
  assert.match(sql, /'published'/);
});

test("spliced SQL is RT-only when published is absent", () => {
  const sql = splicedRoutePerformanceSql(false, true);
  assert.match(sql, /route_performance_rt/);
  assert.doesNotMatch(sql, /UNION/);
});

test("period label notes live-feed estimates", () => {
  assert.match(
    formatPeriodLabel("2026-08-01", "2026-08-13", true),
    /some days estimated from live feed/,
  );
  assert.doesNotMatch(
    formatPeriodLabel("2026-08-01", "2026-08-13", false),
    /estimated/,
  );
});
