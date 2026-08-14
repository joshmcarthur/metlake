import type { CommentaryBrief, NetworkBriefStats, RouteBriefStats } from "./types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CommentaryCacheOptions {
  storage?: KeyValueStore;
  maxItems?: number;
}

export interface CommentaryCache {
  get(brief: CommentaryBrief): string | null;
  set(brief: CommentaryBrief, text: string): void;
}

const STORE_KEY = "metlake:commentary";
const CACHE_VERSION = 2;
const DEFAULT_MAX_ITEMS = 24;

interface CacheEntry {
  k: string;
  d: string;
  t: string;
}

interface CacheBlob {
  v: number;
  items: CacheEntry[];
}

function defaultStorage(): KeyValueStore {
  try {
    const storage = globalThis.localStorage;
    if (storage) return storage;
  } catch {
    // blocked / unavailable
  }
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

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function slotKey(brief: CommentaryBrief): string {
  switch (brief.scope) {
    case "network": {
      const stats = brief.stats as NetworkBriefStats;
      return JSON.stringify({
        scope: "network",
        period: stats.period,
        compare: stats.prior_period !== null,
      });
    }
    case "route": {
      const stats = brief.stats as RouteBriefStats;
      return JSON.stringify({
        scope: "route",
        route: stats.route,
        period: stats.period,
        direction: stats.direction ?? "",
        compare: stats.vs_prior_pp !== null,
      });
    }
    default: {
      const _exhaustive: never = brief.scope;
      return _exhaustive;
    }
  }
}

function digest(brief: CommentaryBrief): string {
  return fnv1aHex(`${CACHE_VERSION}:${JSON.stringify({ scope: brief.scope, stats: brief.stats })}`);
}

function emptyBlob(): CacheBlob {
  return { v: CACHE_VERSION, items: [] };
}

function readBlob(storage: KeyValueStore): CacheBlob {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return emptyBlob();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyBlob();
    const blob = parsed as Partial<CacheBlob>;
    if (blob.v !== CACHE_VERSION || !Array.isArray(blob.items)) {
      try {
        storage.removeItem(STORE_KEY);
      } catch {
        // ignore
      }
      return emptyBlob();
    }
    return { v: CACHE_VERSION, items: blob.items };
  } catch {
    return emptyBlob();
  }
}

function writeBlob(storage: KeyValueStore, blob: CacheBlob): void {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(blob));
  } catch {
    try {
      storage.removeItem(STORE_KEY);
    } catch {
      // quota / private mode
    }
  }
}

export function createCommentaryCache(
  options: CommentaryCacheOptions = {},
): CommentaryCache {
  const storage = options.storage ?? defaultStorage();
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

  return {
    get(brief) {
      const blob = readBlob(storage);
      const slot = slotKey(brief);
      const expected = digest(brief);
      const index = blob.items.findIndex((item) => item.k === slot);
      if (index < 0) return null;

      const entry = blob.items[index];
      if (!entry || entry.d !== expected) return null;

      if (index > 0) {
        blob.items.splice(index, 1);
        blob.items.unshift(entry);
        writeBlob(storage, blob);
      }
      return entry.t;
    },

    set(brief, text) {
      const blob = readBlob(storage);
      const slot = slotKey(brief);
      const next: CacheEntry = { k: slot, d: digest(brief), t: text };
      const items = blob.items.filter((item) => item.k !== slot);
      items.unshift(next);
      writeBlob(storage, { v: CACHE_VERSION, items: items.slice(0, maxItems) });
    },
  };
}

export const commentaryCache = createCommentaryCache();
