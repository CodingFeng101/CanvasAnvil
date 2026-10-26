import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundingBox,
  convexHull,
  minAreaRect,
  orderQuad,
  polygonArea,
  polygonPerimeter,
  componentOutlines,
  unclipQuad,
  type BinaryMap,
  type Point,
  type Quad,
} from "../client/workspaces/ppt/vision/geometry";
import {
  binarize,
  boxesFromProbabilityMap,
  polygonMeanScore,
} from "../client/workspaces/ppt/vision/det-postprocess";
import { isUsableReading, toOcrBoxes } from "../client/workspaces/ppt/vision/read-boxes";

/**
 * The detector's post-processing: probability map in, text boxes out.
 *
 * Box geometry matters more here than anywhere else in the chain, because
 * every measurement downstream is taken relative to the box. A box that is
 * merely close still measures the wrong background, and the ring background
 * inverts silently when it does.
 */

const mapFrom = (rows: string[]): BinaryMap => {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) data[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return { data, width, height };
};

const quadOf = (left: number, top: number, right: number, bottom: number): Quad => [
  { x: left, y: top },
  { x: right, y: top },
  { x: right, y: bottom },
  { x: left, y: bottom },
];

test("outlines come back one group per blob", () => {
  const two = mapFrom([
    "..........",
    ".###..###.",
    ".###..###.",
    ".###..###.",
    "..........",
  ]);
  assert.equal(componentOutlines(two).length, 2);
});

test("an outline covers the blob's rim and skips its interior", () => {
  const map = mapFrom([
    ".......",
    ".#####.",
    ".#####.",
    ".#####.",
    ".#####.",
    ".#####.",
    ".......",
  ]);
  const [outline] = componentOutlines(map);

  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  assert.equal(Math.min(...xs), 1);
  assert.equal(Math.max(...xs), 5);
  assert.equal(Math.min(...ys), 1);
  assert.equal(Math.max(...ys), 5);
  // Sixteen rim pixels of the twenty-five; the nine inside cannot widen the
  // hull, so carrying them would only slow it down.
  assert.equal(outline.length, 16);
});

test("blobs touching only at a corner are still one blob", () => {
  // Eight-connectivity, matching the labelling the measurement chain uses.
  const diagonal = mapFrom([
    "....",
    ".##.",
    "..##",
    "....",
  ]);
  assert.equal(componentOutlines(diagonal).length, 1);
});

test("the convex hull drops points inside it", () => {
  const hull = convexHull([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 5, y: 5 },
  ]);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((point) => point.x === 5 && point.y === 5));
});

test("minAreaRect beats the upright bound on a rotated box", () => {
  // A square turned 45 degrees. Its upright bounding box is twice the area;
  // a detector that used one would grow every slanted line into its
  // neighbours.
  const diamond: Point[] = [
    { x: 0, y: 10 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 20 },
  ];
  const rect = minAreaRect(diamond);
  assert.ok(rect);
  assert.ok(Math.abs(rect.width * rect.height - 200) < 1e-6, "should find the 200-unit square");
});

test("minAreaRect returns an upright box unchanged", () => {
  const rect = minAreaRect([
    { x: 2, y: 3 },
    { x: 12, y: 3 },
    { x: 12, y: 9 },
    { x: 2, y: 9 },
  ]);
  assert.ok(rect);
  assert.ok(Math.abs(Math.max(rect.width, rect.height) - 10) < 1e-9);
  assert.ok(Math.abs(Math.min(rect.width, rect.height) - 6) < 1e-9);
});

