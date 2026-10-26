/**
 * Measuring a container once something else has found it.
 *
 * Where a card *is* comes from subtracting the background, which returns a
 * connected component -- close, but bounded by whatever survived the diff.
 * This snaps those bounds onto the real edges and reads the colours off the
 * pixels.
 *
 * The snap matters more than it sounds. Four cards laid out in a grid have to
 * agree with each other; a couple of percent of drift on each is what makes a
 * rebuilt page look subtly wrong even when every piece is present.
 */

import { sobelMagnitudes } from "@/workspaces/ppt/vision/morphology";
import { median } from "@/workspaces/ppt/vision/stats";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

/**
 * Summed across the three channels, how far a pixel must sit from the page
 * behind it to count as something drawn rather than more page.
 */
const INK_DISTANCE = 60;

/** Shapes that are mostly not themselves: their box is nine parts page. */
const THIN_SHAPES = ["line", "arrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "chevron"];

/** Below this share of the page, a shape's box is filled by the shape. */
const SMALL_SHAPE_AREA = 0.015;

/**
 * How far the outline has to sit from the fill to be worth drawing. Low,
 * because a white card on a white page is held together entirely by a
 * one-pixel line, and without it the card is present, selectable, and
 * invisible.
 */
const EDGE_DISTANCE = 16;

/**
 * How far a colour must sit from the fill before it counts as a border or a
 * header bar rather than more of the same panel.
 */
const BORDER_DISTANCE = 40;

/** Share of a corner patch that must match the fill for the corner to be square. */
const CORNER_MATCH = 0.85;

const HEADER_MAX_HEIGHT = 0.34;
const HEADER_MIN_HEIGHT = 0.04;
const HEADER_COVERAGE = 0.7;

export type Rgb = readonly [number, number, number];

export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeasuredPanel {
  /** Snapped bounds, in slide fractions. */
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string | null;
  rounded: boolean;
  /** A solid bar across the top, if the panel has one. */
  header: { x: number; y: number; w: number; h: number; fill: string } | null;
}

const toHex = ([r, g, b]: Rgb) => {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).toUpperCase().padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

const l1 = (a: Rgb, b: Rgb) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const pixelAt = (image: RgbaImage, x: number, y: number): Rgb => {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]];
};

const medianOf = (pixels: Rgb[]): Rgb => {
  if (pixels.length === 0) return [255, 255, 255];
  return [
    median(pixels.map((p) => p[0])),
    median(pixels.map((p) => p[1])),
    median(pixels.map((p) => p[2])),
  ];
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
 * The most common colour in a region, and how much of it there is.
 *
 * Quantised to 16 levels per channel: a gradient card still has one dominant
 * bucket, where exact-colour counting would find none.
 */
export function dominantColour(
  image: RgbaImage,
  box: PanelBox,
): { colour: Rgb; share: number } {
  const counts = new Map<number, number>();
  let total = 0;

  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const [r, g, b] = pixelAt(image, x, y);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      counts.set(key, (counts.get(key) || 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return { colour: [255, 255, 255], share: 0 };

  let winner = 0;
  let best = -1;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      winner = key;
    }
  }

  const members: Rgb[] = [];
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const [r, g, b] = pixelAt(image, x, y);
      if ((((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)) === winner) members.push([r, g, b]);
    }
  }

  return { colour: medianOf(members), share: best / total };
}

/** The page immediately outside the box. */
export function aroundColour(image: RgbaImage, box: PanelBox): Rgb | null {
  const pad = Math.max(3, Math.floor(Math.min(box.w, box.h) * 0.15));
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(image.width, box.x + box.w + pad);
  const y1 = Math.min(image.height, box.y + box.h + pad);

  const outside: Rgb[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const inside =
        x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      if (!inside) outside.push(pixelAt(image, x, y));
    }
  }

  return outside.length < 24 ? null : medianOf(outside);
}

/**
 * The shape's own colour, sampled between its edge and its contents.
 *
 * An elliptical ring at 28-44% of the box clears the border on the way out
 * and whatever is drawn in the middle on the way in: for a numbered badge
 * that ring is all disc, for a card it is all card.
 */
