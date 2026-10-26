/**
 * Cutting generated asset sheets into transparent images.
 *
 * The sheet is drawn on one flat key colour and the grid is dictated in the
 * prompt, so the crop boxes are derived from the returned image rather than
 * asked for -- one less model call, and one less thing to disagree about.
 *
 * Two rules decide whether a slice is usable, both learned from crops that
 * looked fine in a list and wrong on the page:
 *
 *   * Trim to the drawn pixels, then put the padding back. Trimming without
 *     re-padding shaves the points off stars and flattens round badges.
 *   * Anything still touching its own crop edge is truncated. Widening the
 *     crop only pulls in the neighbour, so the sheet is redrawn instead.
 */

import {
  closeSquare,
  connectedComponentsWithStats,
  createMask,
  erode3x3,
  maskSum,
} from "@/workspaces/ppt/vision/morphology";
import { resizeBilinear } from "@/workspaces/ppt/vision/preprocess";
import { median } from "@/workspaces/ppt/vision/stats";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

/** Below this, a pixel counts as transparent. */
const ALPHA_THRESHOLD = 24;

const DEFAULT_TOLERANCE = 78;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function hexToRgb(value: string): [number, number, number] {
  let text = value.trim().replace(/^#/, "");
  if (text.length === 3) text = text.split("").map((ch) => ch + ch).join("");
  return [
    Number.parseInt(text.slice(0, 2), 16) || 0,
    Number.parseInt(text.slice(2, 4), 16) || 0,
    Number.parseInt(text.slice(4, 6), 16) || 0,
  ];
}

/**
 * Every pixel near the key colour made transparent.
 *
 * The anti-aliased rim of a drawing is part key colour and part drawing, so
 * it survives the distance test and leaves a coloured halo -- most visible on
 * thin light shapes, where the rim is a large share of the object. Those rim
 * pixels are dropped as well, unless dropping them would eat the drawing:
 * a hairline stroke is mostly rim, and keeping its halo beats losing its body.
 */
export function keyToAlpha(
  image: RgbaImage,
  key: string,
  tolerance: number = DEFAULT_TOLERANCE,
): RgbaImage {
  const [keyR, keyG, keyB] = hexToRgb(key);
  const { width, height } = image;
  const opaque = createMask(width, height);

  for (let i = 0; i < width * height; i += 1) {
    const at = i * 4;
    const distance = Math.max(
      Math.abs(image.data[at] - keyR),
      Math.abs(image.data[at + 1] - keyG),
      Math.abs(image.data[at + 2] - keyB),
    );
    opaque.data[i] = distance > tolerance ? 1 : 0;
  }

  const trimmed = erode3x3(opaque);
  const kept = maskSum(trimmed) >= maskSum(opaque) * 0.45 ? trimmed : opaque;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const at = i * 4;
    data[at] = image.data[at];
    data[at + 1] = image.data[at + 1];
    data[at + 2] = image.data[at + 2];
    data[at + 3] = kept.data[i] ? 255 : 0;
  }

  return { data, width, height };
}

