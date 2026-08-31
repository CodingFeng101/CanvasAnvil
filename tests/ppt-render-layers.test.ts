import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampTextBlockRect,
  resizeRectFromHandle,
  withTextBlocks,
  type RenderLayerMap,
} from "../client/workspaces/ppt/canvas/lib/render-layers";
import type { PptTextBlock } from "../client/workspaces/ppt/lib/ppt-service";

/**
 * The editable text layer over a rendered slide. `textBlocks` is what the
 * review UI edits and `elements` is what the exporter draws, so any mutation
 * that updates one without the other ships a deck that does not match what
 * the user was looking at.
 */

const block = (over: Partial<PptTextBlock> = {}): PptTextBlock =>
  ({
    id: "b1",
    text: "hello",
    role: "bullet",
    x: 0.1,
    y: 0.1,
    w: 0.3,
    h: 0.1,
    ...over,
  }) as PptTextBlock;

const layers = (blocks: PptTextBlock[]): RenderLayerMap => ({
  "slide-1": {
    v1: {
      backgroundImageUrl: "bg.png",
      textBlocks: blocks,
      elements: [],
      status: "ready",
    },
  },
});

test("a rewrite keeps elements in step with the blocks", () => {
  const next = withTextBlocks(layers([block()]), "slide-1", "v1", (blocks) =>
    blocks.map((b) => ({ ...b, text: "changed" })),
  );
  const layer = next["slide-1"].v1;
  assert.equal(layer.textBlocks[0].text, "changed");
  assert.equal(layer.elements.length, 1, "the exporter's copy was rebuilt too");
});

test("adding and removing blocks both flow through", () => {
  const added = withTextBlocks(layers([block()]), "slide-1", "v1", (blocks) => [
    ...blocks,
    block({ id: "b2" }),
  ]);
  assert.equal(added["slide-1"].v1.textBlocks.length, 2);

  const removed = withTextBlocks(added, "slide-1", "v1", (blocks) =>
    blocks.filter((b) => b.id !== "b1"),
  );
  assert.deepEqual(
    removed["slide-1"].v1.textBlocks.map((b) => b.id),
    ["b2"],
  );
});

test("a slide or version with no layer is left alone", () => {
  const before = layers([block()]);
  assert.equal(withTextBlocks(before, "slide-9", "v1", () => []), before);
  assert.equal(withTextBlocks(before, "slide-1", "v9", () => []), before);
});

test("other slides and versions are untouched by a rewrite", () => {
  const before: RenderLayerMap = {
    ...layers([block()]),
    "slide-2": { v1: { backgroundImageUrl: "b.png", textBlocks: [], elements: [], status: "ready" } },
  };
  before["slide-1"].v2 = { backgroundImageUrl: "old.png", textBlocks: [], elements: [], status: "ready" };

  const next = withTextBlocks(before, "slide-1", "v1", (blocks) => blocks);
  assert.equal(next["slide-2"], before["slide-2"], "a sibling slide keeps its identity");
  assert.equal(next["slide-1"].v2, before["slide-1"].v2, "a sibling version too");
});

test("the layer's other fields survive a rewrite", () => {
  const next = withTextBlocks(layers([block()]), "slide-1", "v1", (blocks) => blocks);
  assert.equal(next["slide-1"].v1.backgroundImageUrl, "bg.png");
  assert.equal(next["slide-1"].v1.status, "ready");
});

test("a dragged block cannot leave the slide", () => {
  const moved = clampTextBlockRect(block({ w: 0.3, h: 0.1 }), { x: 0.95, y: 0.99 });
  assert.equal(moved.x, 0.7, "stops where its right edge meets the slide edge");
  assert.equal(moved.y, 0.9);

  const back = clampTextBlockRect(block(), { x: -0.5, y: -0.5 });
  assert.equal(back.x, 0);
  assert.equal(back.y, 0);
});

test("a block cannot be resized past the slide", () => {
  const wide = clampTextBlockRect(block(), { w: 5, h: 5 });
  assert.equal(wide.w, 1);
  assert.equal(wide.h, 1);
  assert.equal(wide.x, 0, "and is pulled back into view");
});

