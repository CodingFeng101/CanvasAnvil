import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alphaBounds,
  buildMontage,
  cropImage,
  findBlobs,
  hexToRgb,
  inspectEdges,
  keyToAlpha,
  sliceAsset,
} from "../client/workspaces/ppt/vision/sheets";
import { closeSquare, createMask, dilateSquare, erodeSquare, maskSum } from "../client/workspaces/ppt/vision/morphology";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * Turning a cleaned asset sheet back into cut-out drawings.
 *
 * Two failures here are invisible in a list of thumbnails and obvious on the
 * page: a coloured halo left by the key colour's blend rim, and a drawing cut
 * off at its own crop edge. Both are pinned below.
 */

const KEY = "#FF00FF";

const filled = (width: number, height: number, colour: [number, number, number], alpha = 255): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = alpha;
  }
  return { data, width, height };
};

const paint = (
  image: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
  colour: [number, number, number],
  alpha = 255,
) => {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const at = (y * image.width + x) * 4;
      image.data[at] = colour[0];
      image.data[at + 1] = colour[1];
      image.data[at + 2] = colour[2];
      image.data[at + 3] = alpha;
    }
  }
};

test("hex parsing takes both the long and the short form", () => {
  assert.deepEqual(hexToRgb("#FF00FF"), [255, 0, 255]);
  assert.deepEqual(hexToRgb("f0f"), [255, 0, 255]);
});

test("keying drops the key colour and keeps the drawing", () => {
  const sheet = filled(40, 40, [255, 0, 255]);
  paint(sheet, { x: 12, y: 12, w: 16, h: 16 }, [18, 103, 230]);

  const keyed = keyToAlpha(sheet, KEY);
  assert.equal(keyed.data[(20 * 40 + 20) * 4 + 3], 255, "the drawing stays");
  assert.equal(keyed.data[3], 0, "the key colour goes");
});

test("the key colour's blend rim goes too, so no halo is left behind", () => {
  // A drawing with one ring of half-blended pixels around it -- exactly what
  // an anti-aliased edge against the key colour looks like. It survives the
  // distance test, and left in place it renders as a magenta fringe.
  const sheet = filled(40, 40, [255, 0, 255]);
  paint(sheet, { x: 11, y: 11, w: 18, h: 18 }, [137, 52, 243]);
  paint(sheet, { x: 12, y: 12, w: 16, h: 16 }, [18, 103, 230]);

  const keyed = keyToAlpha(sheet, KEY);
  // The rim pixel is transparent; the body is not.
  assert.equal(keyed.data[(11 * 40 + 20) * 4 + 3], 0, "the blend rim is dropped");
  assert.equal(keyed.data[(20 * 40 + 20) * 4 + 3], 255);
});

test("a hairline keeps its rim rather than lose its body", () => {
  // Eroding a one-pixel stroke removes all of it. Keeping the halo is the
  // lesser harm, so the trim is abandoned when it would eat the drawing.
  const sheet = filled(40, 40, [255, 0, 255]);
  for (let y = 6; y < 34; y += 1) paint(sheet, { x: 20, y, w: 1, h: 1 }, [18, 103, 230]);

  const keyed = keyToAlpha(sheet, KEY);
  const bounds = alphaBounds(keyed);
  assert.ok(bounds, "the stroke must survive");
  assert.ok(bounds!.h > 20, `expected the whole stroke, kept ${bounds!.h}px`);
});

test("edges report which sides a drawing runs off", () => {
  const clear = filled(20, 20, [0, 0, 0], 0);
  paint(clear, { x: 6, y: 6, w: 8, h: 8 }, [255, 255, 255]);
  assert.deepEqual(inspectEdges(clear).touched, []);

  const truncated = filled(20, 20, [0, 0, 0], 0);
  paint(truncated, { x: 0, y: 6, w: 10, h: 8 }, [255, 255, 255]);
  assert.deepEqual(inspectEdges(truncated).touched, ["left"]);
});

test("a montage lays crops onto the key colour with room around them", () => {
  const crops = [filled(30, 30, [255, 0, 0]), filled(30, 30, [0, 255, 0]), filled(30, 30, [0, 0, 255])];
  const { sheet, columns, rows } = buildMontage(crops, KEY, 2, 100);

  assert.equal(columns, 2);
  assert.equal(rows, 2);
  assert.equal(sheet.width, 200);
  assert.equal(sheet.height, 200);
  // The gap between cells is still key colour, which is what makes the
  // cleaned sheet cuttable by finding blobs.
  const corner = (99 * 200 + 99) * 4;
  assert.deepEqual(
    [sheet.data[corner], sheet.data[corner + 1], sheet.data[corner + 2]],
    [255, 0, 255],
  );
});

test("items are found on the sheet rather than assumed from the grid", () => {
  // An image model asked for four items in a two-wide grid will happily
  // leave a cell empty. Slicing by index then cuts background for everything
  // after the gap.
  const sheet = filled(200, 200, [255, 0, 255]);
  paint(sheet, { x: 20, y: 20, w: 50, h: 50 }, [18, 103, 230]);
  paint(sheet, { x: 130, y: 20, w: 50, h: 50 }, [220, 40, 40]);
  // Third cell left empty; the fourth is used instead.
  paint(sheet, { x: 130, y: 130, w: 50, h: 50 }, [30, 160, 90]);

  const blobs = findBlobs(keyToAlpha(sheet, KEY));
  assert.equal(blobs.length, 3);
  // Reading order, banded into rows.
  assert.ok(blobs[0].y < 100 && blobs[1].y < 100);
  assert.ok(blobs[0].x < blobs[1].x);
  assert.ok(blobs[2].y > 100);
});

