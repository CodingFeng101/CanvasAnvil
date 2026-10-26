/**
 * Ordered boundary walking, and the polygon operations that need an order.
 *
 * The detector's boxes only ever needed a bag of edge pixels, because a
 * convex hull throws ordering away. Tracing a shape's own outline does not:
 * simplifying a path, measuring its length and filling it back in all depend
 * on the points arriving in the order the boundary visits them.
 */

import { labelComponents, type Mask } from "@/workspaces/ppt/vision/morphology";
import type { BinaryMap, Point } from "@/workspaces/ppt/vision/geometry";

/**
 * The eight neighbours, clockwise from due east.
 *
 * Clockwise in image coordinates, where y grows downward. The order is what
 * makes the walk keep the blob on its right and the background on its left.
 */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** The index pointing back the way a step came. */
const opposite = (index: number) => (index + 4) % 8;

/**
 * The outer boundary of every blob, each as an ordered ring.
 *
 * Moore-neighbour tracing: from each pixel, sweep clockwise starting just
 * past where the walk arrived from, and step onto the first filled neighbour
 * found. Starting the sweep anywhere else cuts corners -- the walk skips a
 * boundary pixel, rejoins the blob further along, and closes early, which
 * splits one shape into several.
 *
 * Holes are not traced: a ring is one outline plus a measured aperture, not
 * two outlines.
 */
export function traceContours(map: BinaryMap): Point[][] {
  const { data, width, height } = map;
  if (width <= 0 || height <= 0) return [];

  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] !== 0;

  const { labels } = labelComponents({ data, width, height } as Mask);
  const traced = new Set<number>();
  const contours: Point[][] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!filled(x, y)) continue;

      const label = labels[y * width + x];
      if (traced.has(label)) continue;
      // The blob's leftmost pixel on its topmost row: the walk has to start
      // somewhere the background is known to be, and west of here it is.
      if (filled(x - 1, y)) continue;
      traced.add(label);

      const ring: Point[] = [{ x, y }];
      let currentX = x;
      let currentY = y;
      // Arrived from the west, which is background by the test above.
      let cameFrom = 4;
      const limit = width * height * 8;

      for (let step = 0; step < limit; step += 1) {
        let moved = -1;
        for (let probe = 1; probe <= 8; probe += 1) {
          const index = (cameFrom + probe) % 8;
          const nextX = currentX + NEIGHBOURS[index][0];
          const nextY = currentY + NEIGHBOURS[index][1];
          if (!filled(nextX, nextY)) continue;
          moved = index;
          currentX = nextX;
          currentY = nextY;
          break;
        }

        // A lone pixel has no ring to walk.
        if (moved < 0) break;
        if (currentX === x && currentY === y) break;

        ring.push({ x: currentX, y: currentY });
        cameFrom = opposite(moved);
      }

      contours.push(ring);
    }
  }

  return contours;
}

/** `cv2.contourArea`: the shoelace area of a closed ring. */
export function contourArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return Math.abs(total) / 2;
}

/** `cv2.arcLength`: the length of the path, closed or open. */
export function arcLength(points: Point[], closed = true): number {
  if (points.length < 2) return 0;
  let total = 0;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

/** Perpendicular distance from `point` to the segment `start`-`end`. */
function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Douglas-Peucker over one open chain, endpoints always kept. */
function simplifyChain(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];

  let worst = 0;
  let worstIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (distance > worst) {
      worst = distance;
      worstIndex = i;
    }
  }

  if (worst <= tolerance) return [points[0], points[points.length - 1]];

  const left = simplifyChain(points.slice(0, worstIndex + 1), tolerance);
  const right = simplifyChain(points.slice(worstIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * `cv2.approxPolyDP` on a closed ring.
 *
 * A closed curve has no endpoints to anchor the recursion, so the ring is cut
 * at its two most distant points first and each half simplified on its own.
 * Cutting anywhere else -- at the first point, say -- pins a vertex that the
 * shape does not have and rounds off the corner that is actually there.
 */
export function approxPolyDp(points: Point[], tolerance: number): Point[] {
  if (points.length < 4) return [...points];

  let farthest = 0;
  let farthestDistance = -1;
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = i;
    }
  }

  const first = simplifyChain(points.slice(0, farthest + 1), tolerance);
  const second = simplifyChain([...points.slice(farthest), points[0]], tolerance);
  // Both halves carry the cut points; drop the duplicates at the seams.
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** `cv2.fillPoly`: the polygon painted into a mask of the given size. */
export function fillPolygon(points: Point[], width: number, height: number): Mask {
  const data = new Uint8Array(Math.max(0, width * height));
  if (points.length < 3 || width <= 0 || height <= 0) return { data, width, height };

  for (let y = 0; y < height; y += 1) {
    const scan = y + 0.5;
    const crossings: number[] = [];

    for (let i = 0; i < points.length; i += 1) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      if (start.y === end.y) continue;
      const low = Math.min(start.y, end.y);
      const high = Math.max(start.y, end.y);
      if (scan < low || scan >= high) continue;
      crossings.push(start.x + ((scan - start.y) / (end.y - start.y)) * (end.x - start.x));
    }

    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = Math.max(0, Math.ceil(crossings[pair] - 0.5));
      const to = Math.min(width - 1, Math.floor(crossings[pair + 1] - 0.5));
      for (let x = from; x <= to; x += 1) data[y * width + x] = 1;
    }
  }

  return { data, width, height };
}

/** How much two masks agree: intersection over union, 0 when both are empty. */
export function intersectionOverUnion(left: Mask, right: Mask): number {
  const count = Math.min(left.data.length, right.data.length);
  let overlap = 0;
  let union = 0;

  for (let i = 0; i < count; i += 1) {
    const a = left.data[i] !== 0;
    const b = right.data[i] !== 0;
    if (a && b) overlap += 1;
    if (a || b) union += 1;
  }

  return union === 0 ? 0 : overlap / union;
}
