/**
 * Lifting the drawings off a page as transparent pictures.
 *
 * An icon is never cut out and shipped. A crop taken from the page carries
 * the card colour behind it and the edge of whatever it sat on, so pasting it
 * onto a clean background leaves a dirty rectangle every time. The crop is
 * only ever an edit target: it is sent to an image model to be cleaned, and
 * what comes back is what ships.
 *
 * Crops go up in sheets rather than one at a time. One request per icon is
 * both slow and inconsistent -- a page's icons come back in eight different
 * interpretations of "clean" -- where one sheet of eight gets one treatment.
 */

import {
  buildMontage,
  findBlobs,
  keyToAlpha,
  sliceAsset,
  type Rect,
  type SlicedAsset,
} from "@/workspaces/ppt/vision/sheets";
import { median } from "@/workspaces/ppt/vision/stats";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

/** One chroma key for the whole run, far from anything a slide uses. */
export const DEFAULT_KEY_COLOUR = "#FF00FF";

/**
 * Icons per sheet.
 *
 * Eight is what fits at a size the model can still see detail in. More than
 * that and small icons come back smoothed away.
 */
export const SHEET_SIZE = 8;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cut an icon out with a margin, for the model to retouch.
 *
 * Anything belonging to a *different* element is painted out first. Without
 * that, a generous margin drags the badge next door into the frame, the sheet
 * comes back holding more objects than it has cells, and every icon after it
 * is handed the wrong picture.
 */
export function cropForIcon(
  image: RgbaImage,
  box: Box,
  neighbours: Box[] = [],
  padFraction = 0.12,
): RgbaImage {
  const pageWidth = image.width;
  const pageHeight = image.height;

  const x = Math.round(box.x * pageWidth);
  const y = Math.round(box.y * pageHeight);
  const w = Math.max(1, Math.round(box.w * pageWidth));
  const h = Math.max(1, Math.round(box.h * pageHeight));

  const pad = Math.min(Math.floor(Math.max(w, h) * padFraction), 24) + 2;
  const x0 = Math.max(0, x - pad);
  const y0 = Math.max(0, y - pad);
  const x1 = Math.min(pageWidth, x + w + pad);
  const y1 = Math.min(pageHeight, y + h + pad);

  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = ((y0 + row) * pageWidth + x0 + column) * 4;
      const to = (row * width + column) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = 255;
    }
  }

  const crop: RgbaImage = { data, width, height };
  if (neighbours.length === 0) return crop;

  // Filled with the crop's own median colour, so an erased neighbour reads as
  // background rather than as a block the model tries to keep.
  const lane = (offset: number) => {
    const values: number[] = [];
    for (let i = 0; i < width * height; i += 1) values.push(data[i * 4 + offset]);
    return Math.round(median(values));
  };
  const background = [lane(0), lane(1), lane(2)];

  for (const neighbour of neighbours) {
    const left = Math.round(neighbour.x * pageWidth) - x0;
    const top = Math.round(neighbour.y * pageHeight) - y0;
    const right = Math.round((neighbour.x + neighbour.w) * pageWidth) - x0;
    const bottom = Math.round((neighbour.y + neighbour.h) * pageHeight) - y0;
    if (right <= 0 || bottom <= 0 || left >= width || top >= height) continue;

    for (let row = Math.max(0, top); row < Math.min(height, bottom); row += 1) {
      for (let column = Math.max(0, left); column < Math.min(width, right); column += 1) {
        const at = (row * width + column) * 4;
        data[at] = background[0];
        data[at + 1] = background[1];
        data[at + 2] = background[2];
      }
    }
  }

  return crop;
}

/**
 * Where a cleaned drawing goes, so that its own pixels land in the measured
 * box.
 *
 * Filling the box in both directions independently is the obvious thing and
 * it is wrong: the box comes from the detector and is routinely a fifth wider
 * than the drawing it points at, so a shield comes out squat and a monitor
 * comes out narrow. The drawing's proportions are the one thing the cleaned
 * picture definitely got right -- they came from the page as pixels -- so the
 * box decides position and size, never shape.
 *
 * `aspect` is the slide's width divided by its height, which is what makes a
 * fraction of the page's width and a fraction of its height comparable.
 */
