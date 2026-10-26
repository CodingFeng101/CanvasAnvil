/**
 * Text, read off the pixels.
 *
 * A vision model asked to report sixty text boxes on a dense page returns
 * sixty approximations, and approximations are what make a rebuilt slide look
 * subtly wrong. So the OCR model does the one thing only a model can do --
 * turn pixels into characters -- and position, size, colour and weight are
 * all measured here.
 *
 * Two steps carry the whole chain and are easy to get wrong:
 *
 *   * The ink mask needs a saturation test, not just a colour-distance test.
 *     A green tick sits 136 away from dark grey text in L1 and the distance
 *     threshold is 130 -- six apart. Saturation separates them by a mile.
 *   * Stroke width must come from a distance transform, not from ink
 *     coverage. Coverage cannot tell a dense regular glyph from a simple bold
 *     one; both fill a similar share of their box.
 */

import {
  connectedComponentsWithStats,
  createMask,
  cropMask,
  distanceTransformL2,
  erode3x3,
  inkBounds,
  maskSum,
  shearNearest,
  type ComponentStats,
  type Mask,
} from "@/workspaces/ppt/vision/morphology";
import { linearFit, mean, medianColor, percentile, standardDeviation, variance } from "@/workspaces/ppt/vision/stats";
import type { BoldMode, MeasuredTextBlock, OcrBox, RgbaImage } from "@/workspaces/ppt/vision/types";

/** A 13.333in widescreen slide, in points. Width is fixed; height follows the page. */
export const SLIDE_WIDTH_PT = 960;

// --- ink separation ---------------------------------------------------------

const RING_PAD = 4;
const MIN_INK_DISTANCE = 60;
const INK_DISTANCE_RATIO = 0.45;
const TEXT_COLOUR_TOLERANCE = 130;
const SATURATION_HEADROOM = 45;

// --- style measurement ------------------------------------------------------

const HEIGHT_PERCENTILE = 80;
const STROKE_PERCENTILE = 88;
const CJK_FACE_RATIO = 0.86;
const LATIN_FACE_RATIO = 0.75;

const ITALIC_SLANT = 0.13;
const SERIF_CV = 0.42;

const BULLET_CHARS = "•·‣▪◦●○∙–—-";
const CJK_PATTERN = /[㐀-鿿豈-﫿　-〿]/;

/** The smallest component worth counting, matching the area filter upstream. */
const MIN_COMPONENT_AREA = 3;

export const isCjk = (text: string): boolean => CJK_PATTERN.test(text);

export function stripBullet(text: string): { text: string; hadBullet: boolean } {
  const stripped = text.replace(/^\s+/, "");
  if (stripped && BULLET_CHARS.includes(stripped[0])) {
    return { text: stripped.slice(1).replace(/^\s+/, ""), hadBullet: true };
  }
  return { text, hadBullet: false };
}

const components = (mask: Mask): ComponentStats[] =>
  connectedComponentsWithStats(mask).filter((item) => item.area >= MIN_COMPONENT_AREA);

/**
 * The median colour of a ring just outside the box.
 *
 * Sampling inside the box risks sampling the glyphs themselves; the ring is
 * what "the colour underneath this text" actually means.
 */
export function ringBackground(image: RgbaImage, box: OcrBox): number[] {
  const { data, width, height } = image;
  const x0 = Math.max(0, box.x - RING_PAD);
  const y0 = Math.max(0, box.y - RING_PAD);
  const x1 = Math.min(width, box.x + box.w + RING_PAD);
  const y1 = Math.min(height, box.y + box.h + RING_PAD);

  const innerX0 = Math.max(x0, box.x);
  const innerY0 = Math.max(y0, box.y);
  const innerX1 = Math.min(x1, box.x + box.w);
  const innerY1 = Math.min(y1, box.y + box.h);

  const outerCount = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const innerCount = Math.max(0, innerX1 - innerX0) * Math.max(0, innerY1 - innerY0);

  const collect = (skipInner: boolean) => {
    const pixels: number[] = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (skipInner && x >= innerX0 && x < innerX1 && y >= innerY0 && y < innerY1) continue;
        const at = (y * width + x) * 4;
        pixels.push(data[at], data[at + 1], data[at + 2]);
      }
    }
    return pixels;
  };

  // No room for a ring: the box fills its own padding, so the crop is all
  // there is to measure.
  if (outerCount <= innerCount) return medianColor(collect(false));

  const ring = collect(true);
  return medianColor(ring.length > 0 ? ring : collect(false));
}