/** The tight box around everything opaque, or null when nothing is. */
export function alphaBounds(image: RgbaImage): Rect | null {
  const { width, height } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (image.data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** Which sides the drawing runs off, and how much of the crop it covers. */
export function inspectEdges(image: RgbaImage): { touched: string[]; coverage: number } {
  const { width, height } = image;
  const opaque = (x: number, y: number) => image.data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD;

  const touched: string[] = [];
  let covered = 0;

  for (let x = 0; x < width; x += 1) {
    if (opaque(x, 0) && !touched.includes("top")) touched.push("top");
    if (opaque(x, height - 1) && !touched.includes("bottom")) touched.push("bottom");
  }
  for (let y = 0; y < height; y += 1) {
    if (opaque(0, y) && !touched.includes("left")) touched.push("left");
    if (opaque(width - 1, y) && !touched.includes("right")) touched.push("right");
  }
  for (let i = 0; i < width * height; i += 1) {
    if (image.data[i * 4 + 3] > ALPHA_THRESHOLD) covered += 1;
  }

  return { touched, coverage: covered / Math.max(1, width * height) };
}

/**
 * Lay the raw crops out on a flat key colour, ready to be cleaned.
 *
 * The reverse of describing icons in words and asking for them to be drawn:
 * the icons themselves are sent and the model is asked only to clean them, so
 * nothing is lost in translation -- shape, colour and proportion all arrive
 * as pixels.
 *
 * The wide margins are not decoration. They are what lets the cleaned result
 * be cut apart again by finding blobs, without relying on the model having
 * kept the layout.
 */
export function buildMontage(
  crops: RgbaImage[],
  keyColour: string,
  columns = 4,
  cell = 380,
): { sheet: RgbaImage; columns: number; rows: number } {
  const across = Math.max(1, Math.min(columns, crops.length || 1));
  const down = Math.max(1, Math.ceil((crops.length || 1) / across));

  const width = across * cell;
  const height = down * cell;
  const [keyR, keyG, keyB] = hexToRgb(keyColour);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = keyR;
    data[i * 4 + 1] = keyG;
    data[i * 4 + 2] = keyB;
    data[i * 4 + 3] = 255;
  }

  const inner = Math.floor(cell * 0.62);
  crops.forEach((crop, index) => {
    if (crop.width <= 0 || crop.height <= 0) return;

    const scale = Math.min(inner / crop.width, inner / crop.height);
    const scaledWidth = Math.max(1, Math.round(crop.width * scale));
    const scaledHeight = Math.max(1, Math.round(crop.height * scale));
    const resized = resizeBilinear(crop, scaledWidth, scaledHeight);

    const originX = (index % across) * cell + Math.floor((cell - scaledWidth) / 2);
    const originY = Math.floor(index / across) * cell + Math.floor((cell - scaledHeight) / 2);

    for (let y = 0; y < scaledHeight; y += 1) {
      for (let x = 0; x < scaledWidth; x += 1) {
        const from = (y * scaledWidth + x) * 4;
        const to = ((originY + y) * width + originX + x) * 4;
        data[to] = resized.data[from];
        data[to + 1] = resized.data[from + 1];
        data[to + 2] = resized.data[from + 2];
        data[to + 3] = 255;
      }
    }
  });

  return { sheet: { data, width, height }, columns: across, rows: down };
}

/**
 * Locate the drawn items on a keyed sheet, in reading order.
 *
 * The grid is dictated in the prompt, but image models treat it as a
 * suggestion: asked for five items in a four-wide grid, one will happily
 * leave the third cell empty and put that item in the fourth. Slicing by
 * computed cell index then cuts empty background for every item after the
 * gap, and the whole batch is quietly off by one.
 *
 * So the items are found rather than assumed. The closing pass joins the
 * parts of one drawing -- a badge ring and the glyph inside it are not
 * connected pixels.
 */
export function findBlobs(image: RgbaImage, minAreaFraction = 0.0004): Rect[] {
  const { width, height } = image;
  const alpha = createMask(width, height);
  let any = false;
  for (let i = 0; i < width * height; i += 1) {
    if (image.data[i * 4 + 3] > ALPHA_THRESHOLD) {
      alpha.data[i] = 1;
      any = true;
    }
  }
  if (!any) return [];

  const span = Math.max(9, Math.floor(Math.min(height, width) * 0.03)) | 1;
  const joined = closeSquare(alpha, span);

  const minimum = minAreaFraction * height * width;
  const boxes = connectedComponentsWithStats(joined)
    .filter((component) => component.area >= minimum)
    .map((component) => ({
      x: component.left,
      y: component.top,
      w: component.width,
      h: component.height,
    }));
  if (boxes.length === 0) return [];

  // Reading order, banded into rows: a row's items rarely share a top edge,
  // so sorting by y alone interleaves neighbouring rows.
  const band = Math.max(1, Math.floor(median(boxes.map((box) => box.h)) * 0.6));
  return boxes.sort(
    (a, b) => Math.floor(a.y / band) - Math.floor(b.y / band) || a.x - b.x,
  );
}

/** A rectangular region of an image, copied out with its alpha. */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const width = Math.max(0, Math.min(rect.w, image.width - rect.x));
  const height = Math.max(0, Math.min(rect.h, image.height - rect.y));
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = ((rect.y + y) * image.width + rect.x + x) * 4;
      const to = (y * width + x) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = image.data[from + 3];
    }
  }

  return { data, width, height };
}

export interface SlicedAsset {
  image: RgbaImage;
  /**
   * Sides the drawing still runs off after the padding went back on.
   *
   * That means it was truncated on the sheet itself. Widening the cut only
   * pulls in the neighbour, so the answer is to redraw the sheet rather than
   * to salvage this slice.
   */
  truncated: string[];
  /**
   * How much of the slice is opaque. Nearly all of it means the key colour
   * did not survive the round trip and nothing was made transparent.
   */
  coverage: number;
}

/**
 * One item cut out of a cleaned sheet.
 *
 * The box is grown before it is cut, not after. A blob box is exact by
 * construction -- it is the tight bounds of the drawing -- so cutting it as
 * given shaves the points off stars and flattens round badges, and leaves
 * every slice apparently touching all four of its own edges.
 */
export function sliceAsset(sheet: RgbaImage, rect: Rect, pad = 8): SlicedAsset | null {
  const left = Math.max(0, rect.x - pad);
  const top = Math.max(0, rect.y - pad);
  const right = Math.min(sheet.width, rect.x + rect.w + pad);
  const bottom = Math.min(sheet.height, rect.y + rect.h + pad);

  const cut = cropImage(sheet, { x: left, y: top, w: right - left, h: bottom - top });
  if (cut.width <= 0 || cut.height <= 0) return null;
  if (!alphaBounds(cut)) return null;

  const { touched, coverage } = inspectEdges(cut);
  return { image: cut, truncated: touched, coverage };
}
