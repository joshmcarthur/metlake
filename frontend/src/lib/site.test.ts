import assert from "node:assert/strict";
import { test } from "node:test";
import { queryPageHref, routeFromQuerySearch } from "./site.ts";

test("queryPageHref includes the selected route", () => {
  assert.equal(queryPageHref("1"), "/query/?route=1");
});

test("queryPageHref encodes unusual route codes", () => {
  assert.equal(queryPageHref("N1"), "/query/?route=N1");
  assert.equal(queryPageHref("1/2"), "/query/?route=1%2F2");
});

test("queryPageHref omits a route when none is selected", () => {
  assert.equal(queryPageHref(), "/query/");
  assert.equal(queryPageHref(""), "/query/");
  assert.equal(queryPageHref("  "), "/query/");
  assert.equal(queryPageHref("__any__"), "/query/");
});

test("routeFromQuerySearch reads the route param", () => {
  assert.equal(routeFromQuerySearch("?route=110"), "110");
  assert.equal(routeFromQuerySearch("route=1"), "1");
});

test("routeFromQuerySearch ignores a missing or blank route", () => {
  assert.equal(routeFromQuerySearch(""), undefined);
  assert.equal(routeFromQuerySearch("?foo=bar"), undefined);
  assert.equal(routeFromQuerySearch("?route="), undefined);
  assert.equal(routeFromQuerySearch("?route=%20"), undefined);
});
