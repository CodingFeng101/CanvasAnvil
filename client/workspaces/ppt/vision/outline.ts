/**
 * Tracing a shape's own outline, for the ones no preset describes.
 *
 * A wave divider, an angled banner, an elbow connector and a folded ribbon
 * are all flat blocks of one colour with an outline PowerPoint is perfectly
 * happy to hold -- as a freeform, which is an ordinary editable shape with an
 * arbitrary path rather than a picture. What none of them is, is a rectangle.
 *
 * The path is traced from the pixels, never asked for. A model that cannot
 * place a bounding box to five percent is not going to hand back forty
 * vertices, and it does not have to: the mask already knows where the edge is.
 *
 * Every trace is checked against the mask it came from before it is allowed
 * out. A freeform that does not cover what it was traced from is worse than
 * no freeform at all -- a wrong outline in the deck's own colours reads as a
 * design decision, where a missing shape reads as a bug -- so a trace that
 * does not match is refused and the caller falls back to a picture.
 */

import {
  approxPolyDp,
  arcLength,
  contourArea,
  fillPolygon,
  intersectionOverUnion,
  traceContours,
} from "@/workspaces/ppt/vision/contours";
import type { Mask } from "@/workspaces/ppt/vision/morphology";

/** A trace has to cover this much of the mask, and be covered by it. */
const MIN_AGREEMENT = 0.9;

/**
 * Simplification, as a fraction of the contour's perimeter. Small enough that
 * a curve survives as a dense run of short segments, large enough that pixel
 * noise does not become forty vertices along one straight edge.
 */
const SIMPLIFY = 0.004;

/** More than this and the shape was never a flat block; it is a drawing. */
const MAX_POINTS = 120;

/** Below this a blob is noise, not a shape worth an outline. */
const MIN_AREA = 32;

/**
 * The outline of the largest thing in `mask`, in fractions of its own box.
 *
 * Returns null when the trace disagrees with the mask, which is the signal to
 * stop treating this as a native shape and fall back to a picture.
 *
 * Points are relative to the shape's own box rather than to the page -- the
 * reference implementation stores page fractions, but a deck that can be
 * edited has to be able to move and resize a freeform without rewriting every
 * vertex, and box-relative points survive both.
 */
export function tracePolygon(mask: Mask): Array<readonly [number, number]> | null {
  if (!mask || mask.width <= 0 || mask.height <= 0) return null;

  const contours = traceContours(mask);
  if (contours.length === 0) return null;

  let biggest = contours[0];
  let biggestArea = contourArea(biggest);
  for (const contour of contours.slice(1)) {
    const area = contourArea(contour);
    if (area > biggestArea) {
      biggest = contour;
      biggestArea = area;
    }
  }
  if (biggestArea < MIN_AREA) return null;

  const approximated = approxPolyDp(biggest, SIMPLIFY * arcLength(biggest, true));
  if (approximated.length < 3 || approximated.length > MAX_POINTS) return null;

  // Does the outline actually describe the shape? Anything with a hole in it,
  // a second piece beside it, or an edge too soft to trace fails here.
  const drawn = fillPolygon(approximated, mask.width, mask.height);
  if (intersectionOverUnion(drawn, mask) < MIN_AGREEMENT) return null;

  return approximated.map(
    (point) => [point.x / mask.width, point.y / mask.height] as const,
  );
}

/**
 * How much of a ring's radius is hole, 0 for a solid disc.
 *
 * Measured along the two axes through the centre: a ring reads as ink, gap,
 * ink on both, a disc as one unbroken run. Anything else is neither and is
 * reported as solid, because a wrong hole is worse than none.
 */
export function ringRatio(mask: Mask): number {
  if (!mask || mask.width < 8 || mask.height < 8) return 0;

  const { data, width, height } = mask;
  const middleRow: number[] = [];
  const middleColumn: number[] = [];

  const row = Math.floor(height / 2);
  const column = Math.floor(width / 2);
  for (let x = 0; x < width; x += 1) if (data[row * width + x] > 0) middleRow.push(x);
  for (let y = 0; y < height; y += 1) if (data[y * width + column] > 0) middleColumn.push(y);

  const ratios: number[] = [];
  for (const ink of [middleRow, middleColumn]) {
    if (ink.length < 4) continue;

    const span = ink[ink.length - 1] - ink[0] + 1;
    let widest = 0;
    for (let i = 1; i < ink.length; i += 1) {
      widest = Math.max(widest, ink[i] - ink[i - 1]);
    }
    widest = widest - 1;

    if (widest <= 1 || span <= 0) continue;
    ratios.push(widest / span);
  }

  // Both axes have to agree that there is a hole. One alone is as likely to
  // be a seam across a solid shape.
  if (ratios.length < 2) return 0;

  const ratio = (ratios[0] + ratios[1]) / 2;
  // A sliver of a gap is anti-aliasing or a seam, not a hole.
  if (ratio < 0.15 || ratio > 0.92) return 0;
  return Math.round(ratio * 1000) / 1000;
}
