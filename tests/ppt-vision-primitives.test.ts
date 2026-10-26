import assert from "node:assert/strict";
import { test } from "node:test";
import {
  linearFit,
  mean,
  median,
  medianColor,
  percentile,
  standardDeviation,
  variance,
} from "../client/workspaces/ppt/vision/stats";
import {
  connectedComponentsWithStats,
  createMask,
  cropMask,
  distanceTransformL2,
  erode3x3,
  inkBounds,
  maskSum,
  shearNearest,
  type Mask,
} from "../client/workspaces/ppt/vision/morphology";

/**
 * The numeric floor the text measurement chain stands on.
 *
 * Every expected value here is what NumPy and OpenCV return for the same
 * input, because the measurement thresholds upstream were tuned against those
 * two libraries. A primitive that is merely reasonable rather than identical
 * moves font sizes and stroke widths by a fraction, which is invisible in a
 * single reading and shifts whole categories once thousands of glyphs are
 * measured against a fixed threshold.
 */

const maskFromRows = (rows: string[]): Mask => {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const mask = createMask(width, height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      mask.data[y * width + x] = row[x] === "#" ? 1 : 0;
    }
  });
  return mask;
};

test("percentile interpolates between neighbours the way np.percentile does", () => {
  // np.percentile([1, 2, 3, 4], 80) -> 3.4, not 3 and not 4.
  assert.equal(percentile([1, 2, 3, 4], 80), 3.4);
  assert.equal(percentile([1, 2, 3, 4], 0), 1);
  assert.equal(percentile([1, 2, 3, 4], 100), 4);
  // The 88th percentile is the one the stroke measurement uses.
  assert.equal(percentile([10, 20, 30, 40, 50], 88), 45.2);
});

test("percentile survives the degenerate inputs the crops produce", () => {
  assert.equal(percentile([], 80), 0);
  assert.equal(percentile([7], 80), 7);
});

test("median averages the two central values on an even count", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([3, 1, 2]), 2);
});

test("standardDeviation is the population form, as np.std defaults to", () => {
  // Sample std of this run is 2.138; population std is exactly 2.
  assert.equal(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2);
  assert.equal(variance([2, 4, 4, 4, 5, 5, 7, 9]), 4);
  assert.equal(mean([2, 4, 6]), 4);
});

test("linearFit recovers a line it was given exactly", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = xs.map((x) => 2 * x + 1);
  const { slope, intercept } = linearFit(xs, ys);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept - 1) < 1e-9);
});

test("linearFit degrades to a flat line when every x is the same", () => {
  const { slope, intercept } = linearFit([3, 3, 3], [1, 2, 3]);
  assert.equal(slope, 0);
  assert.equal(intercept, 2);
});

test("medianColor takes each channel independently", () => {
  // Deliberately a colour that appears in no single pixel: the centre of the
  // distribution, which is what np.median(pixels, axis=0) returns.
  const pixels = [0, 10, 20, 200, 0, 40, 100, 30, 0];
  assert.deepEqual(medianColor(pixels), [100, 10, 20]);
});

test("connected components are 8-connected, so a diagonal touch is one blob", () => {
  const diagonal = maskFromRows([
    "#..",
    ".#.",
    "..#",
  ]);
  assert.equal(connectedComponentsWithStats(diagonal).length, 1);

  const apart = maskFromRows([
    "#..",
    "...",
    "..#",
  ]);
  assert.equal(connectedComponentsWithStats(apart).length, 2);
});

test("component stats report the tight box and the pixel count", () => {
  const mask = maskFromRows([
    ".....",
    ".##..",
    ".##..",
    ".....",
  ]);
  const [component] = connectedComponentsWithStats(mask);
  assert.deepEqual(component, { left: 1, top: 1, width: 2, height: 2, area: 4 });
});

test("a U shape stays one component rather than two arms", () => {
  const mask = maskFromRows([
    "#.#",
    "#.#",
    "###",
  ]);
  const components = connectedComponentsWithStats(mask);
  assert.equal(components.length, 1);
  assert.equal(components[0].area, 7);
});