export function inkAlignedBox(asset: RgbaImage, target: Box, aspect = 16 / 9): Box {
  const { data, width, height } = asset;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 24) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return target;

  const inkWidth = right - left + 1;
  const inkHeight = bottom - top + 1;

  // In a common unit, because a fraction of the page's width and a fraction
  // of its height are not the same distance on a widescreen slide.
  const scale = Math.min((target.w * aspect) / inkWidth, target.h / inkHeight);
  const drawnWidth = (inkWidth * scale) / aspect;
  const drawnHeight = inkHeight * scale;
  const wholeWidth = (width * scale) / aspect;
  const wholeHeight = height * scale;

  // Centre the drawing in the box, then back out to where the picture's own
  // top-left corner has to go for that to happen.
  return {
    x: target.x + (target.w - drawnWidth) / 2 - (left / width) * wholeWidth,
    y: target.y + (target.h - drawnHeight) / 2 - (top / height) * wholeHeight,
    w: wholeWidth,
    h: wholeHeight,
  };
}

export interface IconRequest {
  id: string;
  /** Where it sits on the page, in slide fractions. */
  box: Box;
  /** What the detector said it is, passed on so the cleaner knows what it holds. */
  desc: string;
  /** Positions of the same drawing elsewhere on this page. */
  alsoAt?: Box[];
}

export interface IconSheet {
  /** The icons on this sheet, in the order they were laid out. */
  requests: IconRequest[];
  montage: RgbaImage;
  columns: number;
  rows: number;
}

/**
 * The crops for one page, laid out in sheets of `SHEET_SIZE`.
 *
 * Every icon on a sheet comes from the same page, so one cleaning instruction
 * suits all of them and re-running one page can never disturb another's.
 */
export function buildIconSheets(
  image: RgbaImage,
  requests: IconRequest[],
  keyColour = DEFAULT_KEY_COLOUR,
  perSheet = SHEET_SIZE,
): IconSheet[] {
  const sheets: IconSheet[] = [];

  for (let start = 0; start < requests.length; start += perSheet) {
    const batch = requests.slice(start, start + perSheet);
    const crops = batch.map((request) =>
      cropForIcon(
        image,
        request.box,
        requests.filter((other) => other !== request).map((other) => other.box),
      ),
    );
    const { sheet, columns, rows } = buildMontage(crops, keyColour);
    sheets.push({ requests: batch, montage: sheet, columns, rows });
  }

  return sheets;
}

export interface CutAsset {
  request: IconRequest;
  asset: SlicedAsset;
}

/**
 * Cut a cleaned sheet back into one picture per icon.
 *
 * The blobs are found rather than assumed from the grid, so a model that
 * skips a cell does not hand every icon after it the wrong picture. When the
 * counts still disagree, the extra or missing entries are reported rather
 * than paired up hopefully: a mispaired icon is drawn in the wrong place on
 * the page, which is worse than a missing one.
 */
export function cutCleanedSheet(
  cleaned: RgbaImage,
  sheet: IconSheet,
  keyColour = DEFAULT_KEY_COLOUR,
  notes: string[] = [],
): CutAsset[] {
  const keyed = keyToAlpha(cleaned, keyColour);
  const blobs: Rect[] = findBlobs(keyed);

  if (blobs.length !== sheet.requests.length) {
    notes.push(
      `sheet came back with ${blobs.length} drawings for ${sheet.requests.length} icons; ` +
        "pairing only the ones that line up",
    );
  }

  // Scaled to one cell, so a dense sheet is not padded into its neighbours
  // and a sparse one still gets room around each drawing.
  const pad =
    Math.floor((Math.min(keyed.width, keyed.height) / Math.max(1, sheet.columns)) * 0.06) + 8;

  const cut: CutAsset[] = [];
  const pairs = Math.min(blobs.length, sheet.requests.length);
  for (let index = 0; index < pairs; index += 1) {
    const asset = sliceAsset(keyed, blobs[index], pad);
    if (!asset) {
      notes.push(`"${sheet.requests[index].desc.slice(0, 24) || sheet.requests[index].id}" came back empty`);
      continue;
    }
    const label = sheet.requests[index].desc.slice(0, 24) || sheet.requests[index].id;
    if (asset.truncated.length > 0) {
      notes.push(`"${label}" is cut off on the ${asset.truncated.join(", ")}; the sheet needs redrawing`);
    }
    // Nothing was made transparent, which means the key colour did not
    // survive: the drawing will ship with its background attached.
    if (asset.coverage > 0.92) {
      notes.push(`"${label}" came back almost fully opaque; the key colour may not have survived`);
    }
    cut.push({ request: sheet.requests[index], asset });
  }

  return cut;
}
