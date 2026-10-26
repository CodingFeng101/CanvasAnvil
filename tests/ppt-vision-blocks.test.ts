import assert from "node:assert/strict";
import { test } from "node:test";
import { toPptTextBlocks } from "../client/workspaces/ppt/vision/extract-text";
import type { MeasuredTextBlock } from "../client/workspaces/ppt/vision/types";

/**
 * Measured blocks becoming the deck's own text blocks.
 *
 * The deck derives a lot from a block's role -- colour, weight, the font size
 * it guesses when none is given. All of that is guesswork standing in for a
 * measurement, so every field it would infer is written out here instead, and
 * these tests exist to keep it that way.
 */

const blockOf = (overrides: Partial<MeasuredTextBlock> = {}): MeasuredTextBlock => ({
  id: "b1",
  text: "文本",
  x: 0.1,
  y: 0.2,
  w: 0.3,
  h: 0.05,
  fontSizePt: 18,
  color: "#15285D",
  bold: false,
  italic: false,
  serif: false,
  script: "cjk",
  align: "left",
  bullet: false,
  confidence: 0.97,
  metrics: { strokePx: 2, strokeRatio: 0.1, strokeCv: 0.2, slant: 0 },
  ...overrides,
});

test("every style the renderer would infer from a role is written out instead", () => {
  const [block] = toPptTextBlocks([
    blockOf({ fontSizePt: 37, color: "#0B348F", bold: true, italic: true }),
  ]);

  assert.equal(block.style?.fontSize, 37);
  assert.equal(block.style?.color, "#0B348F");
  assert.equal(block.style?.fontWeight, 700);
  assert.equal(block.style?.fontStyle, "italic");
  assert.equal(block.style?.align, "left");
  assert.ok(block.style?.fontFamily);
});

test("the largest block on the page is the title", () => {
  const blocks = toPptTextBlocks([
    blockOf({ id: "a", fontSizePt: 37 }),
    blockOf({ id: "b", fontSizePt: 19 }),
    blockOf({ id: "c", fontSizePt: 15, bullet: true }),
  ]);

  assert.deepEqual(blocks.map((block) => block.role), ["title", "summary", "bullet"]);
});

test("a bulleted line stays a bullet even when it is the largest", () => {
  const blocks = toPptTextBlocks([blockOf({ fontSizePt: 40, bullet: true })]);
  assert.equal(blocks[0].role, "bullet");
});

test("CJK text does not inherit the export's latin default face", () => {
  // The export falls back to a latin face, which renders Chinese as boxes on
  // a machine without a fallback font. Script is measured, so it can choose.
  const [chinese] = toPptTextBlocks([blockOf({ script: "cjk" })]);
  assert.equal(chinese.style?.fontFamily, "Microsoft YaHei");

  const [sans] = toPptTextBlocks([blockOf({ script: "latin", serif: false })]);
  const [serif] = toPptTextBlocks([blockOf({ script: "latin", serif: true })]);
  assert.equal(sans.style?.fontFamily, "Arial");
  assert.equal(serif.style?.fontFamily, "Times New Roman");
});

test("geometry and identity pass through untouched", () => {
  const [block] = toPptTextBlocks([blockOf({ id: "slide-3_t7", x: 0.11, y: 0.22, w: 0.33, h: 0.04 })]);
  assert.equal(block.id, "slide-3_t7");
  assert.deepEqual(
    { x: block.x, y: block.y, w: block.w, h: block.h },
    { x: 0.11, y: 0.22, w: 0.33, h: 0.04 },
  );
});