export function bodyColour(image: RgbaImage, box: PanelBox): Rgb | null {
  if (Math.min(box.w, box.h) < 12) return null;

  const centreX = box.x + box.w / 2;
  const centreY = box.y + box.h / 2;
  const outerX = Math.max(1, box.w * 0.44);
  const outerY = Math.max(1, box.h * 0.44);
  const innerX = Math.max(1, box.w * 0.28);
  const innerY = Math.max(1, box.h * 0.28);

  const ring: Rgb[] = [];
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const dx = x + 0.5 - centreX;
      const dy = y + 0.5 - centreY;
      const outside = (dx / outerX) ** 2 + (dy / outerY) ** 2;
      const inside = (dx / innerX) ** 2 + (dy / innerY) ** 2;
      if (outside <= 1 && inside > 1) ring.push(pixelAt(image, x, y));
    }
  }

  return ring.length < 24 ? null : medianOf(ring);
}

/**
 * The colour of whatever is drawn here, for a shape that is mostly not.
 *
 * An arrow, a tick or a hairline rule covers a tenth of its own bounding box;
 * the other nine tenths are the page. Neither the most common colour nor a
 * ring through the middle finds the drawing -- both answer with the
 * background, and the arrow then renders in the background's colour, which is
 * to say it does not render at all.
 */
export function inkColour(image: RgbaImage, box: PanelBox, outside: Rgb): Rgb | null {
  const ink: Rgb[] = [];
  let total = 0;

  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const pixel = pixelAt(image, x, y);
      total += 1;
      if (l1(pixel, outside) > INK_DISTANCE) ink.push(pixel);
    }
  }
  if (total === 0) return null;

  // Enough to be a drawing, and few enough to be a thin one.
  const share = ink.length / total;
  if (ink.length < 24 || share < 0.04 || share > 0.75) return null;
  return medianOf(ink);
}

/**
 * How far a colour sits off the line between the fill and the page.
 *
 * Anything on that line is some mixture of the two -- which is what an
 * anti-aliased boundary is, and what a soft shadow is. Anything off it was
 * painted.
 */
export function offBlend(colour: Rgb, fill: Rgb, page: Rgb | null): number {
  if (!page) return l1(colour, fill);

  const span: Rgb = [page[0] - fill[0], page[1] - fill[1], page[2] - fill[2]];
  const length = span[0] ** 2 + span[1] ** 2 + span[2] ** 2;
  if (length < 1e-6) return l1(colour, fill);

  const offset: Rgb = [colour[0] - fill[0], colour[1] - fill[1], colour[2] - fill[2]];
  const raw = (offset[0] * span[0] + offset[1] * span[1] + offset[2] * span[2]) / length;
  const t = Math.min(1, Math.max(0, raw));

  return (
    Math.abs(offset[0] - t * span[0]) +
    Math.abs(offset[1] - t * span[1]) +
    Math.abs(offset[2] - t * span[2])
  );
}

/**
 * The shape's outline, sampled on the boundary rather than inside it.
 *
 * These borders are one pixel wide. Sampling a couple of pixels in, which is
 * safer for reading a fill, lands past them every time and reports the fill
 * back as its own border.
 *
 * All four sides go into one median, so a card with a coloured header bar
 * across its top is still measured by the three sides that are its border.
 */
export function edgeColour(image: RgbaImage, box: PanelBox, fill: Rgb): Rgb | null {
  let best: Rgb | null = null;
  let furthest = 0;

  for (const offset of [0, 1, -1, 2]) {
    const pieces: Rgb[] = [];

    for (const y of [box.y + offset, box.y + box.h - 1 - offset]) {
      if (y < 0 || y >= image.height) continue;
      for (let x = Math.max(0, box.x); x < Math.min(image.width, box.x + box.w); x += 1) {
        pieces.push(pixelAt(image, x, y));
      }
    }
    for (const x of [box.x + offset, box.x + box.w - 1 - offset]) {
      if (x < 0 || x >= image.width) continue;
      for (let y = Math.max(0, box.y); y < Math.min(image.height, box.y + box.h); y += 1) {
        pieces.push(pixelAt(image, x, y));
      }
    }
    if (pieces.length === 0) continue;

    const colour = medianOf(pieces);
    const distance = l1(colour, fill);
    if (distance > furthest) {
      best = colour;
      furthest = distance;
    }
  }

  return best;
}

