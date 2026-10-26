import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aroundColour,
  bodyColour,
  dominantColour,
  edgeColour,
  findHeader,
  inkColour,
  isRounded,
  offBlend,
  refinePanel,
  snapEdge,
  type Rgb,
} from "../client/workspaces/ppt/vision/panels";
import { sobelMagnitudes } from "../client/workspaces/ppt/vision/morphology";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * Panel measurement: where a card really is, and what colour it really is.
 *
 * Which measurement to trust is decided by the shape, never by the answer.
 * Picking by the answer -- "that came out the same colour as the page, so it
 * must be wrong" -- makes four identical cards come out two white and two
 * blue depending on which side of a threshold each one landed, so the three
 * strategies are pinned here against the cases that separate them.
 */

const blank = (width: number, height: number, colour: Rgb): RgbaImage => {
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
  box: { x: number; y: number; w: number; h: number },
  colour: Rgb,
) => {
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const at = (y * image.width + x) * 4;
      image.data[at] = colour[0];
      image.data[at + 1] = colour[1];
      image.data[at + 2] = colour[2];
      image.data[at + 3] = 255;
    }
  }
};

const WHITE: Rgb = [255, 255, 255];
const PAGE: Rgb = [248, 250, 253];
const BLUE: Rgb = [18, 103, 230];
const NAVY: Rgb = [11, 52, 143];

test("the dominant colour survives content drawn all over a panel", () => {
  // A card with text and an icon on it. The mode is the only measurement that
  // still answers with the card.
  const image = blank(200, 200, PAGE);
  paint(image, { x: 20, y: 20, w: 160, h: 160 }, WHITE);
  paint(image, { x: 40, y: 40, w: 100, h: 20 }, NAVY);
  paint(image, { x: 40, y: 80, w: 60, h: 60 }, BLUE);

  const { colour, share } = dominantColour(image, { x: 20, y: 20, w: 160, h: 160 });
  assert.deepEqual(colour.map(Math.round), [...WHITE]);
  assert.ok(share > 0.5);
});

test("a badge is measured by the ring inside it, not by its box", () => {
  // A blue disc with a white number on it, on a white card. The ring at
  // 28-44% clears the number in the middle and the edge on the way out.
  const image = blank(120, 120, WHITE);
  for (let y = 0; y < 120; y += 1) {
    for (let x = 0; x < 120; x += 1) {
      if (Math.hypot(x - 59.5, y - 59.5) <= 50) paint(image, { x, y, w: 1, h: 1 }, BLUE);
    }
  }
  paint(image, { x: 45, y: 45, w: 30, h: 30 }, WHITE);

  const body = bodyColour(image, { x: 10, y: 10, w: 100, h: 100 });
  assert.ok(body, "a disc should have a body colour");
  assert.deepEqual(body!.map(Math.round), [...BLUE]);
});

test("a thin shape is measured by its ink, not by the page around it", () => {
  // An arrow covering a tenth of its box. The mode would answer white, and
  // the arrow would then render invisibly.
  const image = blank(100, 100, WHITE);
  paint(image, { x: 20, y: 46, w: 60, h: 8 }, BLUE);

  const box = { x: 15, y: 25, w: 70, h: 50 };
  const page = aroundColour(image, box);
  assert.ok(page);
  assert.deepEqual(dominantColour(image, box).colour.map(Math.round), [...WHITE]);
  assert.deepEqual(inkColour(image, box, page!)!.map(Math.round), [...BLUE]);
});

test("ink is refused when there is too much or too little of it", () => {
  const image = blank(100, 100, WHITE);
  const box = { x: 10, y: 10, w: 80, h: 80 };
  const page = aroundColour(image, box)!;

  // Nothing drawn at all.
  assert.equal(inkColour(image, box, page), null);
  // A solid block is not a thin shape; measuring it this way would be luck.
  paint(image, { x: 10, y: 10, w: 80, h: 80 }, BLUE);
  assert.equal(inkColour(image, box, page), null);
});

test("an anti-aliased edge is a blend, and a drawn border is not", () => {
  const fill: Rgb = [255, 255, 255];
  const page: Rgb = [0, 0, 0];

  // Halfway between the two: exactly what a soft edge looks like.
  assert.ok(offBlend([128, 128, 128], fill, page) < 6);
  // The same distance from the fill, but off the line: a real border.
  assert.ok(offBlend([128, 0, 255], fill, page) > 200);
});

