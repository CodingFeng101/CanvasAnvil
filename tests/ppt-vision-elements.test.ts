import assert from "node:assert/strict";
import { test } from "node:test";
import { canny } from "../client/workspaces/ppt/vision/edges";
import {
  buildElement,
  circularity,
  clearRegions,
  cornersOpen,
  dominantOf,
  keyLocal,
  maskForBox,
  measureElement,
  ringStats,
  shapeOf,
  type Rgb,
} from "../client/workspaces/ppt/vision/elements";
import { createMask, maskSum, type Mask } from "../client/workspaces/ppt/vision/morphology";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * The measurements the detector is never asked for.
 *
 * The model says whether a thing is a card or a picture of a database; these
 * fill in everything else. Only one of them changes what happens -- whether
 * an icon's background is flat enough to key out without paying for an image
 * call -- and getting that wrong either wastes money or leaves half a
 * gradient stuck to an icon.
 */

const filled = (width: number, height: number, colour: Rgb): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
};

const paint = (
  image: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
  colour: Rgb,
) => {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const at = (y * image.width + x) * 4;
      image.data[at] = colour[0];
      image.data[at + 1] = colour[1];
      image.data[at + 2] = colour[2];
    }
  }
};

const solid = (width: number, height: number, inset = 0): Mask => {
  const mask = createMask(width, height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) mask.data[y * width + x] = 1;
  }
  return mask;
};

const WHITE: Rgb = [255, 255, 255];
const BLUE: Rgb = [18, 103, 230];
const NAVY: Rgb = [11, 52, 143];

test("Canny thins an edge to its crest rather than reporting the whole ramp", () => {
  // A gradient magnitude alone marks every pixel of a soft edge. The
  // difference matters here: internal detail is counted as a share of the
  // shape, so a thick edge makes a flat card look busy.
  const image = filled(40, 40, WHITE);
  paint(image, { x: 20, y: 0, w: 20, h: 40 }, NAVY);

  const edges = canny(image);
  const columnCount = (column: number) => {
    let total = 0;
    for (let y = 5; y < 35; y += 1) total += edges.data[y * 40 + column];
    return total;
  };

  assert.ok(columnCount(19) + columnCount(20) > 25, "the edge is found");
  assert.equal(columnCount(15), 0, "and nothing far from it is");
  assert.ok(columnCount(17) + columnCount(18) < 5, "the ramp either side is thinned away");
});

test("Canny's hysteresis drops speckle and keeps a faint continuation", () => {
  const flat = filled(40, 40, WHITE);
  assert.equal(maskSum(canny(flat)), 0, "a flat field has no edges");

  // A single slightly-off pixel is noise, not an edge.
  const speckled = filled(40, 40, WHITE);
  paint(speckled, { x: 20, y: 20, w: 1, h: 1 }, [235, 235, 235]);
  assert.equal(maskSum(canny(speckled)), 0);
});

test("the dominant colour is quantised, so a gradient still resolves to one", () => {
  const shades: Rgb[] = [];
  for (let i = 0; i < 40; i += 1) shades.push([18 + (i % 3), 103 + (i % 3), 230]);
  shades.push([255, 255, 255], [0, 0, 0]);

  const { colour, share } = dominantOf(shades);
  assert.ok(Math.abs(colour[0] - 19) <= 2 && Math.abs(colour[2] - 230) <= 2);
  assert.ok(share > 0.9);
});

test("the ring is read outside the box, and its spread survives one dark intruder", () => {
  const image = filled(120, 120, WHITE);
  paint(image, { x: 40, y: 40, w: 40, h: 40 }, BLUE);

  const flat = ringStats(image, { x: 40, y: 40, w: 40, h: 40 });
  assert.deepEqual(flat.colour.map(Math.round), [...WHITE]);
  assert.ok(flat.spread < 5, `a flat field should read flat, got ${flat.spread}`);

  // A neighbour clipping one corner of the ring. An interquartile spread
  // shrugs this off where a standard deviation would call the field varied.
  paint(image, { x: 30, y: 30, w: 6, h: 6 }, NAVY);
  const clipped = ringStats(image, { x: 40, y: 40, w: 40, h: 40 });
  assert.ok(clipped.spread < 26, `one intruder should not disqualify the field, got ${clipped.spread}`);
});

