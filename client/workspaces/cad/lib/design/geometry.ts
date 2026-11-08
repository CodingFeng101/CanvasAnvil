import type { Point } from './types';

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
  return distance(point, [a[0] + t * dx, a[1] + t * dy]);
}
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (segmentDistance(point, a, b) < 0.001) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Split at junctions, then walk the directed half-edges to find bounded faces.
export function enclosedRegions(walls: Array<{ a: Point; b: Point }>): Point[][] {
  const points: Point[] = [];
  const node = (point: Point) => {
    const found = points.findIndex(existing => distance(point, existing) <= 40);
    if (found >= 0) return found;
    points.push(point);
    return points.length - 1;
  };
  for (const wall of walls) { node(wall.a); node(wall.b); }
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j];
    const dx = a.b[0] - a.a[0], dy = a.b[1] - a.a[1];
    const ex = b.b[0] - b.a[0], ey = b.b[1] - b.a[1];
    const cross = dx * ey - dy * ex;
    if (Math.abs(cross) < 0.001) continue;
    const px = b.a[0] - a.a[0], py = b.a[1] - a.a[1];
    const t = (px * ey - py * ex) / cross, u = (px * dy - py * dx) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) node([a.a[0] + t * dx, a.a[1] + t * dy]);
  }
  const neighbors = points.map(() => new Set<number>());
  for (const wall of walls) {
    const ids = points.map((point, id) => ({ point, id })).filter(({ point }) => segmentDistance(point, wall.a, wall.b) <= 40)
      .sort((a, b) => distance(a.point, wall.a) - distance(b.point, wall.a)).map(item => item.id);
    for (let i = 1; i < ids.length; i++) { neighbors[ids[i - 1]].add(ids[i]); neighbors[ids[i]].add(ids[i - 1]); }
  }
  const sorted = neighbors.map((ids, i) => [...ids].sort((a, b) => Math.atan2(points[a][1] - points[i][1], points[a][0] - points[i][0]) - Math.atan2(points[b][1] - points[i][1], points[b][0] - points[i][0])));
  const visited = new Set<string>();
  const regions: Point[][] = [];
  for (let start = 0; start < points.length; start++) for (const next of sorted[start]) {
    let a = start, b = next;
    const polygon: Point[] = [];
    while (!visited.has(`${a}:${b}`)) {
      visited.add(`${a}:${b}`);
      polygon.push(points[a]);
      const adjacent = sorted[b];
      const c = adjacent[(adjacent.indexOf(a) - 1 + adjacent.length) % adjacent.length];
      a = b; b = c;
    }
    if (a !== start || b !== next) continue;
    const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (area > 0) regions.push(polygon);
  }
  return regions;
}

export function containingRegion(point: Point, regions: Point[][]): Point[] | undefined {
  const area = (polygon: Point[]) => Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0));
  return regions.filter(region => pointInPolygon(point, region)).sort((a, b) => area(a) - area(b))[0];
}
