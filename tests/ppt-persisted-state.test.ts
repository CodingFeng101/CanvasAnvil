import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterRecordByAllowedKeys,
  migrateLegacyTextlessVersions,
  normalizePersistedImageMap,
  normalizePersistedImageVersions,
  normalizePersistedRenderLayers,
  normalizePersistedSlideMaterials,
  normalizePersistedSlides,
  normalizePersistedStringArray,
  normalizePersistedStringMap,
  normalizePersistedUploadedTemplates,
  shouldInlinePersistImageUrl,
} from "../client/workspaces/ppt/canvas/lib/persisted-state";

/**
 * These readers stand between a user's saved deck and the workspace. Every one
 * of them is deliberately defensive: the stored shape has changed across
 * releases, and one malformed entry must not take a whole deck down.
 */

test("slides keep their fields and drop entries without an id", () => {
  const slides = normalizePersistedSlides([
    { id: "s1", title: "Cover", content: ["a", "b"], note: "n", layout: "title", description: "d" },
    { id: "s2" },
    { title: "no id" },
    null,
    "nonsense",
  ]);

  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0], {
    id: "s1",
    title: "Cover",
    content: ["a", "b"],
    note: "n",
    layout: "title",
    description: "d",
  });
  // A slide with only an id still loads, with empty defaults.
  assert.deepEqual(slides[1], {
    id: "s2",
    title: "",
    content: [],
    note: undefined,
    layout: undefined,
    description: undefined,
  });
});

test("slide content keeps only strings", () => {
  const [slide] = normalizePersistedSlides([{ id: "s1", content: ["ok", 42, null, "also ok"] }]);
  assert.deepEqual(slide.content, ["ok", "also ok"]);
});

test("non-array input yields no slides rather than throwing", () => {
  assert.deepEqual(normalizePersistedSlides(null), []);
  assert.deepEqual(normalizePersistedSlides({ id: "s1" }), []);
  assert.deepEqual(normalizePersistedSlides("[]"), []);
});

test("image maps keep only string-to-string pairs", () => {
  assert.deepEqual(
    normalizePersistedImageMap({ s1: "data:image/png;base64,x", s2: 42, s3: null }),
    { s1: "data:image/png;base64,x" },
  );
  assert.deepEqual(normalizePersistedImageMap(["not", "an", "object"]), {});
  assert.deepEqual(normalizePersistedImageMap(null), {});
});

test("image versions require id, url, timestamp and a known type", () => {
  const versions = normalizePersistedImageVersions({
    s1: [
      { id: "v1", url: "u", timestamp: 1, type: "generated" },
      { id: "v2", url: "u", timestamp: 2, type: "edited", instruction: "make it blue" },
      { id: "v3", url: "u", timestamp: 3, type: "unknown-type" },
      { id: "v4", url: "u", type: "generated" },
      { url: "u", timestamp: 5, type: "generated" },
    ],
    s2: "not an array",
  });

  assert.deepEqual(Object.keys(versions), ["s1"]);
  assert.deepEqual(versions.s1.map((v) => v.id), ["v1", "v2"]);
  assert.equal(versions.s1[1].instruction, "make it blue");
});

test("render layers derive their elements when none were stored", () => {
  const layers = normalizePersistedRenderLayers({
    s1: {
      v1: {
        backgroundImageUrl: "bg.png",
        textBlocks: [{ text: "Title", x: 0, y: 0, w: 1, h: 0.2 }],
      },
    },
  });

  assert.equal(layers.s1.v1.backgroundImageUrl, "bg.png");
  assert.equal(layers.s1.v1.status, "ready", "an unrecognised status defaults to ready");
  assert.ok(layers.s1.v1.elements.length > 0, "elements are derived from the text blocks");
});

test("render layers keep a pending or failed status", () => {
  const layers = normalizePersistedRenderLayers({
    s1: {
      v1: { backgroundImageUrl: "", textBlocks: [], status: "pending" },
      v2: { backgroundImageUrl: "", textBlocks: [], status: "failed", error: "boom" },
      v3: { backgroundImageUrl: "", textBlocks: [], status: "nonsense" },
    },
  });

  assert.equal(layers.s1.v1.status, "pending");
  assert.equal(layers.s1.v2.status, "failed");
  assert.equal(layers.s1.v2.error, "boom");
  assert.equal(layers.s1.v3.status, "ready");
});

