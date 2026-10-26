import assert from "node:assert/strict";
import { test } from "node:test";
import {
  batchWidth,
  cropQuad,
  detectionInput,
  detectionSize,
  recognitionInput,
  resizeBilinear,
} from "../client/workspaces/ppt/vision/preprocess";
import { buildCharset, ctcGreedyDecode, readAngle } from "../client/workspaces/ppt/vision/ctc-decode";
import type { Quad } from "../client/workspaces/ppt/vision/geometry";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * What goes into the OCR models and what comes back out.
 *
 * Neither end fails loudly when it is wrong. A half-pixel shift in the resize
 * moves every box by the same amount; a normalisation that does not match
 * training just reads worse; collapsing CTC output in the wrong order quietly
 * eats one of every doubled letter. So each is pinned to its definition here.
 */

const imageFrom = (rows: number[][]): RgbaImage => {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    row.forEach((value, x) => {
      const at = (y * width + x) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    });
  });
  return { data, width, height };
};

const grey = (image: RgbaImage, x: number, y: number) => image.data[(y * image.width + x) * 4];

test("resizing maps destination centres to source centres", () => {
  // Doubling should put the original pixels back at the centres of their new
  // two-by-two blocks, not at the corners. Sampling from the corner shifts
  // the whole page half a pixel and takes every detected box with it.
  const source = imageFrom([
    [0, 100],
    [200, 255],
  ]);
  const doubled = resizeBilinear(source, 4, 4);

  assert.equal(grey(doubled, 0, 0), 0);
  assert.equal(grey(doubled, 3, 0), 100);
  assert.equal(grey(doubled, 0, 3), 200);
  assert.equal(grey(doubled, 3, 3), 255);
  // The midpoint between two source pixels is their average.
  assert.ok(Math.abs(grey(doubled, 1, 0) - 25) <= 1);
});

test("resizing a flat image leaves it flat", () => {
  const flat = imageFrom(Array.from({ length: 5 }, () => new Array(7).fill(128)));
  const resized = resizeBilinear(flat, 13, 3);
  for (let i = 0; i < resized.width * resized.height; i += 1) {
    assert.equal(resized.data[i * 4], 128);
  }
});

test("the detector runs at a multiple of 32, scaling small pages up", () => {
  // A slide is already large, so it keeps its size, rounded to the step.
  assert.deepEqual(detectionSize(1672, 941, 736), { width: 1664, height: 928 });
  // A thumbnail is scaled up until its short side reaches the limit.
  assert.deepEqual(detectionSize(400, 200, 736), { width: 1472, height: 736 });
});

test("the detector's tensor is CHW and normalised the way it was trained", () => {
  const image = imageFrom(Array.from({ length: 64 }, () => new Array(64).fill(255)));
  const { tensor, width, height } = detectionInput(image, 32);

  assert.equal(width, 64);
  assert.equal(height, 64);
  assert.equal(tensor.length, 3 * 64 * 64);

  // White, through ImageNet normalisation, per channel.
  const expected = [(1 - 0.485) / 0.229, (1 - 0.456) / 0.224, (1 - 0.406) / 0.225];
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(Math.abs(tensor[channel * 64 * 64] - expected[channel]) < 1e-6);
  }
});

test("a quad is sampled into an upright strip, corners included", () => {
  const rows = Array.from({ length: 20 }, (_, y) =>
    Array.from({ length: 20 }, (_, x) => (x + y * 20) % 256),
  );
  const image = imageFrom(rows);
  const quad: Quad = [
    { x: 2, y: 2 },
    { x: 11, y: 2 },
    { x: 11, y: 7 },
    { x: 2, y: 7 },
  ];

  const crop = cropQuad(image, quad);
  assert.equal(crop.width, 9);
  assert.equal(crop.height, 5);
  // The quad's own corners land on the strip's corners.
  assert.equal(grey(crop, 0, 0), grey(image, 2, 2));
  assert.equal(grey(crop, 8, 0), grey(image, 11, 2));
  assert.equal(grey(crop, 0, 4), grey(image, 2, 7));
});

test("the recogniser gets a fixed height and a padded width", () => {
  const crop = imageFrom(Array.from({ length: 20 }, () => new Array(60).fill(255)));
  const { tensor, width, height } = recognitionInput(crop, 48, 320);

  assert.equal(width, 320);
  assert.equal(height, 48);
  assert.equal(tensor.length, 3 * 320 * 48);

  // White scaled to [-1, 1] is 1, and the padding past the strip stays zero.
  assert.ok(Math.abs(tensor[0] - 1) < 1e-6);
  const scaledWidth = Math.ceil((48 * 60) / 20);
  assert.equal(tensor[scaledWidth + 2], 0);
});

test("a wide crop is capped rather than squeezed", () => {
  const wide = imageFrom(Array.from({ length: 10 }, () => new Array(2000).fill(200)));
  assert.equal(batchWidth([wide], 48, 320), 320);

  const narrow = imageFrom(Array.from({ length: 10 }, () => new Array(20).fill(200)));
  assert.equal(batchWidth([narrow], 48, 320), 96);
});

test("the charset puts blank first and space last", () => {
  const charset = buildCharset("a\nb\n中\n", true);
  assert.deepEqual(charset, ["", "a", "b", "中", " "]);
  assert.deepEqual(buildCharset("a\nb\n", false), ["", "a", "b"]);
});

test("CTC collapses runs before dropping blanks", () => {
  // The order that matters. "aab" held as a-a-blank-a-b must decode to "aab":
  // dropping blanks first would merge the two runs of "a" into one.
  const charset = ["", "a", "b"];
  const steps = [
    [0.1, 0.8, 0.1],
    [0.1, 0.9, 0.0],
    [0.9, 0.1, 0.0],
    [0.1, 0.7, 0.2],
    [0.1, 0.1, 0.8],
  ];
  const scores = Float32Array.from(steps.flat());

  const result = ctcGreedyDecode(scores, steps.length, 3, charset);
  assert.equal(result.text, "aab");
  // Confidence averages only the steps that produced a character.
  assert.ok(Math.abs(result.confidence - (0.8 + 0.7 + 0.8) / 3) < 1e-6);
});

test("an all-blank strip decodes to nothing rather than to noise", () => {
  const scores = Float32Array.from([0.9, 0.05, 0.05, 0.95, 0.03, 0.02]);
  const result = ctcGreedyDecode(scores, 2, 3, ["", "a", "b"]);
  assert.equal(result.text, "");
  assert.equal(result.confidence, 0);
});

test("the angle classifier only flips a line it is sure about", () => {
  assert.equal(readAngle(Float32Array.from([0.05, 0.95]), 2).upsideDown, true);
  // Over half but under the bar: leave it as it is, because rotating an
  // upright line makes it unreadable.
  assert.equal(readAngle(Float32Array.from([0.4, 0.6]), 2).upsideDown, false);
  assert.equal(readAngle(Float32Array.from([0.99, 0.01]), 2).upsideDown, false);
});
