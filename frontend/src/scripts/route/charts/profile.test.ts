import assert from "node:assert/strict";
import { test } from "node:test";
import { renderStopProfile } from "./profile.ts";

function stubRoot(): HTMLElement {
  return { className: "", innerHTML: "" } as HTMLElement;
}

test("shows empty note when rows array is empty", () => {
  const root = stubRoot();
  renderStopProfile(root, []);
  assert.match(root.innerHTML, /No trip-update delay data for this period/);
  assert.match(root.className, /chart-slot-disabled/);
});

test("renders ordered list of stop names and median delays", () => {
  const root = stubRoot();
  renderStopProfile(root, [
    { stop_name: "First Stop", stop_sequence: 1, median_delay_seconds: 45 },
    { stop_name: "Second Stop", stop_sequence: 3, median_delay_seconds: 120 },
  ]);
  assert.match(root.innerHTML, /<ol/);
  assert.match(root.innerHTML, /First Stop/);
  assert.match(root.innerHTML, /45s/);
  assert.match(root.innerHTML, /Second Stop/);
  assert.match(root.innerHTML, /120s/);
});

test("escapes stop names in rendered list items", () => {
  const root = stubRoot();
  renderStopProfile(root, [
    {
      stop_name: 'Stop <A> & "one"',
      stop_sequence: 1,
      median_delay_seconds: 10,
    },
  ]);
  assert.match(root.innerHTML, /Stop &lt;A&gt; &amp; &quot;one&quot;/);
  assert.doesNotMatch(root.innerHTML, /<script>/);
});