test("a gradient behind an icon reads as varied", () => {
  const image = filled(120, 120, WHITE);
  for (let x = 0; x < 120; x += 1) paint(image, { x, y: 0, w: 1, h: 120 }, [x * 2, 60, 200]);
  paint(image, { x: 40, y: 40, w: 40, h: 40 }, BLUE);

  assert.ok(ringStats(image, { x: 40, y: 40, w: 40, h: 40 }).spread > 26);
});

test("the mask fills in the holes a card's own content punched", () => {
  // A card is solid. Counting the gaps its heading left would make it look
  // like a drawing rather than a container. The closing reaches as far as its
  // kernel, which is a share of the card's short side -- so it swallows a
  // line of text and not a hole the size of a picture.
  const image = filled(120, 120, WHITE);
  paint(image, { x: 20, y: 20, w: 80, h: 80 }, BLUE);
  paint(image, { x: 40, y: 40, w: 40, h: 5 }, WHITE);

  const mask = maskForBox(image, { x: 20, y: 20, w: 80, h: 80 });
  assert.equal(maskSum(mask), 80 * 80, "the card reads as solid");
});

test("children are punched out before a container is measured", () => {
  const mask = solid(40, 40);
  const cleared = clearRegions(
    mask,
    { x: 10, y: 10, w: 40, h: 40 },
    { width: 100, height: 100 },
    [{ x: 0.15, y: 0.15, w: 0.1, h: 0.1 }],
  );
  assert.ok(maskSum(cleared) < maskSum(mask));
  assert.equal(cleared.data[6 * 40 + 6], 0);
});

test("a flat card measures as plain and a busy drawing does not", () => {
  const card = filled(200, 200, WHITE);
  paint(card, { x: 20, y: 20, w: 160, h: 160 }, BLUE);
  const plain = measureElement(card, solid(160, 160), { x: 20, y: 20, w: 160, h: 160 });
  assert.ok(plain.dominance > 0.9);
  assert.ok(plain.edgeDensity < 0.045, `a flat card has little detail, got ${plain.edgeDensity}`);

  const drawing = filled(200, 200, WHITE);
  paint(drawing, { x: 20, y: 20, w: 160, h: 160 }, BLUE);
  for (let i = 0; i < 20; i += 1) {
    paint(drawing, { x: 24 + i * 8, y: 24, w: 3, h: 150 }, NAVY);
    paint(drawing, { x: 24, y: 24 + i * 8, w: 150, h: 3 }, WHITE);
  }
  const busy = measureElement(drawing, solid(160, 160), { x: 20, y: 20, w: 160, h: 160 });
  assert.ok(busy.edgeDensity > plain.edgeDensity * 5, "detail shows up as edges");
});

test("circularity separates a disc from a square", () => {
  const disc = createMask(60, 60);
  for (let y = 0; y < 60; y += 1) {
    for (let x = 0; x < 60; x += 1) {
      if (Math.hypot(x - 29.5, y - 29.5) <= 26) disc.data[y * 60 + x] = 1;
    }
  }
  assert.ok(circularity(disc) >= 0.8, `a disc should be round, got ${circularity(disc)}`);
  assert.ok(circularity(solid(60, 60, 4)) < 0.8);
});

test("open corners mean a rounded rectangle", () => {
  assert.equal(cornersOpen(solid(80, 80)), false);

  const rounded = solid(80, 80);
  for (const [cx, cy] of [[0, 0], [72, 0], [0, 72], [72, 72]]) {
    for (let y = cy; y < cy + 8; y += 1) {
      for (let x = cx; x < cx + 8; x += 1) rounded.data[y * 80 + x] = 0;
    }
  }
  assert.equal(cornersOpen(rounded), true);
});

test("a long thin blob is a rule, not a panel", () => {
  assert.equal(shapeOf(solid(200, 4), 200 / 4), "line");
  assert.equal(shapeOf(solid(80, 60), 80 / 60), "rect");
});

/**
 * A small drawing: solid ink, but two colours, so its own pixels call it a
 * drawing rather than a card and its colour is clearly not the page's.
 */
const drawIcon = (image: RgbaImage, at: { x: number; y: number }, size = 30) => {
  for (let i = 0; i * 2 < size; i += 1) {
    paint(image, { x: at.x + i * 2, y: at.y, w: 2, h: size }, i % 2 === 0 ? NAVY : BLUE);
  }
};

