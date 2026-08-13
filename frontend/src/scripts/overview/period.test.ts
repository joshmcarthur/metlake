import assert from "node:assert/strict";
import { test } from "node:test";
import { boundsFromManifest, rangeForPeriod, unionManifestMonths } from "./period.ts";

const ARCHIVE_MONTHS = ["2018-07", "2026-03"] as const;
const NZ_NOW = new Date("2026-08-13T12:00:00+12:00");

test("this month follows the current NZ day, not the archive updated_at", () => {
  const bounds = boundsFromManifest(ARCHIVE_MONTHS, NZ_NOW);
  assert.equal(bounds.asOf, "2026-08-13");
  assert.deepEqual(rangeForPeriod("month", bounds), {
    from: "2026-08-01",
    to: "2026-08-13",
  });
});

test("today and this week are anchored to the current NZ day", () => {
  const bounds = boundsFromManifest(ARCHIVE_MONTHS, NZ_NOW);
  assert.deepEqual(rangeForPeriod("day", bounds), {
    from: "2026-08-13",
    to: "2026-08-13",
  });
  assert.deepEqual(rangeForPeriod("week", bounds), {
    from: "2026-08-07",
    to: "2026-08-13",
  });
});

test("all available still spans the archive months", () => {
  const bounds = boundsFromManifest(ARCHIVE_MONTHS, NZ_NOW);
  assert.deepEqual(rangeForPeriod("all", bounds), {
    from: "2018-07-01",
    to: "2026-03-31",
  });
});

test("unionManifestMonths sorts unique official and RT months", () => {
  assert.deepEqual(
    unionManifestMonths(["2026-03", "2018-07"], ["2026-08", "2026-03"], null),
    ["2018-07", "2026-03", "2026-08"],
  );
});

test("all available includes RT months so live-feed days are in bounds", () => {
  const bounds = boundsFromManifest(
    unionManifestMonths(ARCHIVE_MONTHS, ["2026-08"]),
    NZ_NOW,
  );
  assert.deepEqual(rangeForPeriod("all", bounds), {
    from: "2018-07-01",
    to: "2026-08-13",
  });
});

test("asOf uses the Auckland calendar date around UTC midnight", () => {
  const justAfterNzMidnight = new Date("2026-08-12T12:30:00Z");
  const bounds = boundsFromManifest(ARCHIVE_MONTHS, justAfterNzMidnight);
  assert.equal(bounds.asOf, "2026-08-13");
});