/**
 * Separate glyph pixels from whatever else the OCR box caught.
 *
 * Returns the mask and the dominant text colour.
 */
export function inkMask(
  image: RgbaImage,
  box: OcrBox,
  background: number[],
): { mask: Mask; textColor: number[] } {
  const width = box.w;
  const height = box.h;
  const mask = createMask(width, height);
  if (width <= 0 || height <= 0) return { mask, textColor: background };

  const read = (x: number, y: number) => {
    const at = ((box.y + y) * image.width + (box.x + x)) * 4;
    return [image.data[at], image.data[at + 1], image.data[at + 2]];
  };

  const backgroundDistance = new Float64Array(width * height);
  let furthest = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = read(x, y);
      const distance =
        Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
      backgroundDistance[y * width + x] = distance;
      if (distance > furthest) furthest = distance;
    }
  }

  const threshold = Math.max(MIN_INK_DISTANCE, furthest * INK_DISTANCE_RATIO);
  const candidate = new Uint8Array(width * height);
  const candidatePixels: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (backgroundDistance[index] < threshold) continue;
      candidate[index] = 1;
      const [r, g, b] = read(x, y);
      candidatePixels.push(r, g, b);
    }
  }

  if (candidatePixels.length === 0) return { mask, textColor: background };

  const textColor = medianColor(candidatePixels);
  // `max - min` stands in for saturation. It avoids an HSV conversion and is
  // what actually separates coloured icons from neutral glyphs.
  const textSaturation = Math.max(...textColor) - Math.min(...textColor);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!candidate[index]) continue;
      const [r, g, b] = read(x, y);
      const toText = Math.abs(r - textColor[0]) + Math.abs(g - textColor[1]) + Math.abs(b - textColor[2]);
      if (toText >= TEXT_COLOUR_TOLERANCE) continue;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (saturation > textSaturation + SATURATION_HEADROOM) continue;
      mask.data[index] = 1;
    }
  }

  return { mask, textColor };
}

/**
 * Glyph height from connected components, not from the whole-line box.
 *
 * Brackets, commas and quotes have wildly different extents; the 80th
 * percentile of component heights tracks the body of the text instead.
 *
 * Two corrections on top of that. Thin anti-aliased strokes break a glyph into
 * pieces, so components far shorter than the tallest are dropped before the
 * percentile is taken. And when the percentile still lands well under the ink
 * extent, the glyph fragmented rather than being small -- CJK fills its em
 * box, so the extent is the better answer there.
 */
export function fontHeightPx(mask: Mask, script: "cjk" | "latin" = "cjk"): number {
  const heights = components(mask).map((item) => item.height);
  const extent = mask.height;
  if (heights.length === 0) return extent;

  const tallest = Math.max(...heights);
  const solid = heights.filter((height) => height >= tallest * 0.5);
  const measured = percentile(solid.length > 0 ? solid : heights, HEIGHT_PERCENTILE);

  const floor = extent * (script === "cjk" ? 0.8 : 0.55);
  return measured < floor ? extent : measured;
}

/**
 * The median colour of the eroded mask.
 *
 * Anti-aliased edge pixels are a blend of glyph and background; sampling them
 * washes dark text lighter and light text greyer.
 */
export function coreColor(
  image: RgbaImage,
  origin: { x: number; y: number },
  mask: Mask,
  fallback: number[],
): string {
  const core = erode3x3(mask);

  const gather = (source: Mask) => {
    const pixels: number[] = [];
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        if (!source.data[y * source.width + x]) continue;
        const at = ((origin.y + y) * image.width + (origin.x + x)) * 4;
        pixels.push(image.data[at], image.data[at + 1], image.data[at + 2]);
      }
    }
    return pixels;
  };

  let pixels = gather(core);
  // Too little left after eroding: a hairline stroke, where the blended edge
  // is all there is.
  if (pixels.length / 3 < 8) pixels = gather(mask);

  const [r, g, b] = pixels.length === 0 ? fallback : medianColor(pixels);
  const hex = (value: number) => Math.round(value).toString(16).toUpperCase().padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Stroke half-width from a distance transform, and its variation.
 *
 * The variation separates a serif face, whose strokes swell and taper, from a
 * sans one whose strokes hold an even width.
 */
