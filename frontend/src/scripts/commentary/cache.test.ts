import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommentaryCache } from "./cache.ts";
import type { CommentaryBrief, NetworkBriefStats } from "./types";

function memoryStore(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function networkBrief(punctuality_pct: number, period = "2026-08-01 to 2026-08-07"): CommentaryBrief {
  const stats: NetworkBriefStats = {
    period,
    prior_period: null,
    reliability_pct: 97.2,
    punctuality_pct,
    cancellations_pct: 1.8,
    scheduled_trips: 1000,
    vs_prior: null,
    best_punctuality: [],
    lowest_punctuality: [],
    note: "test",
  };
  return {
    title: "Network commentary",
    scope: "network",
    fallbackKey: "network",
    stats,
  };
}

test("returns stored commentary for the same brief", () => {
  const cache = createCommentaryCache({ storage: memoryStore() });
  const brief = networkBrief(91.4);
  cache.set(brief, "Punctuality eased to 91.4%.");
  assert.equal(cache.get(brief), "Punctuality eased to 91.4%.");
});

test("replaces the slot when stats change instead of keeping the old version", () => {
  const cache = createCommentaryCache({ storage: memoryStore() });
  const previous = networkBrief(91.4);
  const current = networkBrief(88.1);
  cache.set(previous, "old prose");
  cache.set(current, "new prose");
  assert.equal(cache.get(previous), null);
  assert.equal(cache.get(current), "new prose");
});

test("keeps separate slots for different periods", () => {
  const cache = createCommentaryCache({ storage: memoryStore() });
  const week = networkBrief(91.4, "2026-08-01 to 2026-08-07");
  const month = networkBrief(91.4, "2026-08-01 to 2026-08-31");
  cache.set(week, "week prose");
  cache.set(month, "month prose");
  assert.equal(cache.get(week), "week prose");
  assert.equal(cache.get(month), "month prose");
});

test("evicts the least recently used slot when over capacity", () => {
  const cache = createCommentaryCache({ storage: memoryStore(), maxItems: 2 });
  const a = networkBrief(90, "period-a");
  const b = networkBrief(90, "period-b");
  const c = networkBrief(90, "period-c");
  cache.set(a, "a");
  cache.set(b, "b");
  cache.set(c, "c");
  assert.equal(cache.get(a), null);
  assert.equal(cache.get(b), "b");
  assert.equal(cache.get(c), "c");
});

test("treats an incompatible store version as empty", () => {
  const storage = memoryStore();
  storage.setItem(
    "metlake:commentary",
    JSON.stringify({ v: 999, items: [{ k: "x", d: "y", t: "stale" }] }),
  );
  const cache = createCommentaryCache({ storage });
  assert.equal(cache.get(networkBrief(91.4)), null);
  assert.equal(storage.getItem("metlake:commentary"), null);
});

test("swallows storage quota errors", () => {
  const cache = createCommentaryCache({
    storage: {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota");
      },
      removeItem() {
        throw new Error("quota");
      },
    },
  });
  cache.set(networkBrief(91.4), "prose");
  assert.equal(cache.get(networkBrief(91.4)), null);
});
