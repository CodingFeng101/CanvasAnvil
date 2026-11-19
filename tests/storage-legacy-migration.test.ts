import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateLegacyOnce } from "../client/shared/storage/legacy-migration";
import type { WorkspaceStore } from "../client/shared/storage/indexed-db-store";

/**
 * The one-time copy out of localStorage. Its rules are the storage contract:
 * copy, never move; never overwrite what the store already holds; run once.
 */

function memoryStore(initial: Record<string, unknown> = {}): WorkspaceStore & { data: Map<string, unknown> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async read<T>(key: string) {
      return (data.has(key) ? (structuredClone(data.get(key)) as T) : null);
    },
    async save<T>(key: string, value: T) {
      data.set(key, structuredClone(value));
    },
    async clear(key: string) {
      data.delete(key);
    },
  };
}

test("legacy values are copied and the source is left alone", async () => {
  const store = memoryStore();
  const legacy = new Map<string, unknown>([["a", [1, 2]], ["b", "<mxfile/>"]]);
  const result = await migrateLegacyOnce(store, "marker", [
    { key: "messages", readLegacy: () => legacy.get("a") ?? null },
    { key: "xml", readLegacy: () => legacy.get("b") ?? null },
    { key: "missing", readLegacy: () => null },
  ]);
  assert.equal(result.ran, true);
  assert.deepEqual(result.copied, ["messages", "xml"]);
  assert.deepEqual(store.data.get("messages"), [1, 2]);
  assert.equal(store.data.get("xml"), "<mxfile/>");
  assert.equal(store.data.has("missing"), false);
  assert.equal(legacy.size, 2);
});

test("a value already in the store is never overwritten", async () => {
  const store = memoryStore({ messages: ["newer"] });
  await migrateLegacyOnce(store, "marker", [{ key: "messages", readLegacy: () => ["older"] }]);
  assert.deepEqual(store.data.get("messages"), ["newer"]);
});

test("the copy runs once, even if the store is emptied afterwards", async () => {
  const store = memoryStore();
  let reads = 0;
  const entry = { key: "messages", readLegacy: () => (reads++, ["old"]) };
  await migrateLegacyOnce(store, "marker", [entry]);
  await store.clear("messages");
  const second = await migrateLegacyOnce(store, "marker", [entry]);
  assert.equal(second.ran, false);
  assert.equal(reads, 1);
  assert.equal(store.data.has("messages"), false);
});

test("a legacy reader that throws counts as no value", async () => {
  const store = memoryStore();
  const result = await migrateLegacyOnce(store, "marker", [
    { key: "broken", readLegacy: () => { throw new Error("blocked"); } },
    { key: "fine", readLegacy: () => "ok" },
  ]);
  assert.deepEqual(result.copied, ["fine"]);
});