const badge = (glyphRadius: number): RgbaImage => {
  // A ring with a glyph inside it: two runs of pixels that never touch, and
  // one icon.
  const sheet = filled(200, 200, [255, 0, 255]);
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 200; x += 1) {
      const distance = Math.hypot(x - 99.5, y - 99.5);
      const onRing = distance <= 60 && distance >= 48;
      const inGlyph = distance <= glyphRadius;
      if (onRing || inGlyph) paint(sheet, { x, y, w: 1, h: 1 }, [18, 103, 230]);
    }
  }
  return sheet;
};

test("the closing pass joins the parts of one drawing", () => {
  // A badge's glyph nearly fills the ring's hole, and closing bridges the few
  // pixels between them. Without it they cut as two assets and the icon
  // arrives on the page in halves.
  assert.equal(findBlobs(keyToAlpha(badge(42), KEY)).length, 1);
});

test("closing reaches as far as its kernel and no further", () => {
  // The kernel is a share of the sheet's short side, so what counts as "one
  // drawing" scales with the sheet rather than being fixed in pixels. A glyph
  // marooned in the middle of a large hole really is a separate blob.
  assert.equal(findBlobs(keyToAlpha(badge(12), KEY)).length, 2);
});

test("morphological closing grows nothing overall", () => {
  const mask = createMask(40, 40);
  for (let y = 10; y < 30; y += 1) {
    for (let x = 10; x < 30; x += 1) mask.data[y * 40 + x] = 1;
  }
  const closed = closeSquare(mask, 5);
  assert.equal(maskSum(closed), maskSum(mask), "a solid block is unchanged");

  assert.ok(maskSum(dilateSquare(mask, 5)) > maskSum(mask));
  assert.ok(maskSum(erodeSquare(mask, 5)) < maskSum(mask));
});

test("a slice grows its box before cutting, not after", () => {
  const sheet = filled(120, 120, [255, 0, 255]);
  paint(sheet, { x: 40, y: 40, w: 40, h: 20 }, [18, 103, 230]);

  const sliced = sliceAsset(keyToAlpha(sheet, KEY), { x: 40, y: 40, w: 40, h: 20 }, 8);
  assert.ok(sliced);
  assert.equal(sliced!.image.width, 40 + 16);
  assert.equal(sliced!.image.height, 20 + 16);
  assert.deepEqual(sliced!.truncated, [], "the drawing sits clear of its own edges");
});

test("a tight blob box is padded, so it does not read as truncated", () => {
  // The bug this pins: blob boxes are the exact bounds of a drawing, so
  // cutting one as given makes every single asset touch all four of its own
  // edges. Every icon on every sheet then reports as clipped, and the warning
  // that is supposed to catch a genuinely clipped one means nothing.
  const sheet = filled(120, 120, [255, 0, 255]);
  paint(sheet, { x: 40, y: 40, w: 40, h: 20 }, [18, 103, 230]);
  const keyed = keyToAlpha(sheet, KEY);

  const [blob] = findBlobs(keyed);
  assert.deepEqual(sliceAsset(keyed, blob, 8)!.truncated, []);
  assert.equal(sliceAsset(keyed, blob, 0)!.truncated.length, 4, "with no padding, all four");
});

test("a slice that is opaque everywhere reports it", () => {
  // The key colour did not survive the round trip, so nothing was made
  // transparent and the drawing would ship with its background attached.
  const opaque = filled(60, 60, [18, 103, 230]);
  const sliced = sliceAsset(keyToAlpha(opaque, KEY), { x: 0, y: 0, w: 60, h: 60 }, 0);
  assert.ok(sliced);
  assert.ok(sliced!.coverage > 0.92, `coverage was ${sliced!.coverage}`);
});

test("a drawing running off the sheet still says so once padded", () => {
  // Widening the crop cannot help here -- the drawing runs off the sheet
  // itself -- so the caller has to know to redraw it rather than quietly
  // ship a clipped icon.
  const sheet = filled(120, 120, [255, 0, 255]);
  paint(sheet, { x: 0, y: 40, w: 60, h: 20 }, [18, 103, 230]);

  const sliced = sliceAsset(keyToAlpha(sheet, KEY), { x: 0, y: 40, w: 60, h: 20 }, 8);
  assert.ok(sliced);
  assert.ok(sliced!.truncated.includes("left"), `expected a left truncation, got ${sliced!.truncated}`);
});

test("an empty slice is refused rather than returned blank", () => {
  const empty = filled(60, 60, [255, 0, 255]);
  assert.equal(sliceAsset(keyToAlpha(empty, KEY), { x: 0, y: 0, w: 60, h: 60 }), null);
});

test("cropping keeps alpha along with colour", () => {
  const image = filled(20, 20, [10, 20, 30], 0);
  paint(image, { x: 5, y: 5, w: 5, h: 5 }, [200, 100, 50], 255);
  const cut = cropImage(image, { x: 5, y: 5, w: 5, h: 5 });
  assert.equal(cut.width, 5);
  assert.equal(cut.data[3], 255);
});