test("a block cannot be shrunk out of reach, per role", () => {
  // Shrink to nothing and the user can never grab it again.
  assert.equal(clampTextBlockRect(block({ role: "title" }), { w: 0, h: 0 }).w, 0.18);
  assert.equal(clampTextBlockRect(block({ role: "title" }), { w: 0, h: 0 }).h, 0.08);
  assert.equal(clampTextBlockRect(block({ role: "tag" }), { w: 0, h: 0 }).w, 0.07);
  assert.equal(clampTextBlockRect(block({ role: "bullet" }), { w: 0, h: 0 }).w, 0.1);
  assert.equal(clampTextBlockRect(block({ role: "summary" }), { w: 0, h: 0 }).w, 0.1, "unknown roles get the default");
});

test("only the named edges move", () => {
  const moved = clampTextBlockRect(block({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }), { x: 0.5 });
  assert.equal(moved.x, 0.5);
  assert.equal(moved.y, 0.2);
  assert.equal(moved.w, 0.3);
  assert.equal(moved.h, 0.4);
});

test("clamping returns a new block rather than mutating", () => {
  const before = block();
  const after = clampTextBlockRect(before, { x: 0.5 });
  assert.notEqual(after, before);
  assert.equal(before.x, 0.1);
  assert.equal(after.text, "hello", "everything else is carried over");
});

/**
 * Resizing a text box by one of its eight handles. The compass letters say
 * which edges move; a west or north drag moves the origin too, which is where
 * the arithmetic stops being obvious.
 */

const rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

test("an east or south handle moves only the size", () => {
  assert.deepEqual(resizeRectFromHandle(rect, "e", 0.1, 0.1), { x: 0.2, y: 0.2, w: 0.5, h: 0.4 });
  assert.deepEqual(resizeRectFromHandle(rect, "s", 0.1, 0.1), { x: 0.2, y: 0.2, w: 0.4, h: 0.5 });
});

test("a west or north handle moves the origin as well", () => {
  const west = resizeRectFromHandle(rect, "w", 0.1, 0);
  assert.ok(Math.abs(west.x - 0.3) < 1e-9, `x ${west.x}`);
  assert.ok(Math.abs(west.w - 0.3) < 1e-9, "the right edge stays put");

  const north = resizeRectFromHandle(rect, "n", 0, 0.1);
  assert.ok(Math.abs(north.y - 0.3) < 1e-9);
  assert.ok(Math.abs(north.h - 0.3) < 1e-9, "the bottom edge stays put");
});

test("a corner handle moves both axes", () => {
  const nw = resizeRectFromHandle(rect, "nw", 0.1, 0.1);
  assert.ok(Math.abs(nw.x - 0.3) < 1e-9);
  assert.ok(Math.abs(nw.y - 0.3) < 1e-9);
  assert.ok(Math.abs(nw.w - 0.3) < 1e-9);
  assert.ok(Math.abs(nw.h - 0.3) < 1e-9);
});

test("a west drag past the minimum stops rather than sliding the box along", () => {
  // Without the origin compensation the right edge would keep following the
  // pointer and the whole box would travel across the slide.
  const squashed = resizeRectFromHandle(rect, "w", 0.5, 0);
  assert.equal(squashed.w, 0.05, "clamped to the floor");
  assert.ok(Math.abs(squashed.x - 0.55) < 1e-9, "the right edge stays at 0.6");
  assert.ok(Math.abs(squashed.x + squashed.w - 0.6) < 1e-9);
});

test("a north drag past the minimum keeps the bottom edge in place", () => {
  const squashed = resizeRectFromHandle(rect, "n", 0, 0.5);
  assert.equal(squashed.h, 0.04);
  assert.ok(Math.abs(squashed.y + squashed.h - 0.6) < 1e-9, "the bottom edge stays at 0.6");
});

test("an east drag past the minimum does not move the origin", () => {
  const squashed = resizeRectFromHandle(rect, "e", -0.5, 0);
  assert.equal(squashed.w, 0.05);
  assert.equal(squashed.x, 0.2, "the left edge is the anchor");
});

test("a zero drag returns the rectangle unchanged", () => {
  assert.deepEqual(resizeRectFromHandle(rect, "se", 0, 0), rect);
  assert.deepEqual(resizeRectFromHandle(rect, "nw", 0, 0), rect);
});
