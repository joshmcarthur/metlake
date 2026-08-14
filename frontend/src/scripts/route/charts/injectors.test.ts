import assert from "node:assert/strict";
import { test } from "node:test";
import { renderInjectors } from "./injectors.ts";

function stubRoot(): HTMLElement {
  return { className: "", innerHTML: "" } as HTMLElement;
}

test("shows empty note when rows array is empty", () => {
  const root = stubRoot();
  renderInjectors(root, []);
  assert.match(root.innerHTML, /No trip-update delay data for this period/);
  assert.match(root.className, /chart-slot-disabled/);
});

test("renders injector list without route count", () => {
  const root = stubRoot();
  renderInjectors(root, [
    {
      from_stop_name: "A",
      to_stop_name: "B",
      delay_added: 45,
      n_trips: 10,
    },
  ]);
  assert.match(root.innerHTML, /\+45s/);
  assert.match(root.innerHTML, /<span>10 trips<\/span>/);
  assert.doesNotMatch(root.innerHTML, /routes/);
});

test("escapes stop names in rendered list items", () => {
  const root = stubRoot();
  renderInjectors(root, [
    {
      from_stop_name: 'Stop <A> & "one"',
      to_stop_name: "Stop 'B' > two",
      delay_added: 45,
      n_trips: 10,
    },
  ]);
  assert.match(root.innerHTML, /Stop &lt;A&gt; &amp; &quot;one&quot;/);
  assert.match(root.innerHTML, /Stop &#39;B&#39; &gt; two/);
  assert.doesNotMatch(root.innerHTML, /<script>/);
});

test("formats negative delay without a leading plus", () => {
  const root = stubRoot();
  renderInjectors(root, [
    {
      from_stop_name: "A",
      to_stop_name: "B",
      delay_added: -12,
      n_trips: 3,
    },
  ]);
  assert.match(root.innerHTML, /-12s/);
  assert.match(root.innerHTML, /<span>3 trips<\/span>/);
  assert.doesNotMatch(root.innerHTML, /\+-12s/);
});