/**
 * A square corner is filled; a rounded one is not.
 *
 * The patch is small on purpose. Card radii are typically a few pixels, so a
 * large sample is mostly card even on a rounded corner and the test stops
 * discriminating.
 */
export function isRounded(image: RgbaImage, box: PanelBox, fill: Rgb): boolean {
  const size = Math.max(4, Math.floor(Math.min(box.w, box.h) * 0.05));
  const corners: PanelBox[] = [
    { x: box.x, y: box.y, w: size, h: size },
    { x: box.x + box.w - size, y: box.y, w: size, h: size },
    { x: box.x, y: box.y + box.h - size, w: size, h: size },
    { x: box.x + box.w - size, y: box.y + box.h - size, w: size, h: size },
  ];

  let open = 0;
  for (const corner of corners) {
    let matching = 0;
    let total = 0;
    for (let y = corner.y; y < corner.y + corner.h; y += 1) {
      for (let x = corner.x; x < corner.x + corner.w; x += 1) {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        total += 1;
        if (l1(pixelAt(image, x, y), fill) < 34) matching += 1;
      }
    }
    if (total > 0 && matching / total < CORNER_MATCH) open += 1;
  }

  return open >= 3;
}

/**
 * A solid bar across the top of a panel.
 *
 * Losing it leaves a title floating on a panel edge with nothing behind it.
 */
export function findHeader(
  image: RgbaImage,
  box: PanelBox,
  fill: Rgb,
): { x: number; y: number; w: number; h: number; fill: string } | null {
  const inset = Math.max(1, Math.floor(Math.min(box.w, box.h) * 0.02));
  const bandTop = box.y + inset;
  const bandBottom = box.y + Math.floor(box.h * HEADER_MAX_HEIGHT);
  const bandLeft = box.x + inset;
  const bandRight = box.x + box.w - inset;
  if (bandBottom <= bandTop || bandRight <= bandLeft) return null;

  let rows = 0;
  for (let y = bandTop; y < bandBottom; y += 1) {
    let differing = 0;
    let total = 0;
    for (let x = bandLeft; x < bandRight; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      total += 1;
      if (l1(pixelAt(image, x, y), fill) > BORDER_DISTANCE) differing += 1;
    }
    if (total === 0 || differing / total < HEADER_COVERAGE) break;
    rows += 1;
  }

  if (rows < Math.max(3, box.h * HEADER_MIN_HEIGHT)) return null;

  const header = { x: bandLeft, y: bandTop, w: bandRight - bandLeft, h: rows };
  const { colour, share } = dominantColour(image, header);
  if (share < 0.35 || l1(colour, fill) <= BORDER_DISTANCE) return null;

  const bounds = clampBox(
    box.x / image.width,
    box.y / image.height,
    box.w / image.width,
    (rows + inset) / image.height,
  );
  return { ...bounds, fill: toHex(colour) };
}

/**
 * Move one edge onto the strongest gradient line near where it was told.
 *
 * A connected component locates a card to within a few pixels of whatever
 * survived the diff, which is close enough to find the real edge and too
 * coarse to draw with. The gradient profile across the search band has an
 * unmistakable peak at the boundary; anything flatter than twice the local
 * mean is noise, and the original guess stands.
 */
export function snapEdge(profile: Float32Array, guess: number, reach: number): number {
  const low = Math.max(0, guess - reach);
  const high = Math.min(profile.length, guess + reach + 1);
  if (high - low < 3) return guess;

  let sum = 0;
  for (let i = low; i < high; i += 1) sum += profile[i];
  const threshold = (sum / (high - low)) * 2;

  // The nearest qualifying edge, not the strongest one. Two cards side by
  // side put both of their borders inside the same search band, and the
  // neighbour's is often the harder line; snapping to it swallows the gap
  // between them and the pair renders as one wide panel.
  let best = -1;
  let nearest = Infinity;
  for (let i = low; i < high; i += 1) {
    if (profile[i] < threshold) continue;
    const distance = Math.abs(i - guess);
    if (distance < nearest) {
      nearest = distance;
      best = i;
    }
  }

  return best < 0 ? guess : best;
}

/**
 * Snap an approximate card box to the pixels, then measure it.
 *
 * Every number that ends up in the deck -- bounds, fill, stroke, corner
 * style, header bar -- is measured here rather than inferred anywhere else.
 */
