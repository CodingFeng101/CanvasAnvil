import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildShapePath,
  FREEFORM,
  isRingShape,
  normalizeShapeName,
  PPTX_SHAPE,
  SHAPE_NAMES,
  shapeCorners,
  UNIT_POINTS,
  type ShapeName,
} from "../client/workspaces/ppt/lib/shapes";

/**
 * The shape vocabulary, and the three sides that have to agree on it.
 *
 * A name the detector may answer with but the exporter has never heard of
 * comes out of the pipeline as a rectangle. That reads as a measurement
 * failure rather than a missing table entry, which is why the coverage
 * between the tables is asserted here rather than left to review.
 */

test("every name normalises to itself", () => {
  for (const name of SHAPE_NAMES) {
    assert.equal(normalizeShapeName(name), name, `${name} should survive normalisation`);
  }
});

test("the snake_case spellings a detector produces are understood", () => {
  assert.equal(normalizeShapeName("round_rect"), "roundRect");
  assert.equal(normalizeShapeName("right_triangle"), "rightTriangle");
  assert.equal(normalizeShapeName("left_right_arrow"), "leftRightArrow");
  assert.equal(normalizeShapeName("up_arrow"), "upArrow");
  assert.equal(normalizeShapeName("down_arrow"), "downArrow");
});

test("common synonyms land on the shape they mean", () => {
  assert.equal(normalizeShapeName("ellipse"), "oval");
  assert.equal(normalizeShapeName("circle"), "oval");
  assert.equal(normalizeShapeName("ring"), "donut");
  assert.equal(normalizeShapeName("border"), "frame");
  assert.equal(normalizeShapeName("cross"), "plus");
  assert.equal(normalizeShapeName("star"), "star5");
  assert.equal(normalizeShapeName("rightArrow"), "arrow");
  assert.equal(normalizeShapeName("wave"), FREEFORM);
  assert.equal(normalizeShapeName("Rounded Rectangle"), "roundRect");
});

test("an unrecognised name becomes a rectangle rather than nothing", () => {
  assert.equal(normalizeShapeName("sparkle"), "rect");
  assert.equal(normalizeShapeName(""), "rect");
  assert.equal(normalizeShapeName(null), "rect");
  assert.equal(normalizeShapeName(42), "rect");
});

test("every corner table stays inside its own box", () => {
  for (const [name, points] of Object.entries(UNIT_POINTS)) {
    assert.ok(points && points.length >= 3, `${name} needs at least three corners`);
    for (const [x, y] of points!) {
      assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${name} has a corner outside its box`);
    }
  }
});

test("the arrows point the way their names say", () => {
  const tipOf = (name: ShapeName, axis: 0 | 1) => {
    const points = UNIT_POINTS[name]!;
    return points.reduce((best, point) => (point[axis] > best[axis] ? point : best));
  };

  // The right-pointing arrow's furthest-right corner is its tip, on the
  // centre line; the left one mirrors it.
  assert.ok(Math.abs(tipOf("arrow", 0)[1] - 0.5) < 1e-9);
  assert.equal(UNIT_POINTS.leftArrow!.reduce((min, p) => Math.min(min, p[0]), 1), 0);
  // Swapping the axes is what turns a horizontal arrow into a vertical one.
  assert.ok(Math.abs(tipOf("downArrow", 1)[0] - 0.5) < 1e-9);
  assert.equal(UNIT_POINTS.upArrow!.reduce((min, p) => Math.min(min, p[1]), 1), 0);
});

test("corners scale into the box they are given", () => {
  const corners = shapeCorners("triangle", 10, 20, 110, 120);
  assert.deepEqual(corners, [[60, 20], [110, 120], [10, 120]]);
  assert.equal(shapeCorners("rect", 0, 0, 10, 10), null, "rect is drawn by its own rule");
});

test("a ring draws its hole only when one was measured", () => {
  const solid = buildShapePath("donut", 100, 100, { innerRatio: 0 });
  const holed = buildShapePath("donut", 100, 100, { innerRatio: 0.5 });

  // Two subpaths mean a hole; one means it degraded to a solid disc, which is
  // what a ring whose hole could not be measured is supposed to become.
  assert.equal(solid.match(/M /g)?.length, 1);
  assert.equal(holed.match(/M /g)?.length, 2);
  assert.ok(isRingShape("donut") && isRingShape("frame"));
  assert.ok(!isRingShape("oval"));
});

test("a traced outline is drawn from its own points", () => {
  const path = buildShapePath(FREEFORM, 200, 100, {
    points: [[0, 0], [1, 0.5], [0, 1]],
  });
  assert.ok(path.startsWith("M 0.000 0.000"));
  assert.ok(path.includes("L 200.000 50.000"));
  assert.ok(path.endsWith("Z"));
});

test("a traced outline with nothing in it falls back to its box", () => {
  // Drawing nothing would make the element vanish silently; a box at least
  // says something is there.
  const path = buildShapePath(FREEFORM, 40, 20, { points: [[0, 0]] });
  assert.equal(path, "M 0.000 0.000 L 40.000 0.000 L 40.000 20.000 L 0.000 20.000 Z");
});

test("every preset shape has a path and an export target", () => {
  for (const name of SHAPE_NAMES) {
    assert.ok(buildShapePath(name, 100, 50).length > 0, `${name} must draw`);
    if (name === FREEFORM) continue;
    assert.ok(
      PPTX_SHAPE[name as Exclude<ShapeName, "polygon">],
      `${name} must map to an OOXML preset`,
    );
  }
});

test("no two shapes silently share an export target", () => {
  // Not a rule of OOXML, but of this table: a duplicate here means one shape
  // was mapped by copying its neighbour's row and never corrected.
  const targets = Object.values(PPTX_SHAPE);
  assert.equal(new Set(targets).size, targets.length);
});
