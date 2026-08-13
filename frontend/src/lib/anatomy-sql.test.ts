import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sharedChokePointsSql,
  networkHourHeatSql,
  routeStopProfileSql,
} from "./anatomy-sql.ts";

test("shared choke SQL requires two routes and five trips", () => {
  const sql = sharedChokePointsSql("2026-08-01", "2026-08-13");
  assert.match(sql, /COUNT\(DISTINCT route\) >= 2/);
  assert.match(sql, /SUM\(n_trips\) >= 5/);
  assert.match(sql, /mean_delay_added_seconds/);
  assert.match(sql, /delay_injectors/);
  assert.doesNotMatch(sql, /stop_delay/);
});

test("network hour heat groups weekday and hour", () => {
  const sql = networkHourHeatSql("2026-08-01", "2026-08-13");
  assert.match(sql, /hour_heat/);
  assert.match(sql, /isodow/);
  assert.match(sql, /MEDIAN/);
  assert.doesNotMatch(sql, /stop_delay/);
});

test("route profile filters direction_id", () => {
  const sql = routeStopProfileSql("1", "2026-08-01", "2026-08-13", 1);
  assert.match(sql, /direction_id = 1/);
  assert.match(sql, /stop_profile/);
});