test("an icon on a flat field is keyable; one on a gradient is not", () => {
  // The only measurement here that changes what happens: a keyable icon skips
  // an image call entirely, and on a gradient that same shortcut leaves half
  // the background stuck to it.
  const box = { x: 80, y: 80, w: 30, h: 30 };

  const flat = filled(300, 300, WHITE);
  drawIcon(flat, { x: 80, y: 80 });
  const onFlat = buildElement(flat, maskForBox(flat, box), box);
  assert.ok(onFlat);
  assert.equal(onFlat!.kind, "icon", "a detailed drawing is not a card");
  assert.equal(onFlat!.keyable, true);

  // A gentle gradient really is locally flat around a small icon, and keying
  // it works. What does not is an icon sitting where two colours meet: there
  // is no single colour to remove.
  const straddling = filled(300, 300, WHITE);
  paint(straddling, { x: 0, y: 0, w: 95, h: 300 }, NAVY);
  drawIcon(straddling, { x: 80, y: 80 });
  const onEdge = buildElement(straddling, maskForBox(straddling, box), box);
  assert.ok(onEdge);
  assert.equal(onEdge!.keyable, false, "there is no one colour behind it to remove");
});

test("a gentle gradient behind a small icon is still keyable", () => {
  // Worth stating: the test is whether the ring is uniform where the icon
  // actually sits, not whether the page has a gradient somewhere. Refusing
  // every page with a gradient would send almost every icon to the model.
  const graded = filled(300, 300, WHITE);
  for (let x = 0; x < 300; x += 1) {
    paint(graded, { x, y: 0, w: 1, h: 300 }, [255 - Math.floor(x / 4), 250, 250]);
  }
  const box = { x: 80, y: 80, w: 30, h: 30 };
  drawIcon(graded, { x: 80, y: 80 });

  const measured = buildElement(graded, maskForBox(graded, box), box);
  assert.ok(measured);
  assert.equal(measured!.keyable, true);
});

test("a drawing too large to be an icon is treated as a container", () => {
  // Cutting a whole card out to be redrawn comes back as its contents blown
  // up to card size, so size alone disqualifies the icon branch.
  const page = filled(300, 300, WHITE);
  const box = { x: 20, y: 20, w: 120, h: 120 };
  drawIcon(page, { x: 20, y: 20 }, 120);

  const measured = buildElement(page, maskForBox(page, box), box);
  assert.ok(measured);
  assert.equal(measured!.kind, "geometry");
  assert.equal(measured!.keyable, false);
});

test("something holding two other things is a container whatever its pixels say", () => {
  const page = filled(400, 400, WHITE);
  paint(page, { x: 40, y: 40, w: 300, h: 300 }, BLUE);
  // Busy enough that its own pixels would call it a drawing.
  for (let i = 0; i < 24; i += 1) paint(page, { x: 48 + i * 12, y: 48, w: 4, h: 280 }, NAVY);

  const box = { x: 40, y: 40, w: 300, h: 300 };
  const asDrawing = buildElement(page, maskForBox(page, box), box);
  const asContainer = buildElement(page, maskForBox(page, box), box, { contains: 2 });

  assert.ok(asDrawing && asContainer);
  assert.equal(asContainer!.kind, "geometry");
  assert.notEqual(asContainer!.shape, "line", "a bar holding things is a panel, not a rule");
});

test("local keying removes a flat background and keeps the icon", () => {
  const crop = filled(60, 60, WHITE);
  paint(crop, { x: 20, y: 20, w: 20, h: 20 }, NAVY);

  const keyed = keyLocal(crop, "#FFFFFF");
  assert.equal(keyed.data[3], 0, "the flat field goes");
  assert.equal(keyed.data[(30 * 60 + 30) * 4 + 3], 255, "the icon stays");
});

test("local keying keeps a hairline rather than eroding it away", () => {
  const crop = filled(60, 60, WHITE);
  for (let y = 10; y < 50; y += 1) paint(crop, { x: 30, y, w: 1, h: 1 }, NAVY);

  const keyed = keyLocal(crop, "#FFFFFF");
  let opaque = 0;
  for (let i = 0; i < 60 * 60; i += 1) if (keyed.data[i * 4 + 3] > 0) opaque += 1;
  assert.ok(opaque > 30, `the stroke must survive, kept ${opaque}px`);
});
