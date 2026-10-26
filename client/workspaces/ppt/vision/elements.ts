/**
 * Measuring an element once something else has pointed at it.
 *
 * Finding the elements is the vision model's job -- deciding whether a thing
 * is a card or a picture of a database is a semantic judgement. What stays
 * here is the half local code is good at: given a box, snap it to the pixels,
 * read its colours, and work out whether its background is flat enough to key
 * out without paying for an image call.
 *
 * The kind decided here is a fallback. The caller overrides it with the
 * model's answer, which is the one thing the model was actually asked for --
 * these numbers exist to fill in what it was never asked for.
 */

import { canny } from "@/workspaces/ppt/vision/edges";
import { arcLength, contourArea, traceContours } from "@/workspaces/ppt/vision/contours";
import { closeSquare, createMask, erodeSquare, maskSum, type Mask } from "@/workspaces/ppt/vision/morphology";
import { median, percentile } from "@/workspaces/ppt/vision/stats";
import { normalizeShapeName, type ShapeName } from "@/workspaces/ppt/lib/shapes";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

// --- classification, for the numbers the model is not asked for -------------

const LINE_ASPECT = 7;
const FLAT_DOMINANCE = 0.82;
const FLAT_FILL_RATIO = 0.86;
const FLAT_EDGE_DENSITY = 0.045;
const CIRCULARITY = 0.8;

/**
 * Holding this many text blocks or elements makes something a container,
 * whatever its pixels say.
 */
const CONTAINER_MIN_CHILDREN = 2;

/**
 * An icon never covers this much of a page. Anything bigger that reached the
 * icon branch is a misread container, and cutting a whole card out to be
 * redrawn comes back as its contents blown up to card size.
 */
const MAX_ICON_AREA = 0.04;

/**
 * How uniform the ring around an icon must be for its background to be keyed
 * out locally instead of paying for an image call.
 */
const FLAT_RING_SPREAD = 26;

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box in slide fractions. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Rgb = readonly [number, number, number];

const toHex = ([r, g, b]: Rgb) => {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).toUpperCase().padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

const l1 = (a: Rgb, b: Rgb) =>
  Math.round(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]));

const pixelAt = (image: RgbaImage, x: number, y: number): Rgb => {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]];
};

/**
 * The most common colour among some pixels, and its share.
 *
 * Quantised, so a gradient still resolves to one bucket where exact-colour
 * counting would find none.
 */
export function dominantOf(pixels: Rgb[]): { colour: Rgb; share: number } {
  if (pixels.length === 0) return { colour: [255, 255, 255], share: 0 };

  const counts = new Map<number, number>();
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let winner = 0;
  let best = -1;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      winner = key;
    }
  }

  const members = pixels.filter(
    ([r, g, b]) => (((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)) === winner,
  );
  return {
    colour: [
      median(members.map((p) => p[0])),
      median(members.map((p) => p[1])),
      median(members.map((p) => p[2])),
    ],
    share: best / pixels.length,
  };
}

/**
 * The colour just outside a box, and how varied it is.
 *
 * Read on the source page, not on a crop: the question is what this element
 * is actually sitting on.
 */
export function ringStats(
  image: RgbaImage,
  box: PixelBox,
  pad = 6,
): { colour: Rgb; spread: number } {
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(image.width, box.x + box.w + pad);
  const y1 = Math.min(image.height, box.y + box.h + pad);
  if (x1 <= x0 || y1 <= y0) return { colour: [255, 255, 255], spread: 255 };

  const ring: Rgb[] = [];
  const all: Rgb[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const pixel = pixelAt(image, x, y);
      all.push(pixel);
      const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      if (!inside) ring.push(pixel);
    }
  }

  const sample = ring.length > 0 ? ring : all;
  if (sample.length === 0) return { colour: [255, 255, 255], spread: 255 };

  const lane = (index: 0 | 1 | 2) => sample.map((pixel) => pixel[index]);
  // Interquartile spread rather than standard deviation: one dark object
  // clipping the ring should not disqualify an otherwise flat field.
  const spread =
    ([0, 1, 2] as const).reduce<number>(
      (total, index) => total + (percentile(lane(index), 75) - percentile(lane(index), 25)),
      0,
    ) / 3;

  return { colour: [median(lane(0)), median(lane(1)), median(lane(2))], spread };
}

/**
 * Approximate an element's own pixels inside a box someone else gave us.
 *
 * Whatever differs from the colour surrounding the box is the element; the
 * holes its content punched are filled back in, because a card is solid.
 */
