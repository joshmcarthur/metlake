import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSampleSql, getDefaultSampleSql } from "./sample-sql.ts";

test("omits a route filter when none is selected", () => {
  const sql = buildSampleSql("2026-08", "2026-08-01", "2026-08-13");
  assert.match(sql, /WHERE day BETWEEN DATE '2026-08-01' AND DATE '2026-08-13'\nORDER BY day;/);
  assert.doesNotMatch(sql, /AND route =/);
});

test("filters by route when one is provided", () => {
  const sql = buildSampleSql("2026-08", "2026-08-01", "2026-08-13", "1");
  assert.match(sql, /AND route = '1'/);
  assert.doesNotMatch(sql, /AND route = '83'/);
});

test("getDefaultSampleSql omits a route filter by default", () => {
  const sql = getDefaultSampleSql(["2026-08"], "2026-08-13T12:00:00Z");
  assert.doesNotMatch(sql, /AND route =/);
});

test("getDefaultSampleSql uses a provided route", () => {
  const sql = getDefaultSampleSql(["2026-08"], "2026-08-13T12:00:00Z", "110");
  assert.match(sql, /AND route = '110'/);
});
