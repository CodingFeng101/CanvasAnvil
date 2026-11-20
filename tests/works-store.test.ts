import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkspaceStore } from "../client/shared/storage/indexed-db-store";
import { createWorksStore, type LocalArea } from "../client/shared/works/works-store";
import {
  copyName,
  defaultWorkName,
  listedWorks,
  nameFromText,
  normalizeIndex,
  type WorkMeta,
} from "../client/shared/works/works-index";

/**
 * My works keeps several works per canvas in the canvas's own database. These
 * pin the rules users depend on: what they had before upgrading becomes a
 * work, old keys are copied and kept, works are independent, an unsaved draft
 * is the only thing ever discarded.
 */

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const store: WorkspaceStore & { data: Map<string, unknown> } = {
    data,
    async read<T>(key: string) {
      return data.has(key) ? (structuredClone(data.get(key)) as T) : null;
    },
    async save<T>(key: string, value: T) {
      data.set(key, structuredClone(value));
    },
    async clear(key: string) {
      data.delete(key);
    },
    async listKeys(prefix: string) {
      return [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
  return store;
}

function memoryLocal(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const area: LocalArea & { data: Map<string, string> } = {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
  return area;
}

const config = (store: WorkspaceStore) => ({
  store,
  legacyKeys: ["primary"],
  legacyPrefixes: ["chat-image:"],
  localKeys: ["chat", "stage"],
});

test("what a user had before becomes a listed work; old keys are copied and kept", async () => {
  const store = memoryStore({ primary: { slides: 3 }, "chat-image:a": "data:a", unrelated: 1 });
  const local = memoryLocal({ chat: "[1,2]" });
  const works = createWorksStore(config(store), local);
  const { index, currentId } = await works.ensure("zh");

  assert.equal(index.length, 1);
  assert.equal(index[0].saved, true);
  assert.equal(index[0].name, "未命名作品 1");
  assert.equal(currentId, index[0].id);
  assert.deepEqual(await works.storeFor(currentId).read("primary"), { slides: 3 });
  assert.equal(await works.storeFor(currentId).read("chat-image:a"), "data:a");
  assert.deepEqual(store.data.get("primary"), { slides: 3 });
  assert.equal(local.get("chat"), "[1,2]");
});

test("a canvas with nothing saved starts on an unlisted draft", async () => {
  const works = createWorksStore(config(memoryStore()), memoryLocal());
  const { index } = await works.ensure("en");
  assert.equal(index.length, 1);
  assert.equal(index[0].saved, false);
  assert.deepEqual(listedWorks(index), []);
});

test("migration runs once", async () => {
  const store = memoryStore({ primary: "v1" });
  const works = createWorksStore(config(store), memoryLocal());
  const first = await works.ensure("en");
  await store.save("primary", "changed by an old release");
  const second = await works.ensure("en");
  assert.equal(second.index.length, 1);
  assert.equal(second.currentId, first.currentId);
  assert.equal(await works.storeFor(first.currentId).read("primary"), "v1");
});

test("switching swaps the localStorage values and keeps each work's data apart", async () => {
  const store = memoryStore({ primary: "deck A" });
  const local = memoryLocal({ chat: "chat A", stage: "slides" });
  const works = createWorksStore(config(store), local);
  const { currentId: a } = await works.ensure("en");

  const toNew = await works.switchWork(a, null);
  const b = toNew.currentId;
  assert.notEqual(b, a);
  assert.equal(local.get("chat"), null);
  assert.equal(local.get("stage"), null);
  await works.storeFor(b).save("primary", "deck B");
  local.set("chat", "chat B");
  await works.saveAs(b, "B");

  const back = await works.switchWork(b, a);
  assert.equal(back.currentId, a);
  assert.equal(local.get("chat"), "chat A");
  assert.equal(local.get("stage"), "slides");
  assert.equal(await works.storeFor(a).read("primary"), "deck A");
  assert.equal(await works.storeFor(b).read("primary"), "deck B");

  await works.switchWork(a, b);
  assert.equal(local.get("chat"), "chat B");
  assert.equal(local.get("stage"), null);
});

test("discarding the draft being left deletes only that draft", async () => {
  const store = memoryStore({ primary: "kept" });
  const local = memoryLocal();
  const works = createWorksStore(config(store), local);
  const { currentId: saved } = await works.ensure("en");
  const { currentId: draft } = await works.switchWork(saved, null);
  await works.storeFor(draft).save("primary", "scratch");
  await works.storeFor(draft).save("chat-image:x", "img");

  const after = await works.switchWork(draft, null, { discardFrom: true });
  assert.equal(after.index.some((w) => w.id === draft), false);
  assert.deepEqual([...store.data.keys()].filter((k) => k.includes(draft)), []);
  assert.equal(await works.storeFor(saved).read("primary"), "kept");
});

test("deleting one work leaves the others alone", async () => {
  const store = memoryStore({ primary: "A" });
  const works = createWorksStore(config(store), memoryLocal());
  const { currentId: a } = await works.ensure("en");
  const { currentId: b } = await works.switchWork(a, null);
  await works.storeFor(b).save("primary", "B");
  await works.saveAs(b, "B");
  const index = await works.remove(a);
  assert.deepEqual(index.map((w) => w.id), [b]);
  assert.equal(await works.storeFor(b).read("primary"), "B");
  assert.equal(await works.storeFor(a).read("primary"), null);
});

test("a copy is independent of its source", async () => {
  const store = memoryStore({ primary: { title: "A" } });
  const local = memoryLocal({ chat: "live chat" });
  const works = createWorksStore(config(store), local);
  const { currentId: a } = await works.ensure("zh");
  const index = await works.duplicate(a, "zh", true);
  const copy = index.find((w) => w.id !== a)!;
  assert.equal(copy.name, "未命名作品 1 副本");
  assert.equal(copy.saved, true);
  await works.storeFor(copy.id).save("primary", { title: "changed" });
  assert.deepEqual(await works.storeFor(a).read("primary"), { title: "A" });

  await works.switchWork(a, copy.id);
  assert.equal(local.get("chat"), "live chat");
});

test("a stray draft left by an interrupted switch is cleaned up", async () => {
  const store = memoryStore({ primary: "A" });
  const works = createWorksStore(config(store), memoryLocal());
  const { currentId: a, index } = await works.ensure("en");
  const stray: WorkMeta = { id: "wstray", name: "", saved: false, createdAt: 1, updatedAt: 1 };
  await store.save("works:index", [...index, stray]);
  await store.save("work:wstray:primary", "lost");
  const after = await works.ensure("en");
  assert.equal(after.currentId, a);
  assert.deepEqual(after.index.map((w) => w.id), [a]);
  assert.equal(store.data.has("work:wstray:primary"), false);
});

test("names: from text, defaults and copies", () => {
  assert.equal(nameFromText("\n  画一个  电商架构图 \n第二行"), "画一个 电商架构图");
  assert.equal(nameFromText("一".repeat(30)), `${"一".repeat(24)}…`);
  assert.equal(nameFromText(""), "");
  const index = normalizeIndex([
    { id: "1", name: "Untitled 1", saved: true, createdAt: 1 },
    { id: "2", name: "Untitled 2", saved: false, createdAt: 2 },
  ]);
  assert.equal(defaultWorkName(index, "en"), "Untitled 2");
  assert.equal(copyName([...index, { ...index[0], id: "3", name: "Untitled 1 copy" }], "Untitled 1", "en"), "Untitled 1 copy 2");
});

test("the index reader drops malformed entries and sorts the listed works", () => {
  const index = normalizeIndex([
    { id: "old", name: "Old", saved: true, createdAt: 1, updatedAt: 5 },
    { id: "new", name: "New", saved: true, createdAt: 2, updatedAt: 9 },
    { id: "draft", saved: false, createdAt: 3 },
    { name: "no id" },
    { id: "old", name: "duplicate" },
    null,
  ]);
  assert.deepEqual(index.map((w) => w.id), ["old", "new", "draft"]);
  assert.deepEqual(listedWorks(index).map((w) => w.id), ["new", "old"]);
});

test("My works changes only on Save; don't save goes back to the saved version", async () => {
  const store = memoryStore();
  const local = memoryLocal();
  const works = createWorksStore(config(store), local);
  const { currentId: id } = await works.ensure("zh");

  await works.storeFor(id).save("primary", { v: 1 });
  local.set("chat", "first");
  await works.saveAs(id, "A");
  assert.deepEqual(await store.read(`saved:${id}:primary`), { v: 1 });

  // Edits after saving reach the live copy only.
  await works.storeFor(id).save("primary", { v: 2 });
  await works.storeFor(id).save("extra", "x");
  local.set("chat", "second");
  assert.deepEqual(await store.read(`saved:${id}:primary`), { v: 1 });

  // Leaving without saving: back to v1, the extra key gone, the chat restored.
  const next = await works.switchWork(id, null, { revertFrom: true });
  assert.deepEqual(await works.storeFor(id).read("primary"), { v: 1 });
  assert.equal(await works.storeFor(id).read("extra"), null);
  await works.switchWork(next.currentId, id, { discardFrom: true });
  assert.equal(local.get("chat"), "first");
});

test("leaving with save commits the live copy, a draft under its new name", async () => {
  const store = memoryStore();
  const works = createWorksStore(config(store), memoryLocal());
  const { currentId: id } = await works.ensure("zh");
  await works.storeFor(id).save("primary", { v: 7 });

  const state = await works.switchWork(id, null, { commitFrom: { name: "Deck", thumb: "data:t" } });
  const saved = state.index.find((w) => w.id === id)!;
  assert.equal(saved.saved, true);
  assert.equal(saved.name, "Deck");
  assert.equal(saved.thumb, "data:t");
  assert.deepEqual(await store.read(`saved:${id}:primary`), { v: 7 });
});

test("a duplicate copies the live work (saving is automatic)", async () => {
  const store = memoryStore();
  const works = createWorksStore(config(store), memoryLocal());
  const { currentId: id } = await works.ensure("zh");
  await works.storeFor(id).save("primary", { v: 1 });
  await works.saveAs(id, "A");
  await works.storeFor(id).save("primary", { v: 2 });

  const index = await works.duplicate(id, "zh", true);
  const copy = index.find((w) => w.id !== id)!;
  assert.deepEqual(await works.storeFor(copy.id).read("primary"), { v: 2 });
  assert.deepEqual(await store.read(`saved:${copy.id}:primary`), { v: 2 });
});

test("fingerprints follow normalize, so view-only rewrites are not changes", async () => {
  const store = memoryStore();
  const works = createWorksStore(
    { ...config(store), normalize: (key, value) => (key === "primary" ? (value as { body: unknown }).body : value) },
    memoryLocal(),
  );
  const { currentId: id } = await works.ensure("zh");
  await works.storeFor(id).save("primary", { body: [1], scroll: 0 });
  await works.saveAs(id, "A");
  const saved = await works.savedFingerprints(id);
  assert.equal(works.fingerprint("primary", { body: [1], scroll: 99 }), saved.get("primary"));
  assert.notEqual(works.fingerprint("primary", { body: [1, 2], scroll: 0 }), saved.get("primary"));
});

test("saved works from before saved copies existed get one from their live copy", async () => {
  const store = memoryStore();
  const works = createWorksStore(config(store), memoryLocal());
  const { currentId: id } = await works.ensure("zh");
  await works.storeFor(id).save("primary", { v: 3 });
  // An index written by the earlier release: saved, but no saved copy.
  await store.save("works:index", [{ id, name: "Old", saved: true, createdAt: 1, updatedAt: 1 }]);
  await works.ensure("zh");
  assert.deepEqual(await store.read(`saved:${id}:primary`), { v: 3 });
});
