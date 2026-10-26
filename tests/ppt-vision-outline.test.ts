import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approxPolyDp,
  arcLength,
  contourArea,
  fillPolygon,
  intersectionOverUnion,
  traceContours,
} from "../client/workspaces/ppt/vision/contours";
import { ringRatio, tracePolygon } from "../client/workspaces/ppt/vision/outline";
import { createMask, maskSum, type Mask } from "../client/workspaces/ppt/vision/morphology";

/**
 * Outline tracing, and the check that decides whether a trace is allowed out.
 *
 * A wrong outline is worse than a missing one: drawn in the deck's own
 * colours it reads as a design decision, where a missing shape reads as a
 * bug. So the agreement test between a trace and the mask it came from is
 * pinned here alongside the trace itself.
 */

const maskFrom = (rows: string[]): Mask => {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const mask = createMask(width, height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) mask.data[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return mask;
};

const solidBox = (width: number, height: number, inset = 2): Mask => {
  const mask = createMask(width, height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) mask.data[y * width + x] = 1;
  }
  return mask;
};

test("the walk returns a closed ring in boundary order", () => {
  const [ring] = traceContours(solidBox(12, 10));
  assert.ok(ring.length >= 4);

  // Consecutive points are neighbours; a walk that jumps has skipped part of
  // the boundary and closed early.
  for (let i = 1; i < ring.length; i += 1) {
    const step = Math.max(
      Math.abs(ring[i].x - ring[i - 1].x),
      Math.abs(ring[i].y - ring[i - 1].y),
    );
    assert.equal(step, 1, `the walk jumped at index ${i}`);
  }
  // And it ends adjacent to where it started.
  const closing = Math.max(
    Math.abs(ring[0].x - ring[ring.length - 1].x),
    Math.abs(ring[0].y - ring[ring.length - 1].y),
  );
  assert.equal(closing, 1);
});

test("the walk visits every boundary pixel of a rectangle exactly once", () => {
  // A six-by-five block has eighteen boundary pixels. Getting fewer means the
  // sweep started in the wrong place and cut a corner.
  const [ring] = traceContours(solidBox(10, 9, 2));
  assert.equal(ring.length, 18);
  assert.equal(new Set(ring.map((p) => `${p.x},${p.y}`)).size, 18);
});

test("two blobs trace as two rings, and a diagonal touch as one", () => {
  const apart = maskFrom([
    "..........",
    ".##....##.",
    ".##....##.",
    "..........",
  ]);
  assert.equal(traceContours(apart).length, 2);

  const touching = maskFrom([
    ".....",
    ".##..",
    "..##.",
    ".....",
  ]);
  assert.equal(traceContours(touching).length, 1);
});

test("area and perimeter match the shoelace and the walk", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.equal(contourArea(square), 100);
  assert.equal(arcLength(square, true), 40);
  assert.equal(arcLength(square, false), 30);
});

test("simplification keeps corners and drops points along a straight edge", () => {
  // A square walked pixel by pixel: forty points that describe four corners.
  const walked = [
    ...Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 10, y: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 10 - i, y: 10 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 10 - i })),
  ];

  const simplified = approxPolyDp(walked, 0.004 * arcLength(walked, true));
  assert.equal(simplified.length, 4, "a square is four points");
  const corners = new Set(simplified.map((p) => `${p.x},${p.y}`));
  assert.ok(corners.has("0,0") && corners.has("10,0") && corners.has("10,10") && corners.has("0,10"));
});

test("simplification keeps a curve as a run of short segments", () => {
  // Points along a half circle. Reducing this to a triangle would lose the
  // curve; keeping all sixty would make a forty-vertex freeform out of noise.
  const arc = Array.from({ length: 60 }, (_, i) => {
    const angle = (Math.PI * i) / 59;
    return { x: 50 + 40 * Math.cos(angle), y: 50 - 40 * Math.sin(angle) };
  });

  const simplified = approxPolyDp(arc, 0.004 * arcLength(arc, true));
  assert.ok(simplified.length > 6, `a curve needs segments, got ${simplified.length}`);
  assert.ok(simplified.length < 40, `and not all of them, got ${simplified.length}`);
});

