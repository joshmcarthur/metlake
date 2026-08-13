import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, renderChokePoints } from "./choke-points.ts";

function stubRoot(): HTMLElement {
  return { className: "", innerHTML: "" } as HTMLElement;
}

test("escapeHtml encodes HTML metacharacters", () => {
  assert.equal(
    escapeHtml(`A & B <script>alert("x")</script> 'end'`),
    "A &amp; B &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;end&#39;",
  );
});

test("shows empty note when rows array is empty", () => {
  const root = stubRoot();
  renderChokePoints(root, []);
  assert.match(root.innerHTML, /rt-stub-note/);
  assert.match(root.className, /chart-slot-disabled/);
});

test("escapes stop names in rendered list items", () => {
  const root = stubRoot();
  renderChokePoints(root, [
    {
      from_stop_name: 'Stop <A> & "one"',
      to_stop_name: "Stop 'B' > two",
      delay_added: 45,
      n_routes: 2,
      n_trips: 10,
    },
  ]);
  assert.match(root.innerHTML, /Stop &lt;A&gt; &amp; &quot;one&quot;/);
  assert.match(root.innerHTML, /Stop &#39;B&#39; &gt; two/);
  assert.doesNotMatch(root.innerHTML, /<script>/);
  assert.match(root.innerHTML, /\+45s · 2 routes · 10 trips/);
});

test("formats negative delay without a leading plus", () => {
  const root = stubRoot();
  renderChokePoints(root, [
    {
      from_stop_name: "A",
      to_stop_name: "B",
      delay_added: -12,
      n_routes: 1,
      n_trips: 3,
    },
  ]);
  assert.match(root.innerHTML, /-12s · 1 routes · 3 trips/);
  assert.doesNotMatch(root.innerHTML, /\+-12s/);
});