test("erode3x3 keeps only pixels whose whole neighbourhood is ink", () => {
  const mask = maskFromRows([
    ".....",
    ".###.",
    ".###.",
    ".###.",
    ".....",
  ]);
  const eroded = erode3x3(mask);
  assert.equal(maskSum(eroded), 1);
  assert.equal(eroded.data[2 * 5 + 2], 1);
});

test("erode3x3 does not eat pixels merely for sitting on the border", () => {
  // OpenCV's erosion border value is +infinity, so the edge of the image
  // never contributes a zero. A fully-inked mask survives untouched.
  const mask = maskFromRows([
    "###",
    "###",
    "###",
  ]);
  assert.equal(maskSum(erode3x3(mask)), 9);
});

test("distanceTransformL2 uses OpenCV's chamfer weights, not exact Euclid", () => {
  const mask = maskFromRows([
    ".....",
    ".###.",
    ".###.",
    ".###.",
    ".....",
  ]);
  const distance = distanceTransformL2(mask);

  // One orthogonal step from a zero.
  assert.ok(Math.abs(distance[1 * 5 + 1] - 0.955) < 1e-6);
  // Two orthogonal steps beats one diagonal plus one orthogonal (2.324).
  assert.ok(Math.abs(distance[2 * 5 + 2] - 1.91) < 1e-6);
  // Background stays at zero.
  assert.equal(distance[0], 0);
});

test("distanceTransformL2 treats the image edge as far, never as background", () => {
  // Every pixel is ink and there is no zero to measure against. The edge must
  // not stand in for one, or a tightly cropped stroke would read as thin.
  const mask = maskFromRows([
    "###",
    "###",
    "###",
  ]);
  const distance = distanceTransformL2(mask);
  assert.ok(Array.from(distance).every((value) => value === 0));
});

test("shearNearest leaves the mask alone at zero angle", () => {
  const mask = maskFromRows([
    ".#.",
    ".#.",
    ".#.",
  ]);
  assert.deepEqual(Array.from(shearNearest(mask, 0).data), Array.from(mask.data));
});

test("a positive shear angle straightens a forward lean rather than adding one", () => {
  // This is the direction the slant search depends on. It sweeps positive
  // angles looking for the one that lines vertical strokes up, so a positive
  // angle has to pull the top of a stroke left -- undoing the lean of italic
  // text. Getting the sign backwards would make the search find its best
  // angle at the edge of the range for every block, upright or not.
  const upright = maskFromRows([
    "..#..",
    "..#..",
    "..#..",
    "..#..",
  ]);
  const sheared = shearNearest(upright, 0.5);
  const columnOf = (mask: Mask, row: number) => {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[row * mask.width + x]) return x;
    }
    return -1;
  };

  assert.ok(columnOf(sheared, 0) < columnOf(sheared, 3));
});

test("the slant search finds the angle that squares up a leaning stroke", () => {
  // A stroke leaning forward one column per row, which a shear of about 1.0
  // should stand upright. Peakedness of the column sums is the signal the
  // measurement uses, so the best angle is the one that maximises it.
  const leaning = maskFromRows([
    "...#",
    "..#.",
    ".#..",
    "#...",
  ]);

  const peakedness = (angle: number) => {
    const sheared = shearNearest(leaning, angle);
    const columns: number[] = [];
    for (let x = 0; x < sheared.width; x += 1) {
      let total = 0;
      for (let y = 0; y < sheared.height; y += 1) total += sheared.data[y * sheared.width + x];
      columns.push(total);
    }
    return variance(columns);
  };

  assert.ok(peakedness(1) > peakedness(0));
});

test("inkBounds and cropMask agree on where the ink is", () => {
  const mask = maskFromRows([
    ".....",
    "..##.",
    "..##.",
    ".....",
  ]);
  const bounds = inkBounds(mask);
  assert.deepEqual(bounds, { left: 2, top: 1, right: 4, bottom: 3 });

  const cropped = cropMask(mask, bounds!.left, bounds!.top, bounds!.right, bounds!.bottom);
  assert.equal(cropped.width, 2);
  assert.equal(cropped.height, 2);
  assert.equal(maskSum(cropped), 4);
});

test("inkBounds reports nothing for an empty mask", () => {
  assert.equal(inkBounds(createMask(4, 4)), null);
});
