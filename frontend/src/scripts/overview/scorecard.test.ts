import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPendingLine } from "./scorecard.ts";

test("applyPendingLine hides the note when nothing is pending", () => {
  const el = { textContent: "stale", hidden: false };
  applyPendingLine(el as HTMLElement, 0);
  assert.equal(el.textContent, "");
  assert.equal(el.hidden, true);
  applyPendingLine(el as HTMLElement, null);
  assert.equal(el.hidden, true);
});

test("applyPendingLine shows unseen trips on incomplete days", () => {
  const el = { textContent: "", hidden: true };
  applyPendingLine(el as HTMLElement, 340);
  assert.equal(el.textContent, "340 not yet seen");
  assert.equal(el.hidden, false);
});
