import type { InternalPlan, RoomArea, DesignIssue, Point } from './types';
import { isBuilding } from './types';
import { enclosedRegions, pointInPolygon, containingRegion } from './geometry';

export function summarizePlan(plan: InternalPlan, rooms: RoomArea[], issues: DesignIssue[]): string {
  if (isBuilding(plan)) return JSON.stringify({ name: plan.name, kind: 'building', message: '暂只支持单层修改', floors: plan.floors.map(floor => ({ name: floor.plan.name })) });
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const walls = plan.walls.map(wall => ({ id: wall.id, aNode: wall.a, bNode: wall.b, a: nodes.get(wall.a), b: nodes.get(wall.b), t: wall.t, bearing: wall.bearing, status: wall.status }));
  const regions = enclosedRegions(walls.filter(wall => wall.status !== 'removed' && wall.a && wall.b).map(wall => ({ a: [wall.a!.x, wall.a!.y] as Point, b: [wall.b!.x, wall.b!.y] as Point })));
  const roomList = rooms.length ? rooms : plan.rooms.map(room => ({ name: room.name, at: [room.x, room.y] as Point, area: undefined }));
  const roomOf = (point: Point) => roomList.find(room => {
    if ('rects' in room && room.rects?.length) return room.rects.some(rect => point[0] >= rect.x && point[0] <= rect.x + rect.w && point[1] >= rect.y && point[1] <= rect.y + rect.h);
    const region = containingRegion(point, regions);
    return region !== undefined && containingRegion(room.at, regions) === region;
  })?.name ?? '未分配房间';
  const furniture = (compact: boolean) => {
    const grouped: Record<string, object[]> = Object.create(null);
    for (const item of plan.furniture) {
      const room = roomOf([item.x, item.y]);
      const entry = { id: item.id, key: item.key, x: item.x, y: item.y, rot: item.rot };
      (grouped[room] ??= []).push(compact ? entry : { ...entry, name: item.name, w: item.w, d: item.d });
    }
    return grouped;
  };
  // Which walls enclose each room, on which side, and what lies beyond: lets the model pick
  // "the balcony's outer wall" for a new window without reading coordinates.
  const sideNames = { N: '北', S: '南', W: '西', E: '东' } as const;
  const roomWalls = (room: (typeof roomList)[number]) => {
    const rects = 'rects' in room && room.rects?.length ? room.rects : [];
    const found: Array<{ wall: string; side: string; outside: string }> = [];
    for (const wall of walls) {
      if (!wall.a || !wall.b || wall.status === 'removed') continue;
      const horizontal = Math.abs(wall.a.y - wall.b.y) < 1, vertical = Math.abs(wall.a.x - wall.b.x) < 1;
      if (!horizontal && !vertical) continue;
      const reach = wall.t / 2 + 60;
      for (const rect of rects) {
        const edges = horizontal
          ? [{ side: 'N' as const, at: rect.y, out: -1 }, { side: 'S' as const, at: rect.y + rect.h, out: 1 }]
          : [{ side: 'W' as const, at: rect.x, out: -1 }, { side: 'E' as const, at: rect.x + rect.w, out: 1 }];
        const line = horizontal ? wall.a.y : wall.a.x;
        const [lo, hi] = horizontal ? [Math.min(wall.a.x, wall.b.x), Math.max(wall.a.x, wall.b.x)] : [Math.min(wall.a.y, wall.b.y), Math.max(wall.a.y, wall.b.y)];
        const [start, end] = horizontal ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
        const overlap = Math.min(hi, end) - Math.max(lo, start);
        for (const edge of edges) {
          if (Math.abs(line - edge.at) > reach || overlap < 200 || found.some(item => item.wall === wall.id)) continue;
          const middle = (Math.max(lo, start) + Math.min(hi, end)) / 2, beyond = line + edge.out * (wall.t + 200);
          const neighbour = roomOf(horizontal ? [middle, beyond] : [beyond, middle]);
          found.push({ wall: wall.id, side: sideNames[edge.side], outside: neighbour === '未分配房间' ? '室外' : neighbour });
        }
      }
    }
    return found.length ? found : undefined;
  };
  // Finishes per room label (a merged region "客厅 / 餐厅" lists the first label's).
  const finishesOf = (name: string) => {
    const label = plan.rooms.find(room => room.name === name || name.split(' / ').includes(room.name));
    if (!label) return {};
    const { mat, wallMat, skirting } = label as { mat?: string; wallMat?: string; skirting?: string };
    return { mat, wallMat, skirting };
  };
  // Where each opening is in the world, so a switch "beside the door" needs no wall arithmetic.
  const openingAt = (opening: (typeof plan.openings)[number]) => {
    const wall = walls.find(item => item.id === opening.wall);
    if (!wall?.a || !wall.b) return undefined;
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1, ux = (wall.b.x - wall.a.x) / length, uy = (wall.b.y - wall.a.y) / length;
    const point = (along: number) => [Math.round(wall.a!.x + ux * along), Math.round(wall.a!.y + uy * along)];
    return { at: point(opening.pos), ends: [point(opening.pos - opening.width / 2), point(opening.pos + opening.width / 2)] };
  };
  // MEP points by room: [id, kind, x, y, h] plus the lights a switch controls.
  type Elec = { id: string; kind: string; x: number; y: number; h?: number; links?: string[] };
  const elecList = ((plan as { elec?: Elec[] }).elec ?? []).filter(item => Number.isFinite(item.x) && Number.isFinite(item.y));
  const elec = () => {
    const grouped: Record<string, unknown[]> = Object.create(null);
    for (const item of elecList) (grouped[roomOf([item.x, item.y])] ??= []).push([item.id, item.kind, Math.round(item.x), Math.round(item.y), Math.round(item.h ?? 0), ...(item.links?.length ? [item.links] : [])]);
    return grouped;
  };
  const output: Record<string, unknown> & { furniture: unknown; elec?: unknown } = {
    name: plan.name,
    height: plan.height,
    look: plan.look,
    rooms: roomList.map(room => ({ name: room.name, area: room.area, at: room.at, ...finishesOf(room.name), walls: roomWalls(room) })),
    walls: walls.map(wall => ({ ...wall, a: wall.a ? [wall.a.x, wall.a.y] : null, b: wall.b ? [wall.b.x, wall.b.y] : null })),
    openings: plan.openings.map(opening => ({ id: opening.id, wall: opening.wall, type: opening.type, pos: opening.pos, width: opening.width, ...openingAt(opening) })),
    furniture: furniture(false),
    ...(elecList.length ? { elecFormat: '[id, kind, x, y, h离地, 开关控制的灯id]', elec: elec() } : {}),
    issues: issues.filter(issue => issue.level === 'error' || issue.level === 'warn'),
  };
  const stringify = () => JSON.stringify(output, (key, value) => ['x', 'y', 'rot', 't', 'pos', 'width', 'w', 'd', 'height'].includes(key) && typeof value === 'number' ? Math.round(value) : value);
  // Arrays hold coordinate pairs, so round these explicitly before serialization.
  (output.rooms as Array<{ at: Point }>).forEach(room => { room.at = room.at.map(Math.round) as Point; });
  (output.walls as Array<{ a: number[] | null; b: number[] | null }>).forEach(wall => { wall.a = wall.a?.map(Math.round) ?? null; wall.b = wall.b?.map(Math.round) ?? null; });
  let text = stringify();
  if (text.length > 12000) { output.furniture = furniture(true); text = stringify(); }
  // A whole house of MEP points is long; past this only the counts per room go along.
  if (text.length > 20000 && output.elec) { output.elec = Object.fromEntries(Object.entries(elec()).map(([room, items]) => [room, `${items.length} 个点位`])); text = stringify(); }
  return text;
}