export function refinePanel(
  image: RgbaImage,
  bounds: { x: number; y: number; w: number; h: number },
  shape = "rect",
): MeasuredPanel {
  const gradients = sobelMagnitudes(image);
  const pageWidth = image.width;
  const pageHeight = image.height;

  let x = Math.floor(bounds.x * pageWidth);
  let y = Math.floor(bounds.y * pageHeight);
  let w = Math.max(4, Math.floor(bounds.w * pageWidth));
  let h = Math.max(4, Math.floor(bounds.h * pageHeight));

  const innerTop = Math.max(0, y + Math.floor(h * 0.15));
  const innerBottom = Math.min(pageHeight, y + h - Math.floor(h * 0.15));
  const innerLeft = Math.max(0, x + Math.floor(w * 0.15));
  const innerRight = Math.min(pageWidth, x + w - Math.floor(w * 0.15));

  if (innerBottom > innerTop && innerRight > innerLeft) {
    // Averaged down the card's own middle, so a neighbour's edge outside the
    // band contributes nothing to the profile this card is snapped against.
    const columnProfile = new Float32Array(pageWidth);
    for (let column = 0; column < pageWidth; column += 1) {
      let total = 0;
      for (let row = innerTop; row < innerBottom; row += 1) total += gradients.x[row * pageWidth + column];
      columnProfile[column] = total / (innerBottom - innerTop);
    }
    const rowProfile = new Float32Array(pageHeight);
    for (let row = 0; row < pageHeight; row += 1) {
      let total = 0;
      for (let column = innerLeft; column < innerRight; column += 1) total += gradients.y[row * pageWidth + column];
      rowProfile[row] = total / (innerRight - innerLeft);
    }

    const left = snapEdge(columnProfile, x, Math.max(4, Math.floor(w * 0.08)));
    const right = snapEdge(columnProfile, x + w, Math.max(4, Math.floor(w * 0.08)));
    const top = snapEdge(rowProfile, y, Math.max(4, Math.floor(h * 0.08)));
    const bottom = snapEdge(rowProfile, y + h, Math.max(4, Math.floor(h * 0.08)));
    if (right - left >= 4 && bottom - top >= 4) {
      x = left;
      y = top;
      w = right - left;
      h = bottom - top;
    }
  }

  x = Math.max(0, Math.min(pageWidth - 2, x));
  y = Math.max(0, Math.min(pageHeight - 2, y));
  w = Math.max(2, Math.min(pageWidth - x, w));
  h = Math.max(2, Math.min(pageHeight - y, h));
  const box: PanelBox = { x, y, w, h };

  let fill = dominantColour(image, box).colour;

  // Which measurement to trust is a property of the shape, and the shape is
  // the one thing the detector was asked for. Choosing from the result
  // instead -- "this came out the same colour as the page, so it must be
  // wrong" -- is not sound: a white card on a near-white page really is that
  // close, and four identical cards then come out two white and two blue
  // depending on which side of a threshold each one landed.
  const small = (w * h) / (pageWidth * pageHeight) < SMALL_SHAPE_AREA;
  const page = aroundColour(image, box);

  if (THIN_SHAPES.includes(shape)) {
    const ink = page ? inkColour(image, box, page) : null;
    if (ink) fill = ink;
  } else if (shape === "oval" || small) {
    const body = bodyColour(image, box);
    if (body) fill = body;
  }

  // Every shape has an anti-aliased edge, and its colour is a blend of the
  // fill and the page behind it. A drawn outline is not: it is its own
  // colour, off the line between those two. Testing distance from the fill
  // alone puts a white ring around every blue badge; testing distance from
  // the blend keeps the one-pixel line that is all a white card on a white
  // page has to show for itself.
  let border = edgeColour(image, box, fill);
  if (!border || offBlend(border, fill, page) <= EDGE_DISTANCE) border = fill;

  return {
    ...clampBox(x / pageWidth, y / pageHeight, w / pageWidth, h / pageHeight),
    fill: toHex(fill),
    stroke: l1(border, fill) > EDGE_DISTANCE ? toHex(border) : null,
    rounded: isRounded(image, box, fill),
    header: findHeader(image, box, fill),
  };
}
