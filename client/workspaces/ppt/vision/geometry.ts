/**
 * The polygon work behind turning a detector's probability map into boxes.
 *
 * The detector answers "is this pixel part of some text" and nothing more, so
 * the boxes are built here: trace the blob's outline, wrap it in the smallest
 * rectangle that fits at any angle, then grow that rectangle back out, because
 * a binarised probability map is always tighter than the glyphs that produced
 * it and a box that clips the ink loses the top of every tall character.
 */

import { labelComponents } from "@/workspaces/ppt/vision/morphology";

export interface Point {
  x: number;
  y: number;
}

/** A box as four corners, ordered top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface BinaryMap {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * The boundary pixels of every blob, grouped one list per blob.
 *
 * These are point *sets*, not ordered rings. The only thing downstream is
 * `minAreaRect`, which takes a convex hull first and throws any ordering away,
 * so walking the border in sequence would buy nothing and costs a fiddly
 * traversal that silently splits blobs when its backtracking is off by one
 * neighbour. Ordered tracing belongs with the work that actually needs a
 * path -- following a drawn outline -- not here.
 */
export function componentOutlines(map: BinaryMap): Point[][] {
  const { data, width, height } = map;
  if (width <= 0 || height <= 0) return [];

  const { labels } = labelComponents({ data, width, height });
  const grouped = new Map<number, Point[]>();

  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] !== 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!data[index]) continue;
      // Interior pixels sit inside the hull anyway; only the rim can widen it.
      const onRim =
        !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      if (!onRim) continue;

      const label = labels[index];
      const points = grouped.get(label);
      if (points) points.push({ x, y });
      else grouped.set(label, [{ x, y }]);
    }
  }

  return Array.from(grouped.values());
}

/** Andrew's monotone chain, counter-clockwise, without collinear points. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (source: Point[]) => {
    const chain: Point[] = [];
    for (const point of source) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };

  return [...build(sorted), ...build([...sorted].reverse())];
}

/**
 * The smallest rectangle enclosing the points, at any angle.
 *
 * Rotating calipers: the minimum-area rectangle always has a side flush with
 * an edge of the convex hull, so every hull edge is tried and the best kept.
 *
 * Corners come back ordered the way the detector's own post-processing orders
 * them -- top-left, top-right, bottom-right, bottom-left -- because the skew
 * filter downstream compares the first two to decide whether a line is level
 * enough to rebuild in an upright box.
 */
export function minAreaRect(points: Point[]): { quad: Quad; width: number; height: number } | null {
  if (points.length === 0) return null;

  const hull = convexHull(points);
  if (hull.length < 3) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
      quad: orderQuad([
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ]),
      width: right - left,
      height: bottom - top,
    };
  }

  let best: { quad: Quad; width: number; height: number; area: number } | null = null;

  for (let i = 0; i < hull.length; i += 1) {
    const start = hull[i];
    const end = hull[(i + 1) % hull.length];
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const length = Math.hypot(edgeX, edgeY);
    if (length === 0) continue;

    const axisX = edgeX / length;
    const axisY = edgeY / length;

    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let minAcross = Infinity;
    let maxAcross = -Infinity;
    for (const point of hull) {
      const along = point.x * axisX + point.y * axisY;
      const across = -point.x * axisY + point.y * axisX;
      if (along < minAlong) minAlong = along;
      if (along > maxAlong) maxAlong = along;
      if (across < minAcross) minAcross = across;
      if (across > maxAcross) maxAcross = across;
    }

    const spanAlong = maxAlong - minAlong;
    const spanAcross = maxAcross - minAcross;
    const area = spanAlong * spanAcross;
    if (best && area >= best.area) continue;

    // Back out of the rotated frame into image coordinates.
    const toPoint = (along: number, across: number): Point => ({
      x: along * axisX - across * axisY,
      y: along * axisY + across * axisX,
    });

    best = {
      quad: orderQuad([
        toPoint(minAlong, minAcross),
        toPoint(maxAlong, minAcross),
        toPoint(maxAlong, maxAcross),
        toPoint(minAlong, maxAcross),
      ]),
      width: spanAlong,
      height: spanAcross,
      area,
    };
  }

  if (!best) return null;
  return { quad: best.quad, width: best.width, height: best.height };
}

/** Top-left, top-right, bottom-right, bottom-left, by the detector's rule. */
export function orderQuad(corners: Point[]): Quad {
  const byX = [...corners].sort((a, b) => a.x - b.x);
  const [leftA, leftB, rightA, rightB] = byX;

  const topLeft = leftA.y <= leftB.y ? leftA : leftB;
  const bottomLeft = leftA.y <= leftB.y ? leftB : leftA;
  const topRight = rightA.y <= rightB.y ? rightA : rightB;
  const bottomRight = rightA.y <= rightB.y ? rightB : rightA;

  return [topLeft, topRight, bottomRight, bottomLeft];
}

export function polygonArea(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return Math.abs(total) / 2;
}

export function polygonPerimeter(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

/**
 * Grow a detected rectangle back out to the ink it stands for.
 *
 * The offset is `area * ratio / perimeter`, which is the polygon-offset
 * distance the detector's own post-processing uses. Because the input is
 * already a rectangle, offsetting it is just pushing every side out by that
 * distance -- no general polygon offsetter is needed.
 */
export function unclipQuad(quad: Quad, ratio: number): Quad {
  const area = polygonArea(quad);
  const perimeter = polygonPerimeter(quad);
  if (perimeter === 0) return quad;

  const distance = (area * ratio) / perimeter;
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;

  // In the rectangle's own frame, not the image's. Scaling corners away from
  // the centre instead would grow a wide box far more along its length than
  // across it, and a line of text is a very wide box.
  const unit = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
  };

  const along = unit(topLeft, topRight);
  const down = unit(topLeft, bottomLeft);
  const shift = (point: Point, alongSign: number, downSign: number): Point => ({
    x: point.x + distance * (alongSign * along.x + downSign * down.x),
    y: point.y + distance * (alongSign * along.y + downSign * down.y),
  });

  return orderQuad([
    shift(topLeft, -1, -1),
    shift(topRight, 1, -1),
    shift(bottomRight, 1, 1),
    shift(bottomLeft, -1, 1),
  ]);
}

/** The upright bounding box of a quad, clamped to the page. */
export function boundingBox(
  quad: Quad,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(width, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys)));
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}