export function strokeMetrics(mask: Mask): { width: number; variation: number } {
  const distance = distanceTransformL2(mask);

  const values: number[] = [];
  const thick: number[] = [];
  for (let i = 0; i < distance.length; i += 1) {
    if (distance[i] > 0) values.push(distance[i]);
    if (distance[i] > 0.8) thick.push(distance[i]);
  }
  if (values.length === 0) return { width: 0, variation: 0 };

  const width = percentile(values, STROKE_PERCENTILE) * 2;
  const variation = thick.length > 4 ? standardDeviation(thick) / mean(thick) : 0;
  return { width, variation };
}

/**
 * Shear the mask until the vertical projection is most peaked.
 *
 * Vertical strokes line up at the true slant, which maximises the variance of
 * the column sums.
 */
export function slant(mask: Mask): number {
  const { width, height } = mask;
  if (height < 4 || width < 4) return 0;

  let bestAngle = 0;
  let bestVariance = -1;

  // np.arange(-0.05, 0.36, 0.03): fourteen steps, stopping short of 0.36.
  for (let step = 0; ; step += 1) {
    const angle = -0.05 + step * 0.03;
    if (angle >= 0.36) break;

    const sheared = shearNearest(mask, angle);
    const columns = new Float64Array(width);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) columns[x] += sheared.data[y * width + x];
    }

    const spread = variance(columns);
    if (spread > bestVariance) {
      bestAngle = angle;
      bestVariance = spread;
    }
  }

  return bestAngle;
}

/**
 * The column where the text starts, if a bullet glyph precedes it.
 *
 * Returns 0 when there is no bullet. Both this and the textual strip are
 * needed: geometry alone leaves the character in the text, and text alone
 * leaves the mark in the picture.
 */
export function leadingBullet(mask: Mask, glyphHeight: number): number {
  const boxes = components(mask).sort((a, b) => a.left - b.left);
  if (boxes.length < 2 || glyphHeight <= 0) return 0;

  const [first, second] = boxes;
  const gap = second.left - (first.left + first.width);
  if (
    first.width <= glyphHeight * 0.55 &&
    first.height <= glyphHeight * 0.6 &&
    gap >= glyphHeight * 0.18
  ) {
    return second.left;
  }
  return 0;
}

/**
 * Decide weight across a page.
 *
 * Bold is relative to the regular weight of the same family, and a single
 * image may contain no regular sample to compare against. So the ratio is
 * regressed against font size -- it falls with size, because a size-independent
 * anti-aliased fringe is baked into every stroke measurement -- and outliers
 * above the fitted line are called bold.
 */
export function resolveBold(blocks: MeasuredTextBlock[], mode: BoldMode = "auto"): void {
  const setting = String(mode || "auto").trim().toLowerCase();

  if (setting === "off" || blocks.length === 0) {
    for (const block of blocks) block.bold = false;
    return;
  }
  if (setting === "on") {
    for (const block of blocks) block.bold = true;
    return;
  }
  if (setting.startsWith("ratio:")) {
    const parsed = Number.parseFloat(setting.slice("ratio:".length));
    const threshold = Number.isFinite(parsed) ? parsed : 0.145;
    for (const block of blocks) block.bold = block.metrics.strokeRatio >= threshold;
    return;
  }

  const usable = blocks.filter((block) => block.fontSizePt > 0 && block.metrics.strokeRatio > 0);
  // Too few samples to fit a line through; fall back to the fixed threshold.
  if (usable.length < 6) {
    for (const block of blocks) block.bold = block.metrics.strokeRatio >= 0.145;
    return;
  }

  const { slope, intercept } = linearFit(
    usable.map((block) => block.fontSizePt),
    usable.map((block) => block.metrics.strokeRatio),
  );
  const residualOf = (block: MeasuredTextBlock) =>
    block.metrics.strokeRatio - (slope * block.fontSizePt + intercept);

  const cutoff = standardDeviation(usable.map(residualOf)) * 0.6;
  for (const block of blocks) block.bold = residualOf(block) > cutoff;
}

/**
 * Correct near-miss transcriptions against the deck's own copy.
 *
 * Only exact-length near matches are replaced. The deck copy is more reliable
 * than reading pixels, but it must never introduce text that is not on the
 * page.
 */
