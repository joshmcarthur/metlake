import assert from "node:assert/strict";
import { test } from "node:test";
import { renderNetworkHourHeat } from "./hour-heat.ts";

function stubRoot(): HTMLElement {
  return { className: "", innerHTML: "" } as HTMLElement;
}

test("shows empty note only when cells array is empty", () => {
  const root = stubRoot();
  renderNetworkHourHeat(root, []);
  assert.match(root.innerHTML, /rt-stub-note/);
  assert.match(root.className, /chart-slot-disabled/);
});

test("renders heatmap table when every delay is null", () => {
  const root = stubRoot();
  const cells = [
    { weekday: 1, hour: 8, delay_seconds: null },
    { weekday: 3, hour: 14, delay_seconds: null },
  ];
  renderNetworkHourHeat(root, cells);
  assert.doesNotMatch(root.innerHTML, /rt-stub-note/);
  assert.match(root.innerHTML, /<table class="heatmap">/);
  assert.equal((root.innerHTML.match(/class="muted"/g) ?? []).length, 7 * 24);
});

test("puts heatmap class on the table element", () => {
  const root = stubRoot();
  renderNetworkHourHeat(root, [
    { weekday: 2, hour: 9, delay_seconds: 120 },
  ]);
  assert.match(root.innerHTML, /<table class="heatmap">/);
  assert.match(root.className, /^heatmap$/);
});

test("colors populated cells and mutes missing slots", () => {
  const root = stubRoot();
  renderNetworkHourHeat(root, [
    { weekday: 1, hour: 0, delay_seconds: 180 },
  ]);
  assert.match(root.innerHTML, /Mon 00:00 · 180s/);
  assert.match(root.innerHTML, /background:#e8b86a/);
  assert.match(root.innerHTML, /Mon 01:00 · no data/);
});
