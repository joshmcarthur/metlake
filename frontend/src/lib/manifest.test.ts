import assert from "node:assert/strict";
import { test } from "node:test";
import { ArchiveError, EMPTY_ROUTE_PERFORMANCE_MESSAGE } from "./types.ts";
import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
  monthsToRegister,
  requireRoutePerformanceSource,
} from "./manifest.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("registers intersecting months when the period overlaps the archive", () => {
  assert.deepEqual(
    monthsToRegister(["2018-07", "2026-03"], "2026-03-01", "2026-03-29"),
    ["2026-03"],
  );
});

test("falls back to the latest archive month when the period has no parquet", () => {
  assert.deepEqual(
    monthsToRegister(["2018-07", "2026-03"], "2026-08-01", "2026-08-13"),
    ["2026-03"],
  );
});

test("returns no months when the archive itself is empty", () => {
  assert.deepEqual(monthsToRegister([], "2026-08-01", "2026-08-13"), []);
});

test("official and RT manifests treat 404 as missing, not fatal", async () => {
  const fetchFn: typeof fetch = async () => new Response(null, { status: 404 });
  assert.equal(await fetchRoutePerformanceManifest(fetchFn), null);
  assert.equal(await fetchRtRoutePerformanceManifest(fetchFn), null);
});

test("official and RT manifests treat an empty month list as missing", async () => {
  const fetchFn: typeof fetch = async () =>
    jsonResponse({ months: [], updated_at: "2026-08-13T00:00:00Z" });
  assert.equal(await fetchRoutePerformanceManifest(fetchFn), null);
  assert.equal(await fetchRtRoutePerformanceManifest(fetchFn), null);
});

test("invalid official manifest still throws", async () => {
  const fetchFn: typeof fetch = async () => jsonResponse({ nope: true });
  await assert.rejects(
    () => fetchRoutePerformanceManifest(fetchFn),
    (error: unknown) =>
      error instanceof ArchiveError && error.kind === "manifest-invalid",
  );
});

test("archive-empty is thrown only when both official and RT are missing", () => {
  const official = { months: ["2026-03"], updated_at: "2026-03-29T00:00:00Z" };
  const rt = { months: ["2026-08"], updated_at: "2026-08-13T00:00:00Z" };
  requireRoutePerformanceSource(official, null);
  requireRoutePerformanceSource(null, rt);
  assert.throws(
    () => requireRoutePerformanceSource(null, null),
    (error: unknown) =>
      error instanceof ArchiveError &&
      error.kind === "archive-empty" &&
      error.message === EMPTY_ROUTE_PERFORMANCE_MESSAGE,
  );
});
