import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCancellationsChart } from "./cancellations.ts";
import type { NetworkDailyPoint } from "../../../lib/types";

function stubRoot(): HTMLElement {
  return { className: "", innerHTML: "" } as HTMLElement;
}

function point(
  day: string,
  cancellations_rate: number | null,
): NetworkDailyPoint {
  return {
    day,
    punctuality: null,
    reliability: null,
    cancellations: null,
    cancellations_rate,
  };
}

test("empty series is no data", () => {
  const root = stubRoot();
  renderCancellationsChart(root, []);
  assert.match(root.innerHTML, /No cancellation data in this period/);
});

test("rows without a rate are no data, not a chart", () => {
  const root = stubRoot();
  renderCancellationsChart(root, [point("2026-08-20", null)]);
  assert.match(root.innerHTML, /No cancellation data in this period/);
  assert.doesNotMatch(root.innerHTML, /cancel-chart/);
});

test("incomplete days with a known-outcomes rate still plot", () => {
  const root = stubRoot();
  renderCancellationsChart(root, [
    point("2026-08-21", 0.012),
    point("2026-08-22", 0.02),
  ]);
  assert.doesNotMatch(root.innerHTML, /No cancellation data in this period/);
  assert.match(root.innerHTML, /cancel-chart/);
});
