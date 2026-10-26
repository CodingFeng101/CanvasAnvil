import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { decodePng } from "./support/decode-png";
import { inkMask, measureTextBlocks, ringBackground } from "../client/workspaces/ppt/vision/text-measure";
import type { OcrBox } from "../client/workspaces/ppt/vision/types";

/**
 * The measurement chain against a real rendered slide.
 *
 * The fixture is a couple of megabytes and is deliberately not committed, so
 * these tests skip on a fresh checkout. To run them, drop a slide and the
 * reference text blocks read out of its editable deck into
 * `tests/fixtures/smart-campus/`:
 *
 *     source.png                 the rendered page
 *     reference-textblocks.json  { blocks: [{ text, x, y, w, h, fontSizePt,
 *                                             color, bold }] } in slide fractions
 *
 * These are not a bit-for-bit oracle. The reference geometry comes from an
 * exported deck, whose boxes carry the width slack PowerPoint needs, and the
 * reference sizes are round numbers where a measurement would carry decimals.
 * A strict field-by-field comparison has to wait until the OCR reader is in
 * place and can supply the tight boxes the chain is designed around.
 */

const ROOT = "tests/fixtures/smart-campus";
const IMAGE_PATH = `${ROOT}/source.png`;
const REFERENCE_PATH = `${ROOT}/reference-textblocks.json`;
const available = existsSync(IMAGE_PATH) && existsSync(REFERENCE_PATH);

interface ReferenceBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePt: number;
  color: string;
  bold: boolean;
}

const loadImage = () => decodePng(new Uint8Array(readFileSync(IMAGE_PATH)));
const loadReference = (): ReferenceBlock[] =>
  JSON.parse(readFileSync(REFERENCE_PATH, "utf8")).blocks;

test("the fixture slide decodes to the size its reference was measured against", { skip: !available }, () => {
  const image = loadImage();
  assert.ok(image.width > 0 && image.height > 0);
  assert.equal(image.data.length, image.width * image.height * 4);
  // A 16:9 page, which is what the 960x540pt slide basis assumes.
  assert.ok(Math.abs(image.width / image.height - 16 / 9) < 0.01);
});

test("a tight box reads white-on-blue as white; a padded one reads the badge", { skip: !available }, () => {
  // The contract behind the ring background: it means "the colour underneath
  // this text", and it only means that when the box bounds the text rather
  // than the shape the text sits on. OCR produces tight boxes; an exported
  // deck does not, because PowerPoint needs slack around a text frame.
  //
  // Pinned here because the failure is silent and inverted -- a white label
  // comes back as the colour of the badge behind it, which looks like a
  // plausible colour rather than like a bug.
  const image = loadImage();
  const badge = (box: Partial<OcrBox>): OcrBox => ({
    text: "01",
    confidence: 0.99,
    x: 119,
    y: 267,
    w: 50,
    h: 28,
    ...box,
  });

  const padded = badge({});
  const paddedRing = ringBackground(image, padded);
  const paddedInk = inkMask(image, padded, paddedRing);
  // Ring lands on the white card, so the blue disc becomes the "text".
  assert.ok(paddedRing[2] > 200, "padded ring should sample the white card");
  assert.ok(paddedInk.textColor[2] > paddedInk.textColor[0] + 100, "and read the disc as ink");

  const tight = badge({ x: 132, y: 271, w: 24, h: 20 });
  const tightRing = ringBackground(image, tight);
  const [measured] = measureTextBlocks(image, [tight], { slideId: "badge" });
  assert.ok(tightRing[2] > tightRing[0] + 100, "tight ring should sample the blue disc");
  assert.ok(measured, "the digits should measure");
  const channels = [1, 3, 5].map((i) => Number.parseInt(measured.color.slice(i, i + 2), 16));
  assert.ok(
    channels.every((channel) => channel > 220),
    `expected a white label, measured ${measured.color}`,
  );
});

test("every reference region yields a block, with sizes in the right neighbourhood", { skip: !available }, () => {
  const image = loadImage();
  const reference = loadReference();

  const boxes: OcrBox[] = reference.map((block) => ({
    text: block.text,
    confidence: 0.99,
    x: Math.round(block.x * image.width),
    y: Math.round(block.y * image.height),
    w: Math.round(block.w * image.width),
    h: Math.round(block.h * image.height),
  }));

  const measured = measureTextBlocks(image, boxes, { slideId: "sc" });
  assert.equal(measured.length, reference.length, "no region should read as empty");

  // Broad bounds on purpose. The reference boxes are padded, which inflates
  // what the chain has to work with, so this only catches a measurement that
  // has gone properly wrong -- an order of magnitude, or a sign error.
  const drifts = measured.map((block, index) =>
    Math.abs(block.fontSizePt - reference[index].fontSizePt) / reference[index].fontSizePt,
  );
  const withinHalf = drifts.filter((drift) => drift <= 0.5).length;
  assert.ok(
    withinHalf >= reference.length - 1,
    `expected nearly every size within 50%, got ${withinHalf}/${reference.length}`,
  );

  // Text sits inside the page, whatever else is true of it.
  for (const block of measured) {
    assert.ok(block.x >= 0 && block.y >= 0);
    assert.ok(block.x + block.w <= 1 + 1e-9);
    assert.ok(block.y + block.h <= 1 + 1e-9);
    assert.ok(block.fontSizePt > 0);
  }
});