export function maskForBox(image: RgbaImage, box: PixelBox): Mask {
  const mask = createMask(box.w, box.h);
  if (box.w <= 0 || box.h <= 0) return mask;

  const { colour } = ringStats(image, box);
  for (let row = 0; row < box.h; row += 1) {
    for (let column = 0; column < box.w; column += 1) {
      const pixel = pixelAt(image, box.x + column, box.y + row);
      const distance = Math.max(
        Math.abs(pixel[0] - colour[0]),
        Math.abs(pixel[1] - colour[1]),
        Math.abs(pixel[2] - colour[2]),
      );
      mask.data[row * box.w + column] = distance > 18 ? 1 : 0;
    }
  }

  const span = Math.max(3, Math.floor(Math.min(box.w, box.h) * 0.08)) | 1;
  return closeSquare(mask, span);
}

/**
 * Punch the page's text and other elements out of a candidate's mask.
 *
 * A card is only plain if you ignore what is sitting on it. Counting the
 * heading, the bullets and the icon as part of the card drags its "one
 * colour" score down and its "internal detail" score up.
 */
export function clearRegions(
  mask: Mask,
  box: PixelBox,
  page: { width: number; height: number },
  regions: Box[],
): Mask {
  if (regions.length === 0) return mask;

  const out: Mask = { data: mask.data.slice(), width: mask.width, height: mask.height };
  for (const region of regions) {
    const left = Math.round(region.x * page.width) - box.x;
    const top = Math.round(region.y * page.height) - box.y;
    const right = Math.round((region.x + region.w) * page.width) - box.x;
    const bottom = Math.round((region.y + region.h) * page.height) - box.y;
    if (right <= 0 || bottom <= 0 || left >= box.w || top >= box.h) continue;

    for (let row = Math.max(0, top); row < Math.min(box.h, bottom); row += 1) {
      for (let column = Math.max(0, left); column < Math.min(box.w, right); column += 1) {
        out.data[row * box.w + column] = 0;
      }
    }
  }
  return out;
}

export interface ElementMeasurements {
  colour: Rgb;
  dominance: number;
  fillRatio: number;
  aspect: number;
  edgeDensity: number;
}

/** Colour, uniformity, fill, aspect and internal detail. */
export function measureElement(
  image: RgbaImage,
  blob: Mask,
  box: PixelBox,
  exclude: Box[] = [],
): ElementMeasurements {
  const cleared = exclude.length > 0 ? clearRegions(blob, box, image, exclude) : blob;
  // Too little left to measure means the exclusions ate the element; the
  // whole box is a worse answer than nothing at all is.
  const usable = maskSum(cleared) >= 20 ? cleared : null;

  const pixels: Rgb[] = [];
  let inside = 0;
  for (let row = 0; row < box.h; row += 1) {
    for (let column = 0; column < box.w; column += 1) {
      const on = usable ? usable.data[row * box.w + column] !== 0 : true;
      if (!on) continue;
      inside += 1;
      pixels.push(pixelAt(image, box.x + column, box.y + row));
    }
  }

  const { colour, share } = dominantOf(pixels);
  const fillRatio = inside / Math.max(1, box.w * box.h);
  const aspect = Math.max(box.w, box.h) / Math.max(1, Math.min(box.w, box.h));

  const core = erodeSquare(blob, 5);
  let edgeDensity = 0;
  if (maskSum(core) > 40) {
    const region: RgbaImage = {
      data: new Uint8ClampedArray(box.w * box.h * 4),
      width: box.w,
      height: box.h,
    };
    for (let row = 0; row < box.h; row += 1) {
      for (let column = 0; column < box.w; column += 1) {
        const [r, g, b] = pixelAt(image, box.x + column, box.y + row);
        const at = (row * box.w + column) * 4;
        region.data[at] = r;
        region.data[at + 1] = g;
        region.data[at + 2] = b;
        region.data[at + 3] = 255;
      }
    }

    const edges = canny(region, 60, 160);
    let onCore = 0;
    let coreCount = 0;
    for (let i = 0; i < core.data.length; i += 1) {
      if (!core.data[i]) continue;
      coreCount += 1;
      if (edges.data[i]) onCore += 1;
    }
    edgeDensity = coreCount > 0 ? onCore / coreCount : 0;
  }

  return { colour, dominance: share, fillRatio, aspect, edgeDensity };
}

/** How close a blob is to a circle: 1 is a perfect one. */
export function circularity(blob: Mask): number {
  const contours = traceContours(blob);
  if (contours.length === 0) return 0;

  let biggest = contours[0];
  let biggestArea = contourArea(biggest);
  for (const contour of contours.slice(1)) {
    const area = contourArea(contour);
    if (area > biggestArea) {
      biggest = contour;
      biggestArea = area;
    }
  }

  const perimeter = arcLength(biggest, true);
  if (perimeter <= 0) return 0;
  return (4 * Math.PI * biggestArea) / (perimeter * perimeter);
}