test("quad corners come back top-left, top-right, bottom-right, bottom-left", () => {
  const ordered = orderQuad([
    { x: 10, y: 8 },
    { x: 0, y: 8 },
    { x: 0, y: 2 },
    { x: 10, y: 2 },
  ]);
  assert.deepEqual(ordered, [
    { x: 0, y: 2 },
    { x: 10, y: 2 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ]);
});

test("unclip pushes every side out by the same distance, not proportionally", () => {
  // The failure this pins: scaling corners away from the centre grows a wide
  // box far more along its length than across it. A line of text is a very
  // wide box, so that version adds a huge horizontal margin and barely lifts
  // the top edge clear of the glyphs -- which is the edge that was clipping.
  const wide = quadOf(0, 0, 100, 10);
  const area = polygonArea(wide);
  const perimeter = polygonPerimeter(wide);
  const distance = (area * 1.6) / perimeter;

  const grown = unclipQuad(wide, 1.6);
  const xs = grown.map((point) => point.x);
  const ys = grown.map((point) => point.y);

  assert.ok(Math.abs(Math.min(...xs) - -distance) < 1e-9);
  assert.ok(Math.abs(Math.max(...xs) - (100 + distance)) < 1e-9);
  assert.ok(Math.abs(Math.min(...ys) - -distance) < 1e-9);
  assert.ok(Math.abs(Math.max(...ys) - (10 + distance)) < 1e-9);
});

test("binarize splits the map at the detector's threshold", () => {
  const probability = Float32Array.from([0.1, 0.29, 0.31, 0.9]);
  const map = binarize(probability, 4, 1, 0.3);
  assert.deepEqual(Array.from(map.data), [0, 0, 1, 1]);
});

test("the box score averages the probability inside the polygon", () => {
  const width = 10;
  const height = 10;
  const probability = new Float32Array(width * height);
  for (let y = 2; y < 8; y += 1) {
    for (let x = 2; x < 8; x += 1) probability[y * width + x] = 0.8;
  }

  const inside = polygonMeanScore(probability, width, height, quadOf(2, 2, 8, 8));
  assert.ok(Math.abs(inside - 0.8) < 1e-6);

  const straddling = polygonMeanScore(probability, width, height, quadOf(0, 0, 10, 10));
  assert.ok(straddling > 0 && straddling < 0.5, `expected a diluted score, got ${straddling}`);
});

test("a blob on the probability map becomes one box, scaled back to the page", () => {
  const mapWidth = 40;
  const mapHeight = 20;
  const probability = new Float32Array(mapWidth * mapHeight);
  for (let y = 6; y < 14; y += 1) {
    for (let x = 8; x < 32; x += 1) probability[y * mapWidth + x] = 0.9;
  }

  const boxes = boxesFromProbabilityMap(probability, mapWidth, mapHeight, {
    toWidth: mapWidth * 4,
    toHeight: mapHeight * 4,
  });

  assert.equal(boxes.length, 1);
  assert.ok(boxes[0].score > 0.8);

  // Grown past the binarised blob, and carried onto the four-times-larger page.
  const box = boundingBox(boxes[0].quad, mapWidth * 4, mapHeight * 4);
  assert.ok(box.x < 8 * 4, "the box should have grown left of the blob");
  assert.ok(box.x + box.w > 32 * 4, "and right of it");
  assert.ok(box.y < 6 * 4 && box.y + box.h > 14 * 4);
});

test("a faint blob is dropped rather than read", () => {
  const probability = new Float32Array(40 * 20);
  for (let y = 6; y < 14; y += 1) {
    for (let x = 8; x < 32; x += 1) probability[y * 40 + x] = 0.35;
  }
  // Over the binarisation threshold but under the box threshold.
  const boxes = boxesFromProbabilityMap(probability, 40, 20, { toWidth: 40, toHeight: 20 });
  assert.equal(boxes.length, 0);
});

const readingOf = (text: string, confidence: number, quad = quadOf(10, 10, 60, 30)) => ({
  text,
  confidence,
  quad,
});

test("a short low-confidence string is dropped as a misread icon", () => {
  assert.equal(isUsableReading(readingOf("数据平台", 0.98)), true);
  assert.equal(isUsableReading(readingOf("门", 0.98)), true);
  // Two characters below the short-string bar.
  assert.equal(isUsableReading(readingOf("Al", 0.6)), false);
  // The same two characters, read confidently, survive -- "01" markers must.
  assert.equal(isUsableReading(readingOf("01", 0.95)), true);
});

test("a lone latin character needs near-certainty; a lone CJK one does not", () => {
  assert.equal(isUsableReading(readingOf("x", 0.85)), false);
  assert.equal(isUsableReading(readingOf("x", 0.95)), true);
  assert.equal(isUsableReading(readingOf("中", 0.8)), true);
});

test("a slanted line is left in the background rather than boxed upright", () => {
  const level = quadOf(10, 10, 60, 30);
  assert.equal(isUsableReading(readingOf("平的一行", 0.99, level)), true);

  // Top edge dropping by more than 45% of the box height: 20 against a
  // threshold of 18. A gentler lean than this is kept and rebuilt upright,
  // which is the intended trade.
  const slanted: Quad = [
    { x: 10, y: 10 },
    { x: 60, y: 30 },
    { x: 60, y: 50 },
    { x: 10, y: 30 },
  ];
  assert.equal(isUsableReading(readingOf("斜的一行", 0.99, slanted)), false);
});

test("readings become upright boxes for the measurement chain", () => {
  const [box] = toOcrBoxes([readingOf("标题", 0.97, quadOf(10.6, 20.2, 61.4, 44.8))]);
  assert.deepEqual(box, { text: "标题", confidence: 0.97, x: 10, y: 20, w: 51, h: 25 });
});