test("a border is sampled on the boundary, not a safe distance inside it", () => {
  // A white card on a near-white page, held together by a one-pixel line.
  // Sampling two pixels in reports the fill back as its own border.
  const image = blank(120, 120, PAGE);
  paint(image, { x: 20, y: 20, w: 80, h: 80 }, WHITE);
  for (let x = 20; x < 100; x += 1) {
    paint(image, { x, y: 20, w: 1, h: 1 }, BLUE);
    paint(image, { x, y: 99, w: 1, h: 1 }, BLUE);
  }
  for (let y = 20; y < 100; y += 1) {
    paint(image, { x: 20, y, w: 1, h: 1 }, BLUE);
    paint(image, { x: 99, y, w: 1, h: 1 }, BLUE);
  }

  const found = edgeColour(image, { x: 20, y: 20, w: 80, h: 80 }, WHITE);
  assert.ok(found);
  assert.ok(
    Math.abs(found![2] - BLUE[2]) < 40,
    `expected the drawn line, measured ${found}`,
  );
});

test("square corners read as square and cut ones as rounded", () => {
  const square = blank(120, 120, PAGE);
  paint(square, { x: 20, y: 20, w: 80, h: 80 }, BLUE);
  assert.equal(isRounded(square, { x: 20, y: 20, w: 80, h: 80 }, BLUE), false);

  const rounded = blank(120, 120, PAGE);
  paint(rounded, { x: 20, y: 20, w: 80, h: 80 }, BLUE);
  // Cut each corner back to the page.
  for (const [cx, cy] of [[20, 20], [92, 20], [20, 92], [92, 92]]) {
    paint(rounded, { x: cx, y: cy, w: 8, h: 8 }, PAGE);
  }
  assert.equal(isRounded(rounded, { x: 20, y: 20, w: 80, h: 80 }, BLUE), true);
});

test("a header bar is found, and a plain panel has none", () => {
  const image = blank(200, 200, PAGE);
  paint(image, { x: 20, y: 20, w: 160, h: 160 }, WHITE);
  paint(image, { x: 20, y: 20, w: 160, h: 30 }, NAVY);

  const header = findHeader(image, { x: 20, y: 20, w: 160, h: 160 }, WHITE);
  assert.ok(header, "a solid bar across the top is a header");
  assert.ok(header!.h > 0.1 && header!.h < 0.2);

  const plain = blank(200, 200, PAGE);
  paint(plain, { x: 20, y: 20, w: 160, h: 160 }, WHITE);
  assert.equal(findHeader(plain, { x: 20, y: 20, w: 160, h: 160 }, WHITE), null);
});

test("an edge snaps to the nearest strong line, not the strongest one", () => {
  // Two cards side by side put both borders in one search band. Snapping to
  // the harder line swallows the gap and the pair renders as one panel.
  const profile = new Float32Array(60);
  profile[30] = 40; // this card's edge, where we were told to look
  profile[36] = 90; // the neighbour's, twice as hard
  assert.equal(snapEdge(profile, 30, 10), 30);
  assert.equal(snapEdge(profile, 33, 10), 30);
});

test("a flat band leaves the guess alone", () => {
  const flat = new Float32Array(40).fill(5);
  assert.equal(snapEdge(flat, 20, 8), 20);
});

test("Sobel finds a vertical edge on the column it is on", () => {
  const image = blank(40, 40, WHITE);
  paint(image, { x: 20, y: 0, w: 20, h: 40 }, NAVY);
  const { x: gradientX } = sobelMagnitudes(image);

  const columnEnergy = (column: number) => {
    let total = 0;
    for (let row = 5; row < 35; row += 1) total += gradientX[row * 40 + column];
    return total;
  };
  assert.ok(columnEnergy(20) > columnEnergy(10) * 10);
});

test("refinePanel snaps a rough box onto the card and measures it", () => {
  const image = blank(400, 300, PAGE);
  paint(image, { x: 60, y: 40, w: 200, h: 160 }, WHITE);
  paint(image, { x: 60, y: 40, w: 200, h: 26 }, NAVY);

  // Told the card is roughly here, a few pixels off on every side.
  const measured = refinePanel(
    image,
    { x: 57 / 400, y: 36 / 300, w: 206 / 400, h: 167 / 300 },
    "rect",
  );

  assert.ok(Math.abs(measured.x * 400 - 60) <= 3, `left landed at ${measured.x * 400}`);
  assert.ok(Math.abs(measured.y * 300 - 40) <= 3, `top landed at ${measured.y * 300}`);
  assert.equal(measured.fill, "#FFFFFF");
  assert.ok(measured.header, "the navy bar is a header");
  assert.equal(measured.rounded, false);
});