export function issueSummary(plan: InternalPlan, issues: DesignIssue[]): string {
  const full = JSON.parse(summarizePlan(plan, [], issues));
  if (isBuilding(plan)) return JSON.stringify({ issues, message: '暂只支持单层修改' });
  const targetIds = new Set(issues.flatMap(issue => issue.targets?.map(target => target.id) ?? []));
  const names = new Set(issues.flatMap(issue => issue.room ? [issue.room] : []));
  for (const [room, furniture] of Object.entries(full.furniture) as Array<[string, Array<{ id: string }> ]>) {
    if (furniture.some(item => targetIds.has(item.id))) names.add(room);
  }
  const regions = enclosedRegions(plan.walls.filter(wall => wall.status !== 'removed').map(wall => {
    const a = plan.nodes.find(node => node.id === wall.a)!, b = plan.nodes.find(node => node.id === wall.b)!;
    return { a: [a.x, a.y], b: [b.x, b.y] };
  }));
  const points: Point[] = issues.flatMap(issue => issue.at ? [issue.at] : []);
  for (const item of [...plan.nodes, ...plan.furniture].filter(item => targetIds.has(item.id))) points.push([item.x, item.y]);
  for (const wall of plan.walls.filter(wall => targetIds.has(wall.id) || plan.openings.some(opening => targetIds.has(opening.id) && opening.wall === wall.id))) {
    const a = plan.nodes.find(node => node.id === wall.a)!, b = plan.nodes.find(node => node.id === wall.b)!;
    points.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
  }
  const affectedRegions = regions.filter(region => points.some(point => containingRegion(point, regions) === region) || plan.rooms.some(room => names.has(room.name) && containingRegion([room.x, room.y], regions) === region));
  plan.rooms.filter(room => affectedRegions.includes(containingRegion([room.x, room.y], regions)!)).forEach(room => names.add(room.name));
  const inside = (point: Point) => affectedRegions.some(region => pointInPolygon(point, region));
  const walls = full.walls.filter((wall: { id: string; a: Point; b: Point }) => targetIds.has(wall.id) || (wall.a && wall.b && (inside(wall.a) || inside(wall.b))));
  const wallIds = new Set(walls.map((wall: { id: string }) => wall.id));
  return JSON.stringify({ rooms: full.rooms.filter((room: { name: string }) => names.has(room.name)), walls, openings: full.openings.filter((opening: { id: string; wall: string }) => targetIds.has(opening.id) || wallIds.has(opening.wall)), furniture: Object.fromEntries(Object.entries(full.furniture).filter(([name]) => names.has(name))), issues });
}