test("filling a polygon paints what the polygon covers", () => {
  const filled = fillPolygon(
    [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 6 }, { x: 2, y: 6 }],
    10,
    10,
  );
  assert.equal(maskSum(filled), 24);
  assert.equal(filled.data[3 * 10 + 3], 1);
  assert.equal(filled.data[0], 0);
});

test("agreement is one for identical masks and zero for disjoint ones", () => {
  const left = maskFrom(["##..", "##..", "....", "...."]);
  const right = maskFrom(["....", "....", "..##", "..##"]);
  assert.equal(intersectionOverUnion(left, left), 1);
  assert.equal(intersectionOverUnion(left, right), 0);
});

const leaningBanner = (width: number, height: number): Mask => {
  const mask = createMask(width, height);
  const inset = Math.round(height * 0.08);
  const run = Math.round(width * 0.75);
  for (let y = inset; y < height - inset; y += 1) {
    const start = inset + Math.round((y - inset) * 0.6);
    for (let x = start; x < start + run; x += 1) {
      if (x < width) mask.data[y * width + x] = 1;
    }
  }
  return mask;
};

test("a leaning banner traces to its four real corners", () => {
  // A slanted edge in a binary mask is a staircase, and the simplification
  // has to see past it. At slide scale it does.
  const traced = tracePolygon(leaningBanner(400, 160));
  assert.ok(traced, "a flat block should trace");
  assert.equal(traced!.length, 4);
  // Reported in fractions of the shape's own box, so it survives a resize.
  for (const [x, y] of traced!) {
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  }
});

test("simplification is a fraction of perimeter, so it scales with the shape", () => {
  // The same banner shrunk to thumbnail size keeps its staircase, because a
  // one-pixel step really is a meaningful share of a ninety-pixel perimeter.
  // An absolute pixel tolerance would instead flatten a genuine notch on a
  // large shape while still chasing noise on a small one.
  const large = tracePolygon(leaningBanner(400, 160));
  const small = tracePolygon(leaningBanner(40, 24));
  assert.equal(large!.length, 4);
  assert.ok(small!.length > large!.length, "a tiny shape cannot hide its stairs");
});

test("a square block traces to four corners whatever its size", () => {
  for (const size of [24, 120, 400]) {
    const box = createMask(size, size);
    const inset = Math.max(2, Math.round(size * 0.1));
    for (let y = inset; y < size - inset; y += 1) {
      for (let x = inset; x < size - inset; x += 1) box.data[y * size + x] = 1;
    }
    assert.equal(tracePolygon(box)?.length, 4, `a ${size}px block is four points`);
  }
});

test("a shape with a hole is refused rather than traced wrongly", () => {
  // The outline of a ring encloses its hole, so the trace covers far more
  // than the mask does and the agreement test rejects it. Refusing is the
  // point: this element goes out as a picture instead.
  const ring = createMask(40, 40);
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 40; x += 1) {
      const distance = Math.hypot(x - 19.5, y - 19.5);
      if (distance <= 18 && distance >= 10) ring.data[y * 40 + x] = 1;
    }
  }

  assert.equal(tracePolygon(ring), null);
});

test("an empty or tiny mask traces to nothing", () => {
  assert.equal(tracePolygon(createMask(20, 20)), null);
  assert.equal(tracePolygon(maskFrom(["##", "##"])), null);
});

test("a ring reports its aperture and a disc reports none", () => {
  const build = (inner: number) => {
    const mask = createMask(40, 40);
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        const distance = Math.hypot(x - 19.5, y - 19.5);
        if (distance <= 18 && distance >= inner) mask.data[y * 40 + x] = 1;
      }
    }
    return mask;
  };

  const measured = ringRatio(build(9));
  assert.ok(measured > 0.4 && measured < 0.6, `expected about half, measured ${measured}`);
  // A solid disc: one unbroken run on both axes, so no hole.
  assert.equal(ringRatio(build(0)), 0);
});

test("a hairline seam is not reported as a hole", () => {
  // Two pixels of gap across a wide shape is anti-aliasing or a join, and a
  // wrong hole is worse than none.
  const seam = createMask(40, 40);
  for (let y = 8; y < 32; y += 1) {
    for (let x = 8; x < 32; x += 1) {
      if (x >= 19 && x <= 20) continue;
      seam.data[y * 40 + x] = 1;
    }
  }
  assert.equal(ringRatio(seam), 0);
});
