import assert from "node:assert/strict";
import { test } from "node:test";
import { createMask, maskSum, type Mask } from "../client/workspaces/ppt/vision/morphology";
import {
  coreColor,
  fontHeightPx,
  inkMask,
  leadingBullet,
  measureTextBlocks,
  resolveBold,
  ringBackground,
  snapToExpected,
  stripBullet,
  strokeMetrics,
} from "../client/workspaces/ppt/vision/text-measure";
import { continuesParagraph, mergeLines } from "../client/workspaces/ppt/vision/line-merge";
import type { MeasuredTextBlock, OcrBox, RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * The measurement chain, and in particular the two steps the method notes
 * call load-bearing: the saturation test in the ink mask, and stroke width
 * from a distance transform rather than from ink coverage. Both have a
 * plausible cheaper version that works on most inputs and fails on the ones
 * that matter, so each is pinned here by a case the cheap version gets wrong.
 */

const WHITE: [number, number, number] = [255, 255, 255];

const imageFrom = (
  rows: string[],
  palette: Record<string, [number, number, number]>,
): RgbaImage => {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const data = new Uint8ClampedArray(width * height * 4);

  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = palette[row[x]] || WHITE;
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  });

  return { data, width, height };
};

const maskFrom = (rows: string[]): Mask => {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const mask = createMask(width, height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) mask.data[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return mask;
};

const boxOf = (x: number, y: number, w: number, h: number, text = "text", confidence = 0.99): OcrBox => ({
  text,
  confidence,
  x,
  y,
  w,
  h,
});

test("the ink mask rejects a coloured icon that sits as close as the text does", () => {
  // The case the method notes single out. Against white, dark grey text is
  // 585 away in L1 and this green mark is 525 -- both clear the distance
  // threshold, so colour distance alone keeps the icon. Saturation is what
  // separates them: the glyphs measure 0 and the mark measures 180.
  const image = imageFrom(
    [
      "..........",
      ".TTTTTT.G.",
      ".TTTTTT.G.",
      ".TTTTTT.G.",
      "..........",
    ],
    { T: [60, 60, 60], G: [0, 180, 60] },
  );

  const box = boxOf(1, 1, 8, 3);
  const background = ringBackground(image, box);
  assert.deepEqual(background, [255, 255, 255]);

  const { mask } = inkMask(image, box, background);

  // Every grey pixel kept, every green pixel dropped.
  assert.equal(maskSum(mask), 18);
  for (let y = 0; y < mask.height; y += 1) {
    assert.equal(mask.data[y * mask.width + 7], 0, "the green mark must not be read as ink");
  }
});

test("the ink mask keeps coloured text when the whole run is that colour", () => {
  // The saturation test compares against the text's own saturation, not
  // against zero, so a deck set in orange is still text.
  const image = imageFrom(
    [
      "........",
      ".OOOOOO.",
      ".OOOOOO.",
      "........",
    ],
    { O: [230, 120, 20] },
  );

  const box = boxOf(1, 1, 6, 2);
  const { mask } = inkMask(image, box, ringBackground(image, box));
  assert.equal(maskSum(mask), 12);
});

test("stroke width comes from the distance transform, so coverage cannot fool it", () => {
  // Two glyphs with identical ink coverage: three separate hairlines, and one
  // solid stroke three pixels wide. Ink coverage reports them the same. The
  // distance transform reports the second as twice the first, which is the
  // difference between a dense regular face and a simple bold one.
  const hairlines = maskFrom([
    "........",
    ".#.#.#..",
    ".#.#.#..",
    ".#.#.#..",
    ".#.#.#..",
    ".#.#.#..",
    ".#.#.#..",
    "........",
  ]);
  const solid = maskFrom([
    "........",
    ".###....",
    ".###....",
    ".###....",
    ".###....",
    ".###....",
    ".###....",
    "........",
  ]);

  assert.equal(maskSum(hairlines), maskSum(solid), "the fixtures must have equal coverage");

  const thin = strokeMetrics(hairlines);
  const thick = strokeMetrics(solid);
  assert.ok(Math.abs(thin.width - 1.91) < 1e-6);
  assert.ok(Math.abs(thick.width - 3.82) < 1e-6);
});

test("font height ignores punctuation instead of averaging it in", () => {
  // Three full-height glyphs and one comma. The whole-box extent is 8 and the
  // comma would drag a naive mean down; the percentile over solid components
  // tracks the body of the text at 6.
  const mask = maskFrom([
    "..........",
    ".#..#..#..",
    ".#..#..#..",
    ".#..#..#..",
    ".#..#..#..",
    ".#..#..#..",
    ".#..#..#.#",
    "..........",
  ]);
  assert.equal(fontHeightPx(mask, "latin"), 6);
});

test("font height falls back to the ink extent when the glyph fragmented", () => {
  // A CJK glyph broken into thin pieces by anti-aliasing. The percentile lands
  // far under the extent, which means fragmentation rather than small type --
  // and CJK fills its em box, so the extent is the better answer.
  const mask = maskFrom([
    "####",
    "....",
    "....",
    "####",
  ]);
  assert.equal(fontHeightPx(mask, "cjk"), 4);
});

test("the core colour is measured after eroding away the blended edge", () => {
  // A dark core inside a mid-grey anti-aliased fringe. Sampling the whole
  // mask would return the fringe, washing the text out; only the core is the
  // real colour. The stroke has to be wide enough that eroding leaves the
  // eight pixels the measurement insists on -- below that it gives up and
  // takes the whole mask, fringe included.
  const image = imageFrom(
    [
      ".......",
      ".EEEEE.",
      ".ECCCE.",
      ".ECCCE.",
      ".ECCCE.",
      ".EEEEE.",
      ".......",
    ],
    { E: [128, 128, 128], C: [16, 16, 16] },
  );
  const mask = maskFrom([
    ".......",
    ".#####.",
    ".#####.",
    ".#####.",
    ".#####.",
    ".#####.",
    ".......",
  ]);

  assert.equal(coreColor(image, { x: 0, y: 0 }, mask, [0, 0, 0]), "#101010");
});

test("a stroke too thin to erode is measured from the blended edge instead", () => {
  // The fallback above, made explicit: a hairline has no core to sample, so
  // the fringe is all there is and the measurement says so rather than
  // returning nothing.
  const image = imageFrom(
    [
      ".....",
      ".EEE.",
      ".ECE.",
      ".EEE.",
      ".....",
    ],
    { E: [128, 128, 128], C: [16, 16, 16] },
  );
  const mask = maskFrom([
    ".....",
    ".###.",
    ".###.",
    ".###.",
    ".....",
  ]);

  assert.equal(coreColor(image, { x: 0, y: 0 }, mask, [0, 0, 0]), "#808080");
});

test("a leading bullet is found by geometry, not only by its character", () => {
  // A small mark, a gap, then the text. Both the mark and any bullet
  // character have to go: geometry alone leaves the character in the text,
  // and the character alone leaves the mark in the picture.
  const mask = maskFrom([
    "....................",
    "........########....",
    "........########....",
    "........########....",
    "..###...########....",
    "..###...########....",
    "..###...########....",
    "........########....",
    "........########....",
    "....................",
  ]);
  assert.equal(leadingBullet(mask, 8), 8);

  // Two words of body text: the first is far too wide to be a mark, so
  // nothing is trimmed and the line keeps its opening word.
  const words = maskFrom([
    "................",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    ".######..######.",
    "................",
  ]);
  assert.equal(leadingBullet(words, 8), 0);
});

test("stripBullet removes the character and reports that it was there", () => {
  assert.deepEqual(stripBullet("• 统一数据汇聚"), { text: "统一数据汇聚", hadBullet: true });
  assert.deepEqual(stripBullet("统一数据汇聚"), { text: "统一数据汇聚", hadBullet: false });
});

const blockOf = (overrides: Partial<MeasuredTextBlock> = {}): MeasuredTextBlock => ({
  id: "b",
  text: "text",
  x: 0.1,
  y: 0.1,
  w: 0.3,
  h: 0.05,
  fontSizePt: 18,
  color: "#111827",
  bold: false,
  italic: false,
  serif: false,
  script: "cjk",
  align: "left",
  bullet: false,
  confidence: 0.99,
  metrics: { strokePx: 2, strokeRatio: 0.1, strokeCv: 0.2, slant: 0 },
  ...overrides,
});

test("a pinned bold threshold overrides the automatic call", () => {
  const blocks = [
    blockOf({ metrics: { strokePx: 3, strokeRatio: 0.2, strokeCv: 0, slant: 0 } }),
    blockOf({ metrics: { strokePx: 1, strokeRatio: 0.1, strokeCv: 0, slant: 0 } }),
  ];
  resolveBold(blocks, "ratio:0.145");
  assert.deepEqual(blocks.map((block) => block.bold), [true, false]);

  resolveBold(blocks, "off");
  assert.deepEqual(blocks.map((block) => block.bold), [false, false]);
});

test("automatic bold judges a block against what its own size normally measures", () => {
  // Stroke ratio falls with font size, so a fixed threshold calls every small
  // block bold. These six sit on that trend and one sits above it; only the
  // outlier is bold, even though several have a higher raw ratio than it.
  const trend = [
    [40, 0.1],
    [34, 0.11],
    [28, 0.12],
    [22, 0.13],
    [16, 0.14],
    [12, 0.15],
  ] as const;

  const blocks = trend.map(([size, ratio]) =>
    blockOf({ fontSizePt: size, metrics: { strokePx: 0, strokeRatio: ratio, strokeCv: 0, slant: 0 } }),
  );
  const outlier = blockOf({
    fontSizePt: 40,
    metrics: { strokePx: 0, strokeRatio: 0.19, strokeCv: 0, slant: 0 },
  });
  blocks.push(outlier);

  resolveBold(blocks, "auto");
  assert.equal(outlier.bold, true);
  assert.deepEqual(blocks.slice(0, 6).map((block) => block.bold), [false, false, false, false, false, false]);
});

test("expected text corrects a near miss but never introduces new text", () => {
  const nearMiss = blockOf({ text: "智慧校园核心模抉" });
  const unrelated = blockOf({ text: "完全不同的一句话" });
  const blocks = [nearMiss, unrelated];

  snapToExpected(blocks, ["智慧校园核心模块", "围绕教学"]);
  assert.equal(nearMiss.text, "智慧校园核心模块");
  assert.equal(unrelated.text, "完全不同的一句话");
});

test("stacked lines of one paragraph merge into a single block", () => {
  const first = blockOf({ id: "a", text: "第一行", x: 0.1, y: 0.1, w: 0.3, h: 0.05 });
  const second = blockOf({ id: "b", text: "第二行", x: 0.1, y: 0.16, w: 0.3, h: 0.05 });

  assert.ok(continuesParagraph(first, second));
  const merged = mergeLines([first, second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "第一行\n第二行");
  assert.ok(Math.abs(merged[0].h - 0.11) < 1e-9);
});

test("two columns of cards do not merge into each other", () => {
  // The reason lines are chained downward instead of scanned in reading
  // order. Reading order alternates between these four and would sever both
  // paragraphs; each column has to stay whole.
  const blocks = [
    blockOf({ id: "l1", text: "左一", x: 0.1, y: 0.1 }),
    blockOf({ id: "r1", text: "右一", x: 0.6, y: 0.1 }),
    blockOf({ id: "l2", text: "左二", x: 0.1, y: 0.16 }),
    blockOf({ id: "r2", text: "右二", x: 0.6, y: 0.16 }),
  ];

  const merged = mergeLines(blocks);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((block) => block.text).sort(), ["右一\n右二", "左一\n左二"]);
});

test("lines in a different colour or weight stay apart", () => {
  const heading = blockOf({ id: "h", text: "标题", x: 0.1, y: 0.1, bold: true });
  const body = blockOf({ id: "b", text: "正文", x: 0.1, y: 0.16, bold: false });
  assert.equal(continuesParagraph(heading, body), false);

  const dark = blockOf({ id: "d", text: "深色", x: 0.1, y: 0.1, color: "#111827" });
  const light = blockOf({ id: "w", text: "浅色", x: 0.1, y: 0.16, color: "#FFFFFF" });
  assert.equal(continuesParagraph(dark, light), false);
});

test("measureTextBlocks reads a synthetic page into slide fractions and points", () => {
  const rows: string[] = [];
  for (let y = 0; y < 40; y += 1) {
    let row = "";
    for (let x = 0; x < 80; x += 1) {
      const isGlyph = y >= 10 && y < 20 && x >= 8 && x < 40 && (x - 8) % 4 < 2;
      row += isGlyph ? "T" : ".";
    }
    rows.push(row);
  }
  const image = imageFrom(rows, { T: [17, 24, 39] });

  const [block] = measureTextBlocks(image, [boxOf(8, 10, 32, 10, "标题")], { slideId: "slide-1" });

  assert.equal(block.id, "slide-1_t1");
  assert.equal(block.text, "标题");
  assert.equal(block.script, "cjk");
  assert.equal(block.color, "#111827");
  // Geometry is re-derived from the ink and reported as slide fractions.
  assert.ok(Math.abs(block.x - 8 / 80) < 1e-9);
  assert.ok(Math.abs(block.y - 10 / 40) < 1e-9);
  assert.ok(Math.abs(block.w - 30 / 80) < 1e-9);
  assert.ok(Math.abs(block.h - 10 / 40) < 1e-9);
  // Ten pixels of glyph on an 80px page, scaled to a 960pt slide, divided by
  // the ratio of cap height to em.
  assert.ok(Math.abs(block.fontSizePt - (10 / 0.86) * (960 / 80)) < 0.02);
});

test("a box overhanging the page is trimmed to it rather than dropped", () => {
  const image = imageFrom(
    [
      "......",
      ".TTTT.",
      ".TTTT.",
      ".TTTT.",
    ],
    { T: [17, 24, 39] },
  );

  // Four rows tall, but the box claims six.
  const blocks = measureTextBlocks(image, [boxOf(1, 1, 4, 6, "边缘")], { slideId: "s" });
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].y + blocks[0].h <= 1);
});
