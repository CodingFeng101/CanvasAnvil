/**
 * Turning the detector's probability map into text boxes.
 *
 * The model returns one probability per pixel and nothing else. Everything
 * that makes those into boxes happens here, and the defaults match the
 * detector's own post-processing so that a box lands where the reference
 * implementation puts it.
 */

import {
  boundingBox,
  componentOutlines,
  minAreaRect,
  unclipQuad,
  type BinaryMap,
  type Point,
  type Quad,
} from "@/workspaces/ppt/vision/geometry";

export interface DetectionOptions {
  /** Probability above which a pixel is text. */
  threshold: number;
  /** Mean probability a box must reach to be kept. */
  boxThreshold: number;
  /** How far to grow a box back out towards the ink. */
  unclipRatio: number;
  /** Boxes shorter than this on their narrow side are noise. */
  minSize: number;
  maxCandidates: number;
}

export const DEFAULT_DETECTION: DetectionOptions = {
  threshold: 0.3,
  boxThreshold: 0.5,
  unclipRatio: 1.6,
  minSize: 3,
  maxCandidates: 1000,
};

export interface DetectedBox {
  quad: Quad;
  score: number;
}

export function binarize(
  probability: Float32Array,
  width: number,
  height: number,
  threshold: number,
): BinaryMap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 1) data[i] = probability[i] > threshold ? 1 : 0;
  return { data, width, height };
}

/**
 * The mean probability inside a box.
 *
 * Taken over the polygon rather than its bounding rectangle: a slanted line's
 * rectangle is mostly background, which would drag a good detection under the
 * threshold.
 */
export function polygonMeanScore(
  probability: Float32Array,
  width: number,
  height: number,
  quad: Quad,
): number {
  const box = boundingBox(quad, width, height);
  if (box.w <= 0 || box.h <= 0) return 0;

  let total = 0;
  let count = 0;

  for (let row = 0; row < box.h; row += 1) {
    const y = box.y + row + 0.5;

    // Scanline crossings of the polygon at this row.
    const crossings: number[] = [];
    for (let i = 0; i < quad.length; i += 1) {
      const start = quad[i];
      const end = quad[(i + 1) % quad.length];
      if (start.y === end.y) continue;
      const low = Math.min(start.y, end.y);
      const high = Math.max(start.y, end.y);
      if (y < low || y >= high) continue;
      crossings.push(start.x + ((y - start.y) / (end.y - start.y)) * (end.x - start.x));
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = Math.max(box.x, Math.ceil(crossings[pair] - 0.5));
      const to = Math.min(box.x + box.w - 1, Math.floor(crossings[pair + 1] - 0.5));
      for (let x = from; x <= to; x += 1) {
        total += probability[(box.y + row) * width + x];
        count += 1;
      }
    }
  }

  return count === 0 ? 0 : total / count;
}

/**
 * Every text box on a probability map, in the coordinates of the page the map
 * was made from.
 *
 * The map is produced at the detector's own working size, so `scale` carries
 * the boxes back to the page: a box measured on a 736px-wide map has to land
 * on the 1672px-wide slide it came from.
 */
export function boxesFromProbabilityMap(
  probability: Float32Array,
  mapWidth: number,
  mapHeight: number,
  scale: { toWidth: number; toHeight: number },
  options: Partial<DetectionOptions> = {},
): DetectedBox[] {
  const settings = { ...DEFAULT_DETECTION, ...options };
  const bitmap = binarize(probability, mapWidth, mapHeight, settings.threshold);
  const contours = componentOutlines(bitmap).slice(0, settings.maxCandidates);

  const scaleX = scale.toWidth / mapWidth;
  const scaleY = scale.toHeight / mapHeight;
  const boxes: DetectedBox[] = [];

  for (const contour of contours) {
    const tight = minAreaRect(contour);
    if (!tight) continue;
    if (Math.min(tight.width, tight.height) < settings.minSize) continue;

    const score = polygonMeanScore(probability, mapWidth, mapHeight, tight.quad);
    if (score < settings.boxThreshold) continue;

    const grown = minAreaRect(unclipQuad(tight.quad, settings.unclipRatio));
    if (!grown) continue;
    // A box that is still a sliver after growing was never a line of text.
    if (Math.min(grown.width, grown.height) < settings.minSize + 2) continue;

    const onPage = grown.quad.map((point): Point => ({
      x: Math.min(scale.toWidth, Math.max(0, Math.round(point.x * scaleX))),
      y: Math.min(scale.toHeight, Math.max(0, Math.round(point.y * scaleY))),
    })) as Quad;

    boxes.push({ quad: onPage, score });
  }

  return boxes;
}
