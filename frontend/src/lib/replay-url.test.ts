import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPeriodTicks,
  nextUtcHourKey,
  nzDayStartIso,
  parseReplaySearch,
  serializeReplaySearch,
  splitUtcHourKey,
  utcHourKey,
} from "./replay-url.ts";
import { replayPageHref } from "./site.ts";

test("parseReplaySearch reads from, to, and t", () => {
  const state = parseReplaySearch(
    "?from=2026-08-01&to=2026-08-14&t=2026-08-12T20%3A15%3A00%2B12%3A00",
  );
  assert.deepEqual(state, {
    from: "2026-08-01",
    to: "2026-08-14",
    t: "2026-08-12T20:15:00+12:00",
  });
});

test("parseReplaySearch ignores blank or invalid dates", () => {
  assert.deepEqual(parseReplaySearch("?from=nope&to=&t=also-bad"), {
    from: undefined,
    to: undefined,
    t: undefined,
  });
});

test("serializeReplaySearch round-trips", () => {
  const qs = serializeReplaySearch({
    from: "2026-08-01",
    to: "2026-08-14",
    t: "2026-08-12T20:15:00+12:00",
  });
  assert.equal(qs, "from=2026-08-01&to=2026-08-14&t=2026-08-12T20%3A15%3A00%2B12%3A00");
  assert.deepEqual(parseReplaySearch(`?${qs}`), {
    from: "2026-08-01",
    to: "2026-08-14",
    t: "2026-08-12T20:15:00+12:00",
  });
});

test("serializeReplaySearch omits missing fields", () => {
  assert.equal(serializeReplaySearch({ from: "2026-08-01", to: "2026-08-07" }), "from=2026-08-01&to=2026-08-07");
});

test("replayPageHref builds /replay/ with period", () => {
  assert.equal(
    replayPageHref({ from: "2026-08-01", to: "2026-08-14" }),
    "/replay/?from=2026-08-01&to=2026-08-14",
  );
  assert.equal(
    replayPageHref({
      from: "2026-08-01",
      to: "2026-08-14",
      t: "2026-08-12T08:00:00+12:00",
    }),
    "/replay/?from=2026-08-01&to=2026-08-14&t=2026-08-12T08%3A00%3A00%2B12%3A00",
  );
});

test("utcHourKey floors an instant to UTC YYYY-MM-DDTHH", () => {
  assert.equal(utcHourKey("2026-08-12T20:15:00+12:00"), "2026-08-12T08");
  assert.equal(utcHourKey("2026-08-12T08:59:59Z"), "2026-08-12T08");
});

test("nzDayStartIso is midnight NZ for a calendar day", () => {
  assert.equal(nzDayStartIso("2026-08-12"), "2026-08-12T00:00:00+12:00");
});

test("buildPeriodTicks covers a day in 5-minute steps", () => {
  const ticks = buildPeriodTicks("2026-08-12", "2026-08-12");
  assert.equal(ticks.length, 288);
  assert.equal(ticks[0], Date.parse("2026-08-12T00:00:00+12:00"));
  assert.equal(ticks[1]! - ticks[0]!, 5 * 60 * 1000);
  assert.equal(ticks[ticks.length - 1], Date.parse("2026-08-12T23:55:00+12:00"));
});

test("nextUtcHourKey rolls across midnight", () => {
  assert.equal(nextUtcHourKey("2026-08-12T08"), "2026-08-12T09");
  assert.equal(nextUtcHourKey("2026-08-12T23"), "2026-08-13T00");
});

test("splitUtcHourKey yields path segments", () => {
  assert.deepEqual(splitUtcHourKey("2026-08-12T08"), {
    year: "2026",
    month: "08",
    day: "12",
    hour: "08",
  });
});