export function snapToExpected(blocks: MeasuredTextBlock[], expected: string[]): void {
  const pool = expected.map((line) => String(line || "").trim()).filter(Boolean);
  if (pool.length === 0) return;

  for (const block of blocks) {
    const current = block.text.trim();
    if (!current || pool.includes(current)) continue;

    for (const candidate of pool) {
      if (candidate.length !== current.length) continue;
      let differences = 0;
      for (let i = 0; i < current.length; i += 1) {
        if (candidate[i] !== current[i]) differences += 1;
      }
      if (differences && differences <= Math.max(1, Math.floor(current.length / 8))) {
        block.text = candidate;
        break;
      }
    }
  }
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const clampBox = (x: number, y: number, w: number, h: number) => {
  const left = Math.min(1, Math.max(0, x));
  const top = Math.min(1, Math.max(0, y));
  return {
    x: left,
    y: top,
    w: Math.min(1 - left, Math.max(0, w)),
    h: Math.min(1 - top, Math.max(0, h)),
  };
};

/**
 * Measure every OCR box on a page into a styled text block.
 *
 * Reading the characters is the caller's job, so this stays testable without
 * an inference engine and the two halves can be verified apart.
 */
export function measureTextBlocks(
  image: RgbaImage,
  boxes: OcrBox[],
  options: { slideId: string; boldMode?: BoldMode; expected?: string[] } = { slideId: "slide" },
): MeasuredTextBlock[] {
  const { width: pageWidth, height: pageHeight } = image;
  if (pageWidth <= 0 || pageHeight <= 0) return [];

  // Across the width, because that is the axis the slide is pinned to and the
  // height follows the page. Both axes scale by the same factor, so a glyph
  // keeps its proportions whatever shape the source is.
  const ptPerPx = SLIDE_WIDTH_PT / pageWidth;
  const blocks: MeasuredTextBlock[] = [];

  boxes.forEach((raw, index) => {
    // A box that overhangs the page is trimmed to it rather than dropped: the
    // overhang is usually a pixel of slack around text set flush to an edge,
    // and dropping it loses the text entirely.
    const x = Math.min(Math.max(0, Math.round(raw.x)), pageWidth);
    const y = Math.min(Math.max(0, Math.round(raw.y)), pageHeight);
    const box: OcrBox = {
      ...raw,
      x,
      y,
      w: Math.min(Math.round(raw.w), pageWidth - x),
      h: Math.min(Math.round(raw.h), pageHeight - y),
    };
    if (box.w <= 0 || box.h <= 0) return;

    const background = ringBackground(image, box);
    const { mask, textColor } = inkMask(image, box, background);
    if (maskSum(mask) < 4) return;

    // OCR boxes routinely swallow a neighbouring icon. Re-deriving the bounds
    // from the ink is what stops the rebuilt text from sitting on top of it.
    const bounds = inkBounds(mask);
    if (!bounds) return;
    let { left } = bounds;
    const { top, right, bottom } = bounds;

    const stripped = stripBullet(box.text);
    let hadBullet = stripped.hadBullet;
    const text = stripped.text;
    const script: "cjk" | "latin" = isCjk(text) ? "cjk" : "latin";

    let region = cropMask(mask, left, top, right, bottom);
    let glyphPx = fontHeightPx(region, script);

    const bulletStart = leadingBullet(region, glyphPx);
    if (bulletStart) {
      left += bulletStart;
      hadBullet = true;
      region = cropMask(mask, left, top, right, bottom);
      if (maskSum(region) < 4) return;
      glyphPx = fontHeightPx(region, script);
    }

    if (region.width <= 0 || region.height <= 0 || maskSum(region) < 4) return;

    const faceRatio = script === "cjk" ? CJK_FACE_RATIO : LATIN_FACE_RATIO;
    const emPx = glyphPx / faceRatio;

    const stroke = strokeMetrics(region);
    const lean = slant(region);
    const geometry = clampBox(
      (box.x + left) / pageWidth,
      (box.y + top) / pageHeight,
      (right - left) / pageWidth,
      (bottom - top) / pageHeight,
    );

    blocks.push({
      id: `${options.slideId}_t${index + 1}`,
      text,
      ...geometry,
      fontSizePt: round(emPx * ptPerPx, 2),
      color: coreColor(image, { x: box.x + left, y: box.y + top }, region, textColor),
      bold: false,
      italic: lean > ITALIC_SLANT,
      serif: stroke.variation > SERIF_CV,
      script,
      align: "left",
      bullet: hadBullet,
      confidence: round(box.confidence, 3),
      metrics: {
        strokePx: round(stroke.width, 2),
        strokeRatio: emPx > 0 ? round(stroke.width / emPx, 3) : 0,
        strokeCv: round(stroke.variation, 3),
        slant: round(lean, 3),
      },
    });
  });

  resolveBold(blocks, options.boldMode || "auto");
  if (options.expected) snapToExpected(blocks, options.expected);
  return blocks;
}
