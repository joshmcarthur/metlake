import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPeriodFallbackNote,
  resolvePeriodFallback,
  shouldTryPeriodFallback,
} from "./period-fallback.ts";
import type { DateRange } from "../../lib/types.ts";

test("shouldTryPeriodFallback skips compare and all available", () => {
  assert.equal(shouldTryPeriodFallback("month", true), false);
  assert.equal(shouldTryPeriodFallback("all", false), false);
  assert.equal(shouldTryPeriodFallback("month", false), true);
  assert.equal(shouldTryPeriodFallback("day", false), true);
});

test("formatPeriodFallbackNote describes the requested and display ranges", () => {
  const note = formatPeriodFallbackNote(
    "month",
    { from: "2026-08-01", to: "2026-08-13" },
    { from: "2026-07-19", to: "2026-07-31" },
  );
  assert.match(note, /No data yet for/);
  assert.match(note, /prior month window/);
  assert.match(note, /1 Aug 2026/);
  assert.match(note, /19 Jul 2026/);
});

test("resolvePeriodFallback keeps the requested range when data exists", async () => {
  const requested: DateRange = { from: "2026-08-01", to: "2026-08-13" };
  const conn = { id: "conn" };
  let reloadCalls = 0;

  const resolved = await resolvePeriodFallback(
    conn,
    requested,
    "month",
    false,
    async () => true,
    async () => {
      reloadCalls += 1;
      return conn;
    },
  );

  assert.equal(resolved.displayRange, requested);
  assert.equal(resolved.fallbackNote, null);
  assert.equal(reloadCalls, 0);
});

test("resolvePeriodFallback uses the prior window when the requested range is empty", async () => {
  const requested: DateRange = { from: "2026-08-01", to: "2026-08-13" };
  const fallback: DateRange = { from: "2026-07-19", to: "2026-07-31" };
  const conn = { id: "conn" };
  let reloadCalls = 0;
  let hasDataCalls = 0;

  const resolved = await resolvePeriodFallback(
    conn,
    requested,
    "month",
    false,
    async (_connection, range) => {
      hasDataCalls += 1;
      return range.to === fallback.to && hasDataCalls > 2;
    },
    async (range) => {
      reloadCalls += 1;
      assert.deepEqual(range, fallback);
      return conn;
    },
  );

  assert.deepEqual(resolved.displayRange, fallback);
  assert.match(resolved.fallbackNote ?? "", /prior month window/);
  assert.equal(reloadCalls, 1);
});

test("resolvePeriodFallback does not reload when fallback data is already loaded", async () => {
  const requested: DateRange = { from: "2026-08-01", to: "2026-08-01" };
  const fallback: DateRange = { from: "2026-07-31", to: "2026-07-31" };
  const conn = { id: "conn" };
  let reloadCalls = 0;

  const resolved = await resolvePeriodFallback(
    conn,
    requested,
    "day",
    false,
    async (_connection, range) => range.to === fallback.to,
    async () => {
      reloadCalls += 1;
      return conn;
    },
  );

  assert.deepEqual(resolved.displayRange, fallback);
  assert.equal(reloadCalls, 0);
});

test("resolvePeriodFallback leaves the requested range when fallback is also empty", async () => {
  const requested: DateRange = { from: "2026-08-01", to: "2026-08-13" };
  const conn = { id: "conn" };

  const resolved = await resolvePeriodFallback(
    conn,
    requested,
    "month",
    false,
    async () => false,
    async () => conn,
  );

  assert.deepEqual(resolved.displayRange, requested);
  assert.equal(resolved.fallbackNote, null);
});