/** Rounded corners leave the corner of the bounding box empty. */
export function cornersOpen(blob: Mask): boolean {
  const size = Math.max(4, Math.floor(Math.min(blob.width, blob.height) * 0.05));
  const corners = [
    { x: 0, y: 0 },
    { x: blob.width - size, y: 0 },
    { x: 0, y: blob.height - size },
    { x: blob.width - size, y: blob.height - size },
  ];

  let open = 0;
  for (const corner of corners) {
    let total = 0;
    let set = 0;
    for (let row = corner.y; row < corner.y + size; row += 1) {
      for (let column = corner.x; column < corner.x + size; column += 1) {
        if (row < 0 || column < 0 || row >= blob.height || column >= blob.width) continue;
        total += 1;
        if (blob.data[row * blob.width + column]) set += 1;
      }
    }
    if (total > 0 && set / total < 0.85) open += 1;
  }
  return open >= 3;
}

/** The preset a measured blob looks most like. */
export function shapeOf(blob: Mask, aspect: number): ShapeName {
  if (aspect >= LINE_ASPECT) return "line";
  if (circularity(blob) >= CIRCULARITY) return "oval";
  return normalizeShapeName(cornersOpen(blob) ? "round_rect" : "rect");
}

export interface BuiltElement {
  /** The fallback classification. The model's answer overrides it. */
  kind: "geometry" | "icon";
  shape: ShapeName;
  fill: string;
  ringColour: string;
  /**
   * The background around this icon is flat enough to key out locally, with
   * no image call. On a gradient this leaves half the background behind,
   * which is why the ring is tested first.
   */
  keyable: boolean;
  measurements: ElementMeasurements & { ringDistance: number; ringSpread: number };
}

/**
 * Measure one located element and fill in everything but its identity.
 *
 * `exclude` lists what sits on top of it and `contains` counts those: a card
 * holding a heading and three bullets is a container whatever its pixels say,
 * because content drawn all over it makes it look like a drawing.
 */
export function buildElement(
  image: RgbaImage,
  blob: Mask,
  box: PixelBox,
  options: { exclude?: Box[]; contains?: number } = {},
): BuiltElement | null {
  if (box.w <= 0 || box.h <= 0) return null;

  const measurements = measureElement(image, blob, box, options.exclude || []);
  const ring = ringStats(image, box);
  const ringDistance = l1(measurements.colour, ring.colour);

  const flat =
    measurements.dominance >= FLAT_DOMINANCE &&
    measurements.fillRatio >= FLAT_FILL_RATIO &&
    measurements.edgeDensity <= FLAT_EDGE_DENSITY;
  const container = (options.contains || 0) >= CONTAINER_MIN_CHILDREN;
  const tooBig = (box.w * box.h) / (image.width * image.height) >= MAX_ICON_AREA;

  const geometry =
    flat || container || tooBig || (measurements.aspect >= LINE_ASPECT && measurements.dominance >= 0.75);

  return {
    kind: geometry ? "geometry" : "icon",
    // A wide bar holding icons and captions is a panel, not a rule; only
    // something empty gets to be a line.
    shape: geometry ? shapeOf(blob, container ? 1 : measurements.aspect) : "rect",
    fill: toHex(measurements.colour),
    ringColour: toHex(ring.colour),
    keyable: !geometry && ring.spread <= FLAT_RING_SPREAD && ringDistance >= 70,
    measurements: { ...measurements, ringDistance, ringSpread: ring.spread },
  };
}

/**
 * Make an icon transparent by removing the flat colour behind it.
 *
 * Only worth using when the ring around the icon was uniform -- see
 * `keyable`. It costs nothing, where the alternative is an image call, but on
 * a gradient it leaves half the background behind.
 */
export function keyLocal(crop: RgbaImage, ringColour: string, tolerance = 60): RgbaImage {
  const text = ringColour.replace(/^#/, "");
  const target: Rgb = [
    Number.parseInt(text.slice(0, 2), 16) || 0,
    Number.parseInt(text.slice(2, 4), 16) || 0,
    Number.parseInt(text.slice(4, 6), 16) || 0,
  ];

  const { width, height } = crop;
  const opaque = createMask(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const at = i * 4;
    const distance = Math.max(
      Math.abs(crop.data[at] - target[0]),
      Math.abs(crop.data[at + 1] - target[1]),
      Math.abs(crop.data[at + 2] - target[2]),
    );
    opaque.data[i] = distance > tolerance ? 1 : 0;
  }

  // Drop the blend rim, which is part background colour and shows as a halo.
  const trimmed = erodeSquare(opaque, 3);
  const kept = maskSum(trimmed) >= maskSum(opaque) * 0.5 ? trimmed : opaque;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const at = i * 4;
    data[at] = crop.data[at];
    data[at + 1] = crop.data[at + 1];
    data[at + 2] = crop.data[at + 2];
    data[at + 3] = kept.data[i] ? 255 : 0;
  }

  return { data, width, height };
}