test("string maps can require a non-blank value", () => {
  const input = { a: "x", b: "   ", c: 1 };
  assert.deepEqual(normalizePersistedStringMap(input), { a: "x", b: "   " });
  assert.deepEqual(normalizePersistedStringMap(input, true), { a: "x" });
});

test("filterRecordByAllowedKeys keeps only what still exists", () => {
  assert.deepEqual(
    filterRecordByAllowedKeys({ s1: 1, s2: 2, gone: 3 }, new Set(["s1", "s2"])),
    { s1: 1, s2: 2 },
  );
});

test("slide materials need id, name and dataUrl", () => {
  const materials = normalizePersistedSlideMaterials({
    s1: [
      { id: "m1", name: "logo", dataUrl: "data:image/png;base64,x", sourcePage: 2 },
      { id: "m2", name: "missing url" },
      { name: "missing id", dataUrl: "d" },
    ],
  });

  assert.equal(materials.s1.length, 1);
  assert.equal(materials.s1[0].fileName, "logo", "fileName falls back to name");
  assert.equal(materials.s1[0].sourcePage, 2);
});

test("uploaded templates and string arrays are coerced", () => {
  assert.deepEqual(
    normalizePersistedUploadedTemplates([{ id: "t1", name: "n", dataUrl: "d" }, { id: "t2" }]),
    [{ id: "t1", name: "n", dataUrl: "d" }],
  );
  assert.deepEqual(normalizePersistedStringArray(["a", 1, null]), ["a", "1", "null"]);
  assert.deepEqual(normalizePersistedStringArray("nope"), []);
});

test("only a blob or http URL needs inlining", () => {
  assert.equal(shouldInlinePersistImageUrl("blob:http://x/1"), true);
  assert.equal(shouldInlinePersistImageUrl("https://example.test/a.png"), true);
  assert.equal(shouldInlinePersistImageUrl("data:image/png;base64,x"), false);
  assert.equal(shouldInlinePersistImageUrl(""), false);
});

test("the textless migration folds a derived layer back onto its source", () => {
  // Older releases stored the text layer against a separate "derived_textless"
  // version. The migration moves those text blocks onto the source version and
  // drops the derived one, so the deck keeps its editable text.
  const migrated = migrateLegacyTextlessVersions({
    imageVersions: {
      s1: [
        { id: "v1", url: "bg.png", timestamp: 1, type: "generated" },
        { id: "v2", url: "textless.png", timestamp: 2, type: "derived_textless", sourceVersionId: "v1" },
      ],
    },
    renderLayers: {
      s1: {
        v1: { backgroundImageUrl: "bg.png", textBlocks: [], elements: [], status: "ready" },
        v2: {
          backgroundImageUrl: "textless.png",
          textBlocks: [{ text: "Title", x: 0, y: 0, w: 1, h: 0.2 }],
          elements: [],
          status: "ready",
        },
      },
    },
    currentImageVersionId: { s1: "v2" },
  });

  assert.deepEqual(migrated.imageVersions.s1.map((v: { id: string }) => v.id), ["v1"],
    "the derived version is gone");
  assert.equal(migrated.renderLayers.s1.v1.textBlocks.length, 1,
    "its text blocks moved onto the source version");
  assert.equal(migrated.currentImageVersionId.s1, "v1",
    "and the selection follows, rather than pointing at a version that no longer exists");
});

test("the migration leaves a deck without derived versions alone", () => {
  const state = {
    imageVersions: { s1: [{ id: "v1", url: "u", timestamp: 1, type: "generated" }] },
    renderLayers: { s1: { v1: { backgroundImageUrl: "u", textBlocks: [], elements: [], status: "ready" } } },
    currentImageVersionId: { s1: "v1" },
    somethingElse: "preserved",
  };

  const migrated = migrateLegacyTextlessVersions(state);
  assert.deepEqual(migrated.imageVersions, state.imageVersions);
  assert.equal(migrated.currentImageVersionId.s1, "v1");
  assert.equal(migrated.somethingElse, "preserved", "unrelated keys pass through");
});

test("the migration tolerates junk instead of throwing", () => {
  assert.equal(migrateLegacyTextlessVersions(null), null);
  assert.equal(migrateLegacyTextlessVersions("nonsense"), "nonsense");
  const migrated = migrateLegacyTextlessVersions({ imageVersions: "bad", renderLayers: [] });
  assert.deepEqual(migrated.imageVersions, {});
  assert.deepEqual(migrated.renderLayers, {});
});
