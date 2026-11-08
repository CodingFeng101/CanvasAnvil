import catalog from '../../../../../resources/hpd/catalog.json';
import type { HouseSpec, Point } from './types';

/**
 * The model describes a floorplan as intent — a grid of dimension chains, which cells each room
 * takes, which rooms a door joins, which wall a bed stands against — and this module computes
 * every coordinate. Walls always close, dimensions always add up, and furniture is placed with
 * its real footprint, clear of walls, doors and other furniture.
 */

export type Side = 'N' | 'S' | 'E' | 'W';
export type LayoutItem = {
  key: string;
  wall?: string;
  at?: string;
  beside?: string;
  front?: string;
  gap?: number;
  center?: boolean;
  corner?: boolean;
  chairs?: number;
  count?: number;
  optional?: boolean;
  w?: number;
  d?: number;
};
export type Layout = {
  name?: string;
  height?: number;
  cols: number[];
  rows: number[];
  rooms: Array<{ name: string; cells: string; ceil?: unknown; mat?: string; wallMat?: string; floor?: string; wall?: string; skirting?: string }>;
  open?: Array<[string, string]>;
  doors?: Array<{ between?: [string, string]; room?: string; side?: string; entry?: boolean; type?: string; width?: number; into?: string; near?: string }>;
  windows?: Array<{ room: string; side: string; size?: string; type?: string; width?: number }>;
  furniture?: Record<string, LayoutItem[]>;
};
export type LayoutResult = { spec: HouseSpec; notes: string[] };

const EXTERIOR = 240;
const INTERIOR = 120;
const WALL_GAP = 20;
const CURTAIN_GAP = 330;
const SIDES: Record<string, Side> = {
  北: 'N', 南: 'S', 东: 'E', 西: 'W', N: 'N', S: 'S', E: 'E', W: 'W',
  north: 'N', south: 'S', east: 'E', west: 'W', 上: 'N', 下: 'S', 左: 'W', 右: 'E',
};
const SIDE_NAME: Record<Side, string> = { N: '北', S: '南', E: '东', W: '西' };
const ROT: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };
const side = (value: unknown): Side | undefined => SIDES[String(value ?? '').trim().replace(/[墙面侧边]$/, '').toLowerCase()] ?? SIDES[String(value ?? '').trim().replace(/[墙面侧边]$/, '')];
const CIRCULATION = /过道|走廊|走道|客厅|餐厅|玄关|门厅|起居|hall|corridor|living|dining|foyer|entry/i;
const CURTAIN_ROOMS = /卧|客厅|起居|书房|厅|bed|living|study/i;
const WET = /卫|厕|浴|bath|toilet|wc/i;
const MOUNTED = new Set(['acWall', 'waterHeater', 'gasHeater', 'hood', 'wallTV', 'mirrorCabinet', 'towelWarmer', 'wallArt', 'wallArt3', 'wallClock', 'projScreen', 'louver', 'meterBox', 'wallPanel', 'evCharger', 'cabWall', 'ledMirror', 'boiler', 'thermostat', 'manifold']);
const CEILING = new Set(['bathHeater', 'clothesRack', 'hangingPlant', 'chandelier', 'ceilLamp', 'linearPendant', 'bubblePendant', 'ceilingFan', 'projector', 'freshAirUnit', 'ductAC', 'cassetteAC', 'linearVent', 'linearVentSide', 'linearReturn', 'supplyVent', 'returnVent']);
// Finishes the designer knows (room.mat / wallMat / skirting), with the names people use for them.
const FLOOR_MATS: Record<string, string[]> = {
  oak: ['橡木', '木地板', '实木地板', '复合地板'], walnut: ['胡桃木', '胡桃木地板'], herring: ['人字拼', '人字拼地板', '鱼骨拼'], tile: ['大板', '瓷砖', '地砖', '灰白'],
  marble: ['大理石', '岩板'], cement: ['微水泥', '水泥'], terrazzo: ['水磨石'], carpet: ['地毯'], bath: ['防滑'], epoxy: ['环氧'], deck: ['木塑', '户外木'],
};
const WALL_MATS: Record<string, string[]> = {
  latexWhite: ['白色', '白墙', '白色乳胶漆'], latexGrey: ['浅灰', '灰色'], latexSage: ['灰绿', '绿色'], latexWarm: ['奶咖', '米色', '暖色', '奶油'],
  wallpaper: ['墙布', '壁纸', '墙纸'], wallTile: ['墙砖', '瓷砖墙'], woodPanel: ['木饰面', '护墙板'],
};
const SKIRTINGS: Record<string, string[]> = { none: ['无', '不要', '隐形', '不做'], wood: ['实木', '木'], metal: ['金属', '铝', '不锈钢'] };
/** A finish key from a key or a Chinese name ("人字拼地板" → herring); undefined when the designer has none like it. */
function finish(table: Record<string, string[]>, value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (table[text]) return text;
  // The longest matching name wins: "胡桃木地板" is walnut, not the generic "木地板".
  let best: [string, number] | undefined;
  for (const [key, names] of Object.entries(table)) for (const name of names) if (text.includes(name) && name.length > (best?.[1] ?? 0)) best = [key, name.length];
  return best?.[0];
}
const SOFT = new Set(['rug', 'roundRug', 'doormat', 'bayCushion', 'yogaMat']);
const RESIZABLE = new Set(['wardrobe', 'cabWardrobe', 'cabSlide', 'cabTall', 'counter', 'tvCabinet', 'cabTV', 'shoeCabinet', 'cabShoe', 'hallCabinet', 'desk', 'kidsDesk', 'sideboard', 'cabSideboard', 'bookshelf', 'sofa', 'diningTable', 'cabBase', 'laundrySink', 'vanity', 'consoleTable', 'longTable', 'chest']);
const SMALLER: Record<string, string> = { bed20: 'bed18', bed18: 'bed15', bed15: 'bed12', lSofa: 'sofa', uSofa: 'lSofa', sofa: 'loveseat', uCounter: 'lCounter', lCounter: 'counter', fridgeDouble: 'fridge', fridgeFrench: 'fridge', bathtub: 'shower', freeTub: 'shower', shower: 'showerScreen', doubleVanity: 'vanity', lDesk: 'desk', longTable: 'diningTable' };
const CATALOG = catalog as Record<string, { name: string; type: string; w: number; d: number; h: number }>;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Wall = { a: Point; b: Point; t: number; vertical: boolean; pair: [number, number]; openings: Opening[]; hole?: boolean };
type Opening = { type: string; from: number; to: number; entry?: boolean; hinge?: 'from' | 'to'; into?: Point };
type Placed = { key: string; rect: Rect; rot: number; side?: Side; w: number; d: number; h: number; mounted?: boolean };

const overlaps = (a: Rect, b: Rect, margin = 0) => a.x0 < b.x1 - margin && b.x0 < a.x1 - margin && a.y0 < b.y1 - margin && b.y0 < a.y1 - margin;
const inside = (a: Rect, b: Rect) => a.x0 >= b.x0 - 0.5 && a.x1 <= b.x1 + 0.5 && a.y0 >= b.y0 - 0.5 && a.y1 <= b.y1 + 0.5;
const center = (r: Rect): Point => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
const round = (value: number) => Math.round(value);

function parseCells(text: string, cols: number, rows: number): Array<[number, number, number, number]> {
  const ranges: Array<[number, number, number, number]> = [];
  for (const part of String(text ?? '').toUpperCase().split(/[,，;；\s]+/).filter(Boolean)) {
    const match = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(part);
    if (!match) throw new Error(`格子“${part}”写法不对，应为 A1 或 A1:B2`);
    const c0 = match[1].charCodeAt(0) - 65, r0 = Number(match[2]) - 1;
    const c1 = match[3] ? match[3].charCodeAt(0) - 65 : c0, r1 = match[4] ? Number(match[4]) - 1 : r0;
    const range: [number, number, number, number] = [Math.min(c0, c1), Math.min(r0, r1), Math.max(c0, c1), Math.max(r0, r1)];
    if (range[2] >= cols || range[3] >= rows || range[0] < 0 || range[1] < 0) throw new Error(`格子“${part}”超出网格（${cols} 列 × ${rows} 行）`);
    ranges.push(range);
  }
  if (!ranges.length) throw new Error('没有写格子');
  return ranges;
}

export function layoutToSpec(layout: Layout): LayoutResult {
  const notes: string[] = [];
  const errors: string[] = [];
  const cols = (layout?.cols ?? []).map(Number), rows = (layout?.rows ?? []).map(Number);
  if (!cols.length || !rows.length || [...cols, ...rows].some(value => !Number.isFinite(value) || value < 600 || value > 20000)) throw new Error('cols / rows 必须是 600–20000 之间的毫米数，从西到东、从北到南排列');
  if (cols.length > 26) throw new Error('列数不能超过 26');
  const X = [0], Y = [0];
  for (const value of cols) X.push(X[X.length - 1] + value);
  for (const value of rows) Y.push(Y[Y.length - 1] + value);

  // ---- rooms on the grid ----
  const owner: number[][] = cols.map(() => rows.map(() => -1));
  const rooms = (layout.rooms ?? []).map((room, index) => {
    let ranges: Array<[number, number, number, number]> = [];
    try { ranges = parseCells(room.cells, cols.length, rows.length); }
    catch (error) { errors.push(`${room.name}：${(error as Error).message}`); }
    for (const [c0, r0, c1, r1] of ranges) for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      if (owner[c][r] >= 0 && owner[c][r] !== index) errors.push(`格子 ${String.fromCharCode(65 + c)}${r + 1} 同时分给了 ${layout.rooms[owner[c][r]].name} 和 ${room.name}`);
      owner[c][r] = index;
    }
    return { ...room, ranges };
  });
  if (!rooms.length) errors.push('没有房间');
  if (errors.length) throw new Error(errors.join('\n'));
  const roomIndex = (name: unknown) => rooms.findIndex(room => room.name === String(name ?? '').trim());
  const openPairs = new Set((layout.open ?? []).map(pair => [roomIndex(pair[0]), roomIndex(pair[1])].sort().join(':')));
  const isOpen = (a: number, b: number) => a >= 0 && b >= 0 && openPairs.has([a, b].sort().join(':'));

  // ---- walls: every boundary between different owners, merged along each grid line ----
  const walls: Wall[] = [];
  const pushRun = (vertical: boolean, line: number, start: number, end: number, pair: [number, number]) => {
    const t = pair.includes(-1) ? EXTERIOR : INTERIOR;
    const a: Point = vertical ? [X[line], Y[start]] : [X[start], Y[line]];
    const b: Point = vertical ? [X[line], Y[end]] : [X[end], Y[line]];
    walls.push({ a, b, t, vertical, pair, openings: [], hole: isOpen(pair[0], pair[1]) });
  };
  for (let i = 0; i <= cols.length; i++) {
    let run: { start: number; pair: [number, number] } | null = null;
    for (let r = 0; r <= rows.length; r++) {
      const pair: [number, number] | null = r < rows.length ? [i > 0 ? owner[i - 1][r] : -1, i < cols.length ? owner[i][r] : -1] : null;
      const needed = pair && pair[0] !== pair[1];
      if (run && (!needed || pair![0] !== run.pair[0] || pair![1] !== run.pair[1])) { pushRun(true, i, run.start, r, run.pair); run = null; }
      if (needed && !run) run = { start: r, pair: pair! };
    }
  }
  for (let j = 0; j <= rows.length; j++) {
    let run: { start: number; pair: [number, number] } | null = null;
    for (let c = 0; c <= cols.length; c++) {
      const pair: [number, number] | null = c < cols.length ? [j > 0 ? owner[c][j - 1] : -1, j < rows.length ? owner[c][j] : -1] : null;
      const needed = pair && pair[0] !== pair[1];
      if (run && (!needed || pair![0] !== run.pair[0] || pair![1] !== run.pair[1])) { pushRun(false, j, run.start, c, run.pair); run = null; }
      if (needed && !run) run = { start: c, pair: pair! };
    }
  }
  const nodeThickness = new Map<string, number>();
  for (const wall of walls) for (const end of [wall.a, wall.b]) nodeThickness.set(end.join(','), Math.max(nodeThickness.get(end.join(',')) ?? 0, wall.t));
  const span = (wall: Wall) => wall.vertical ? [wall.a[1], wall.b[1]] : [wall.a[0], wall.b[0]];
  const margins = (wall: Wall) => [(nodeThickness.get(wall.a.join(',')) ?? EXTERIOR) / 2 + 60, (nodeThickness.get(wall.b.join(',')) ?? EXTERIOR) / 2 + 60];
  // A room's side of a wall: vertical walls hold [west, east], horizontal [north, south].
  const roomSide = (wall: Wall, room: number): Side | undefined => wall.pair[0] === room ? (wall.vertical ? 'E' : 'S') : wall.pair[1] === room ? (wall.vertical ? 'W' : 'N') : undefined;

  // Interior rectangle of each cell range: inset by half the wall on each side that has one.
  const sideThickness = (range: [number, number, number, number], s: Side) => {
    const [c0, r0, c1, r1] = range;
    let t = 0;
    for (const wall of walls) {
      const [p, q] = span(wall);
      if (s === 'W' && wall.vertical && wall.a[0] === X[c0] && p < Y[r1 + 1] && q > Y[r0]) t = Math.max(t, wall.t);
      if (s === 'E' && wall.vertical && wall.a[0] === X[c1 + 1] && p < Y[r1 + 1] && q > Y[r0]) t = Math.max(t, wall.t);
      if (s === 'N' && !wall.vertical && wall.a[1] === Y[r0] && p < X[c1 + 1] && q > X[c0]) t = Math.max(t, wall.t);
      if (s === 'S' && !wall.vertical && wall.a[1] === Y[r1 + 1] && p < X[c1 + 1] && q > X[c0]) t = Math.max(t, wall.t);
    }
    return t / 2;
  };
  const rects = rooms.map(room => room.ranges.map(range => {
    const [c0, r0, c1, r1] = range;
    return { x0: X[c0] + sideThickness(range, 'W'), x1: X[c1 + 1] - sideThickness(range, 'E'), y0: Y[r0] + sideThickness(range, 'N'), y1: Y[r1 + 1] - sideThickness(range, 'S') };
  }));
  const mainRect = rects.map(list => [...list].sort((a, b) => area(b) - area(a))[0]);

  // ---- openings ----
  const occupied = (wall: Wall, from: number, to: number) => wall.openings.some(o => from < o.to + 100 && o.from - 100 < to);
  const place = (wall: Wall, width: number, prefer: 'start' | 'end' | 'center'): [number, number] | null => {
    const [p, q] = span(wall), [m0, m1] = margins(wall);
    const lo = p + m0, hi = q - m1;
    const usable = Math.min(width, hi - lo);
    if (usable < Math.min(width, 600)) return null;
    const starts = prefer === 'start' ? [lo] : prefer === 'end' ? [hi - usable] : [(lo + hi - usable) / 2];
    for (let step = 0; step <= hi - lo; step += 100) starts.push(lo + step, hi - usable - step);
    for (const start of starts) if (start >= lo - 0.5 && start + usable <= hi + 0.5 && !occupied(wall, start, start + usable)) return [round(start), round(start + usable)];
    return null;
  };
  const sharedWalls = (a: number, b: number) => walls.filter(wall => (wall.pair[0] === a && wall.pair[1] === b) || (wall.pair[0] === b && wall.pair[1] === a)).sort((p, q) => {
    const length = (wall: Wall) => span(wall)[1] - span(wall)[0];
    return length(q) - length(p);
  });
  const exteriorWalls = (room: number, s: Side) => walls.filter(wall => wall.pair.includes(-1) && roomSide(wall, room) === s);
  const links = new Set<string>();
  const link = (a: number, b: number) => links.add([a, b].sort().join(':'));
  for (const wall of walls) if (wall.hole) {
    const at = place(wall, Infinity, 'center');
    if (at) { wall.openings.push({ type: 'hole', from: at[0], to: at[1] }); link(wall.pair[0], wall.pair[1]); }
  }

  // Entry door first, then room doors, then windows.
  let entryRoom = -1;
  const addEntry = (room: number, s: Side | undefined, width = 1000) => {
    const candidates = (s ? exteriorWalls(room, s) : []).concat((['W', 'N', 'E', 'S'] as Side[]).flatMap(other => exteriorWalls(room, other)));
    for (const wall of candidates) {
      const at = place(wall, width, 'center');
      if (!at) continue;
      wall.openings.push({ type: 'door', from: at[0], to: at[1], entry: true, hinge: 'from', into: center(mainRect[room]) });
      entryRoom = room;
      return true;
    }
    return false;
  };
  for (const door of layout.doors ?? []) {
    if (!door.entry) continue;
    const room = roomIndex(door.room ?? door.between?.[0]);
    if (room < 0) { notes.push(`入户门的房间“${door.room ?? ''}”不存在，改放在玄关或客厅`); continue; }
    if (!addEntry(room, side(door.side), door.width ?? 1000)) notes.push(`${rooms[room].name} 没有能开入户门的外墙`);
  }
  if (entryRoom < 0) {
    const fallback = [/玄关|门厅|entry|foyer/i, /客厅|起居|living/i, /餐厅|dining/i].map(pattern => rooms.findIndex(room => pattern.test(room.name))).find(index => index >= 0) ?? 0;
    if (addEntry(fallback, undefined)) notes.push(`没写入户门，已放在${rooms[fallback].name}外墙上`);
  }
  const addDoor = (a: number, b: number, spec: { type?: string; width?: number; into?: string; near?: string } = {}) => {
    const walls = sharedWalls(a, b).filter(wall => !wall.hole);
    if (!walls.length) return false;
    const intoRoom = spec.into ? roomIndex(spec.into) : CIRCULATION.test(rooms[a].name) && !CIRCULATION.test(rooms[b].name) ? b : a;
    const other = intoRoom === a ? b : a;
    const balcony = /阳台|露台|balcony/i.test(rooms[a].name + rooms[b].name);
    const type = spec.type ?? (balcony ? 'sliding' : 'door');
    const width = spec.width ?? (type === 'sliding' ? 2400 : WET.test(rooms[a].name + rooms[b].name) ? 800 : 900);
    for (const wall of walls) {
      // Put the door at the end nearer the room it is entered from, so the rest of the wall stays free for furniture.
      const [p, q] = span(wall);
      const near = side(spec.near);
      const otherCenter = center(mainRect[other]);
      const toward = near ? ((wall.vertical ? near === 'N' : near === 'W') ? 'start' : 'end')
        : (Math.abs((wall.vertical ? otherCenter[1] : otherCenter[0]) - p) <= Math.abs((wall.vertical ? otherCenter[1] : otherCenter[0]) - q) ? 'start' : 'end');
      const at = place(wall, width, type === 'sliding' ? 'center' : toward);
      if (!at) continue;
      if (at[1] - at[0] < width - 1) notes.push(`${rooms[a].name}—${rooms[b].name} 的门缩到 ${at[1] - at[0]}mm`);
      wall.openings.push({ type, from: at[0], to: at[1], hinge: toward === 'start' ? 'from' : 'to', into: center(mainRect[intoRoom]) });
      link(a, b);
      return true;
    }
    return false;
  };
  for (const door of layout.doors ?? []) {
    if (door.entry || !door.between) continue;
    const a = roomIndex(door.between[0]), b = roomIndex(door.between[1]);
    if (a < 0 || b < 0) { notes.push(`门 ${door.between.join('—')} 里有不存在的房间，已跳过`); continue; }
    if (links.has([a, b].sort().join(':'))) continue;
    if (!addDoor(a, b, door)) notes.push(`${rooms[a].name} 和 ${rooms[b].name} 不相邻或墙太短，门没开成`);
  }
  // Every room must be reachable from the entry: add a door to a reachable neighbour where one is missing.
  for (let guard = 0; guard < rooms.length; guard++) {
    const reached = new Set([Math.max(entryRoom, 0)]);
    for (let grew = true; grew;) {
      grew = false;
      for (const key of links) {
        const [a, b] = key.split(':').map(Number);
        if (reached.has(a) !== reached.has(b)) { reached.add(a); reached.add(b); grew = true; }
      }
    }
    const missing = rooms.map((_, index) => index).filter(index => !reached.has(index));
    if (!missing.length) break;
    let added = false;
    for (const room of missing) {
      const neighbours = [...reached].filter(other => sharedWalls(room, other).length).sort((p, q) => Number(CIRCULATION.test(rooms[q].name)) - Number(CIRCULATION.test(rooms[p].name)));
      for (const other of neighbours) if (addDoor(room, other)) { notes.push(`${rooms[room].name} 原来进不去，已加一扇门通${rooms[other].name}`); added = true; break; }
      if (added) break;
    }
    if (!added) { notes.push(`${missing.map(index => rooms[index].name).join('、')} 从入户门走不到`); break; }
  }
  for (const window of layout.windows ?? []) {
    const room = roomIndex(window.room);
    const s = side(window.side);
    if (room < 0) { notes.push(`窗户的房间“${window.room}”不存在，已跳过`); continue; }
    let candidates = s ? exteriorWalls(room, s) : [];
    if (!candidates.length) {
      candidates = (['S', 'N', 'E', 'W'] as Side[]).flatMap(other => exteriorWalls(room, other));
      if (candidates.length && s) notes.push(`${rooms[room].name} 的${SIDE_NAME[s]}面没有外墙，窗改开在别的外墙上`);
    }
    candidates.sort((p, q) => (span(q)[1] - span(q)[0]) - (span(p)[1] - span(p)[0]));
    const size = String(window.size ?? '中');
    let placed = false;
    for (const wall of candidates) {
      const [p, q] = span(wall), [m0, m1] = margins(wall);
      const usable = q - p - m0 - m1;
      const floor = /落地|floor/i.test(size) || window.type === 'floorWindow';
      const width = window.width ?? (floor ? Math.max(1500, usable * 0.75) : /大|large/i.test(size) ? 2100 : /小|small/i.test(size) ? 900 : 1500);
      const type = window.type ?? (floor ? 'floorWindow' : 'window');
      const at = place(wall, Math.min(width, usable), 'center');
      if (!at) continue;
      wall.openings.push({ type, from: at[0], to: at[1] });
      placed = true;
      break;
    }
    if (!placed) notes.push(`${rooms[room].name} 没有地方开窗`);
  }

  // ---- furniture ----
  type RoomOpening = { side: Side; from: number; to: number; type: string; door: boolean; into: boolean };
  const roomOpenings = (room: number): RoomOpening[] => {
    const rect = mainRect[room];
    const list: RoomOpening[] = [];
    for (const wall of walls) {
      const s = roomSide(wall, room);
      if (!s) continue;
      const line = wall.vertical ? wall.a[0] : wall.a[1];
      const face = { N: rect.y0, S: rect.y1, W: rect.x0, E: rect.x1 }[s];
      if (Math.abs(line - face) > wall.t / 2 + 1) continue; // that wall belongs to another part of an L-shaped room
      for (const opening of wall.openings) {
        const door = !/window|bay/i.test(opening.type);
        const into = !!opening.into && pointInRect(opening.into, rect);
        list.push({ side: s, from: opening.from, to: opening.to, type: opening.type, door, into });
      }
    }
    return list;
  };
  const pointInRect = (point: Point, rect: Rect) => point[0] >= rect.x0 && point[0] <= rect.x1 && point[1] >= rect.y0 && point[1] <= rect.y1;
  // Floor area in front of an opening, `depth` deep into the room.
  const zone = (rect: Rect, opening: { side: Side; from: number; to: number }, depth: number): Rect => {
    switch (opening.side) {
      case 'N': return { x0: opening.from, x1: opening.to, y0: rect.y0, y1: rect.y0 + depth };
      case 'S': return { x0: opening.from, x1: opening.to, y0: rect.y1 - depth, y1: rect.y1 };
      case 'W': return { x0: rect.x0, x1: rect.x0 + depth, y0: opening.from, y1: opening.to };
      default: return { x0: rect.x1 - depth, x1: rect.x1, y0: opening.from, y1: opening.to };
    }
  };
  const furniture: NonNullable<HouseSpec['furniture']> = [];
  const structs: Array<{ kind: string; at: Point }> = [];
  const footprint = (s: Side, along: number, w: number, d: number, rect: Rect, gap: number): Rect => {
    switch (s) {
      case 'N': return { x0: along - w / 2, x1: along + w / 2, y0: rect.y0 + gap, y1: rect.y0 + gap + d };
      case 'S': return { x0: along - w / 2, x1: along + w / 2, y0: rect.y1 - gap - d, y1: rect.y1 - gap };
      case 'W': return { x0: rect.x0 + gap, x1: rect.x0 + gap + d, y0: along - w / 2, y1: along + w / 2 };
      default: return { x0: rect.x1 - gap - d, x1: rect.x1 - gap, y0: along - w / 2, y1: along + w / 2 };
    }
  };
  const furnitureByRoom = layout.furniture ?? {};
  for (const name of Object.keys(furnitureByRoom)) if (roomIndex(name) < 0) notes.push(`家具里的房间“${name}”不存在，这些家具没放`);

  rooms.forEach((room, index) => {
    const rect = mainRect[index];
    const openings = roomOpenings(index);
    const windows = openings.filter(opening => !opening.door);
    const blocked: Rect[] = [];
    for (const opening of openings.filter(opening => opening.door)) {
      const width = opening.to - opening.from;
      const swing = opening.into && /^(door|double|unequal)$/.test(opening.type) ? width + 100 : 0;
      blocked.push(zone(rect, opening, opening.type === 'hole' ? 500 : Math.max(swing, 750)));
    }
    const placed: Placed[] = [];
    const curtains = CURTAIN_ROOMS.test(room.name) && !/阳台|balcony/i.test(room.name);
    if (curtains) for (const window of windows) {
      const width = window.to - window.from + 300;
      const r = footprint(window.side, (window.from + window.to) / 2, width, 160, rect, 0);
      const clipped = { x0: Math.max(r.x0, rect.x0), x1: Math.min(r.x1, rect.x1), y0: Math.max(r.y0, rect.y0), y1: Math.min(r.y1, rect.y1) };
      const w = window.side === 'N' || window.side === 'S' ? clipped.x1 - clipped.x0 : clipped.y1 - clipped.y0;
      furniture.push({ key: 'curtain', at: center(clipped).map(round) as Point, rot: ROT[window.side], w: round(w) });
      blocked.push(clipped);
    }
    const free = (r: Rect, item: { key: string; h: number }, ignore?: Placed) => {
      if (!inside(r, rect)) return false;
      if (blocked.some(b => overlaps(r, b, 1))) return false;
      // Wall-mounted pieces only clash with tall furniture standing under them.
      if (placed.some(p => p !== ignore && !SOFT.has(p.key) && (!p.mounted || item.h >= 1800) && overlaps(r, p.rect, 1))) return false;
      // Tall pieces stay 400mm clear of windows.
      if (item.h >= 1400 && windows.some(window => overlaps(r, zone(rect, window, 400), 1))) return false;
      return true;
    };
    const wallSpan = (s: Side) => s === 'N' || s === 'S' ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
    // Stretches of real wall behind each side of the room (an L-shaped room or an open side has none there).
    const solid = (['N', 'S', 'E', 'W'] as Side[]).reduce((map, s) => {
      const face = { N: rect.y0, S: rect.y1, W: rect.x0, E: rect.x1 }[s];
      const [lo, hi] = wallSpan(s);
      const pieces: Array<[number, number]> = [];
      for (const wall of walls) {
        if (roomSide(wall, index) !== s || Math.abs((wall.vertical ? wall.a[0] : wall.a[1]) - face) > wall.t / 2 + 1) continue;
        let parts: Array<[number, number]> = [[Math.max(span(wall)[0], lo), Math.min(span(wall)[1], hi)]];
        for (const opening of wall.openings) {
          if (/^(window|slideWindow|highWindow|bay)$/.test(opening.type)) continue; // there is wall under a window
          parts = parts.flatMap(([a, b]) => [[a, Math.min(b, opening.from)], [Math.max(a, opening.to), b]] as Array<[number, number]>).filter(([a, b]) => b - a > 1);
        }
        pieces.push(...parts.filter(([a, b]) => b - a > 1));
      }
      map[s] = pieces;
      return map;
    }, {} as Record<Side, Array<[number, number]>>);
    const backed = (s: Side, a: number, b: number) => solid[s].some(([p, q]) => p <= a + 1 && b <= q + 1);
    const gapFor = (s: Side, along0: number, along1: number) => curtains && windows.some(window => window.side === s && along0 < window.to && window.from < along1) ? CURTAIN_GAP : WALL_GAP;
    const tryWall = (s: Side, at: string | undefined, item: { key: string; w: number; d: number; h: number }, mounted: boolean, needWall = true): Placed | null => {
      const [lo, hi] = wallSpan(s);
      if (item.w > hi - lo) return null;
      const aside = side(at);
      const base = aside && (s === 'N' || s === 'S' ? aside === 'W' || aside === 'E' : aside === 'N' || aside === 'S')
        ? (aside === 'W' || aside === 'N' ? lo + item.w / 2 : hi - item.w / 2)
        : (lo + hi) / 2;
      const positions = [base];
      for (let step = 25; step <= hi - lo; step += 25) positions.push(base + step, base - step);
      for (const along of positions) {
        if (along - item.w / 2 < lo - 0.5 || along + item.w / 2 > hi + 0.5) continue;
        if ((mounted || needWall) && !backed(s, along - item.w / 2, along + item.w / 2)) continue;
        if (mounted) {
          // Wall-mounted: keep off windows and doors on that wall, and off tall furniture below.
          if (openings.some(opening => opening.side === s && along - item.w / 2 < opening.to && opening.from < along + item.w / 2)) continue;
          const r = footprint(s, along, item.w, item.d, rect, 0);
          if (placed.some(p => !p.mounted && p.h >= 1800 && overlaps(r, footprint(s, along, item.w, 700, rect, 0), 1) && overlaps(p.rect, footprint(s, along, item.w, 700, rect, 0), 1))) continue;
          return { key: item.key, rect: r, rot: ROT[s], side: s, w: item.w, d: item.d, h: item.h, mounted: true };
        }
        const gap = gapFor(s, along - item.w / 2, along + item.w / 2);
        const r = footprint(s, along, item.w, item.d, rect, gap);
        if (free(r, item)) return { key: item.key, rect: r, rot: ROT[s], side: s, w: item.w, d: item.d, h: item.h };
      }
      return null;
    };
    const opposite: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const largestWindowSide = () => [...windows].sort((p, q) => (q.to - q.from) - (p.to - p.from))[0]?.side;
    const record = (p: Placed) => {
      placed.push(p);
      const entry: Record<string, unknown> = { key: p.key, at: center(p.rect).map(round), rot: p.rot };
      const base = CATALOG[p.key];
      if (base && round(p.w) !== base.w) entry.w = round(p.w);
      if (base && round(p.d) !== base.d) entry.d = round(p.d);
      furniture.push(entry as never);
    };
    for (const raw of furnitureByRoom[room.name] ?? []) {
      const count = Math.max(1, Math.min(4, Number(raw.count) || 1));
      for (let copy = 0; copy < count; copy++) placeItem(raw, copy);
    }

    function placeItem(raw: LayoutItem, copy: number) {
      let key = String(raw.key ?? '').trim();
      if (key === 'curtain' || key === 'sheer') return; // curtains come with the windows
      if (!CATALOG[key]) { notes.push(`${room.name}：家具库没有 ${key}，已跳过`); return; }
      const mounted = MOUNTED.has(key);
      if (CEILING.has(key)) {
        const at = center(rect);
        furniture.push({ key, at: at.map(round) as Point, rot: 0 });
        return;
      }
      if (key === 'floorHeat') {
        // Underfloor heating covers the room's floor; it sits under everything else.
        const w = Math.max(600, rect.x1 - rect.x0 - 200), d = Math.max(600, rect.y1 - rect.y0 - 200);
        furniture.push({ key, at: center(rect).map(round) as Point, rot: 0, w: round(w), d: round(d) } as never);
        return;
      }
      if (SOFT.has(key)) {
        const anchor = raw.front ? placed.find(p => p.key === raw.front) : undefined;
        const at = anchor ? frontOf(anchor, raw.gap ?? 300, CATALOG[key].d) : center(rect);
        furniture.push({ key, at: at.map(round) as Point, rot: anchor?.rot ?? 0 });
        return;
      }
      const attempts: Array<{ key: string; w: number; d: number; h: number }> = [];
      for (let k: string | undefined = key; k && CATALOG[k]; k = SMALLER[k]) {
        const base = CATALOG[k];
        const w = k === key && raw.w ? raw.w : base.w, d = k === key && raw.d ? raw.d : base.d;
        attempts.push({ key: k, w, d, h: base.h });
        if (RESIZABLE.has(k)) for (const scale of [0.85, 0.7, 0.55]) if (w * scale >= 800) attempts.push({ key: k, w: w * scale, d, h: base.h });
      }
      for (const item of attempts) {
        const result = locate(raw, item, mounted, copy);
        if (!result) continue;
        if (item.key !== key) notes.push(`${room.name}：${CATALOG[key].name} 放不下，换成 ${CATALOG[item.key].name}`);
        else if (round(item.w) !== round(raw.w ?? CATALOG[key].w)) notes.push(`${room.name}：${CATALOG[key].name} 宽度缩到 ${round(item.w)}mm`);
        record(result);
        if (raw.chairs) addChairs(result, Number(raw.chairs));
        addPlumbing(result);
        return;
      }
      notes.push(raw.optional ? `${room.name}：空间不够，省略了${CATALOG[key].name}` : `${room.name}：放不下${CATALOG[key].name}，已省略`);
    }

    function frontOf(anchor: Placed, gap: number, depth: number): Point {
      const [cx, cy] = center(anchor.rect);
      switch (anchor.side) {
        case 'N': return [cx, anchor.rect.y1 + gap + depth / 2];
        case 'S': return [cx, anchor.rect.y0 - gap - depth / 2];
        case 'W': return [anchor.rect.x1 + gap + depth / 2, cy];
        case 'E': return [anchor.rect.x0 - gap - depth / 2, cy];
        default: return [cx, cy];
      }
    }

    function locate(raw: LayoutItem, item: { key: string; w: number; d: number; h: number }, mounted: boolean, copy: number): Placed | null {
      // Next to another piece on the same wall (nightstands beside the bed).
      if (raw.beside) {
        const anchor = placed.find(p => p.key === raw.beside || CATALOG[p.key]?.type === raw.beside);
        if (anchor?.side) {
          const horizontal = anchor.side === 'N' || anchor.side === 'S';
          const [a0, a1] = horizontal ? [anchor.rect.x0, anchor.rect.x1] : [anchor.rect.y0, anchor.rect.y1];
          const order = copy % 2 === 0 ? [a0 - item.w / 2 - 10, a1 + item.w / 2 + 10] : [a1 + item.w / 2 + 10, a0 - item.w / 2 - 10];
          for (const along of order) {
            const r = footprint(anchor.side, along, item.w, item.d, rect, gapFor(anchor.side, along - item.w / 2, along + item.w / 2));
            if (free(r, item)) return { key: item.key, rect: r, rot: ROT[anchor.side], side: anchor.side, w: item.w, d: item.d, h: item.h };
          }
        }
      }
      // In front of another piece (coffee table before the sofa).
      if (raw.front) {
        const anchor = placed.find(p => p.key === raw.front || CATALOG[p.key]?.type === raw.front);
        if (anchor?.side) {
          const horizontal = anchor.side === 'N' || anchor.side === 'S';
          const [cx, cy] = frontOf(anchor, raw.gap ?? 400, horizontal ? item.d : item.d);
          const r = horizontal ? { x0: cx - item.w / 2, x1: cx + item.w / 2, y0: cy - item.d / 2, y1: cy + item.d / 2 } : { x0: cx - item.d / 2, x1: cx + item.d / 2, y0: cy - item.w / 2, y1: cy + item.w / 2 };
          if (free(r, item)) return { key: item.key, rect: r, rot: anchor.rot, w: item.w, d: item.d, h: item.h };
        }
      }
      // Free-standing in the middle of the room (dining table, island): long side along the room.
      if (raw.center) {
        const [cx, cy] = center(rect);
        const tall = rect.y1 - rect.y0 > rect.x1 - rect.x0;
        for (const [dx, dy] of [[0, 0], [0, 200], [0, -200], [200, 0], [-200, 0], [0, 400], [0, -400], [400, 0], [-400, 0]]) {
          const [w, d] = tall ? [item.d, item.w] : [item.w, item.d];
          const r = { x0: cx + dx - w / 2, x1: cx + dx + w / 2, y0: cy + dy - d / 2, y1: cy + dy + d / 2 };
          if (free(r, item)) return { key: item.key, rect: r, rot: tall ? 90 : 0, w: item.w, d: item.d, h: item.h };
        }
        return null;
      }
      if (raw.corner) {
        for (const s of ['N', 'S'] as Side[]) for (const at of ['W', 'E']) {
          const result = tryWall(s, at, item, mounted);
          if (result && Math.abs((at === 'W' ? result.rect.x0 : result.rect.x1) - (at === 'W' ? rect.x0 : rect.x1)) < 1) return result;
        }
      }
      const wanted = /窗|window/i.test(String(raw.wall ?? '')) ? largestWindowSide() : side(raw.wall);
      const sides: Side[] = wanted ? [wanted, opposite[wanted], ...(['N', 'E', 'S', 'W'] as Side[]).filter(s => s !== wanted && s !== opposite[wanted])] : ['N', 'E', 'S', 'W'];
      for (const s of sides) {
        const result = tryWall(s, raw.at, item, mounted);
        if (result) return result;
      }
      // Last resort for floor pieces: stand along an open side of the room.
      if (!mounted) for (const s of sides) {
        const result = tryWall(s, raw.at, item, mounted, false);
        if (result) return result;
      }
      return null;
    }

    function addChairs(table: Placed, n: number) {
      const chair = CATALOG.chair;
      if (!chair || n <= 0) return;
      const vertical = table.rot === 90 || table.rot === 270;
      const along = vertical ? [table.rect.y0, table.rect.y1] : [table.rect.x0, table.rect.x1];
      const perSide = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const first = i < perSide;
        const k = first ? i : i - perSide;
        const count = first ? perSide : n - perSide;
        const pos = along[0] + (along[1] - along[0]) * (k + 0.5) / count;
        const at: Point = vertical
          ? [first ? table.rect.x0 - chair.d / 2 + 120 : table.rect.x1 + chair.d / 2 - 120, pos]
          : [pos, first ? table.rect.y0 - chair.d / 2 + 120 : table.rect.y1 + chair.d / 2 - 120];
        const rot = vertical ? (first ? 270 : 90) : (first ? 0 : 180);
        furniture.push({ key: 'chair', at: at.map(round) as Point, rot });
      }
    }

    function addPlumbing(p: Placed) {
      const [cx, cy] = center(p.rect);
      if (/toilet/i.test(p.key) && p.side) {
        // Sewer under the toilet, about 300mm off the wall it backs onto.
        const at: Point = p.side === 'N' ? [cx, rect.y0 + 300] : p.side === 'S' ? [cx, rect.y1 - 300] : p.side === 'W' ? [rect.x0 + 300, cy] : [rect.x1 - 300, cy];
        structs.push({ kind: 'sewer', at: at.map(round) as Point });
      }
      if (/^(washer|washerTower|laundrySink)$/.test(p.key)) {
        const at = frontOf(p, 150, 0);
        structs.push({ kind: 'drain', at: at.map(round) as Point });
      }
      if (/^(shower|showerScreen|showerSet|bathtub)$/.test(p.key)) structs.push({ kind: 'drain', at: center(p.rect).map(round) as Point });
    }

    if (WET.test(room.name) && !structs.some(s => s.kind === 'drain' && pointInRect(s.at, rect))) {
      structs.push({ kind: 'drain', at: center(rect).map(round) as Point });
    }
  });

  // ---- spec ----
  const defaultCeil = (name: string) => /卫|厕|浴|厨|bath|kitchen/i.test(name) ? { type: 'alu' }
    : /阳台|露台|balcony/i.test(name) ? { type: 'none' }
    : /客厅|餐厅|起居|living|dining/i.test(name) ? { type: 'edge', cove: true, curtain: 200 }
    : /卧|bed/i.test(name) ? { type: 'edge', cove: true, curtain: 200 }
    : { type: 'flat' };
  const spec: HouseSpec = {
    name: layout.name || '户型',
    height: Number(layout.height) || 2800,
    autoElec: true,
    walls: walls.map(wall => {
      const result: HouseSpec['walls'][number] = { a: wall.a, b: wall.b, t: wall.t };
      if (wall.t >= 200) result.bearing = true;
      if (wall.openings.length) result.openings = wall.openings.map(opening => {
        const out: Record<string, unknown> = { type: opening.type, from: opening.from, to: opening.to };
        if (opening.entry) out.entry = true;
        if (opening.hinge) out.hinge = opening.hinge;
        if (opening.into) out.into = opening.into.map(round);
        return out as never;
      });
      return result;
    }),
    rooms: rooms.map((room, index) => {
      const label: Record<string, unknown> = { name: room.name, at: center(mainRect[index]).map(round), ceil: typeof room.ceil === 'object' && room.ceil ? room.ceil : typeof room.ceil === 'string' ? { type: room.ceil } : defaultCeil(room.name) };
      const floor = finish(FLOOR_MATS, room.mat ?? room.floor), wall = finish(WALL_MATS, room.wallMat ?? room.wall), skirting = finish(SKIRTINGS, room.skirting);
      if (floor) label.mat = floor;
      else if (room.mat ?? room.floor) notes.push(`${room.name}：地面“${room.mat ?? room.floor}”设计器里没有，按默认铺`);
      if (wall) label.wallMat = wall;
      else if (room.wallMat ?? room.wall) notes.push(`${room.name}：墙面“${room.wallMat ?? room.wall}”设计器里没有，按默认刷`);
      if (skirting) label.skirting = skirting;
      return label as never;
    }),
    furniture,
    structs,
  };
  return { spec, notes };
}

/** Room areas (m²) the grid gives, for comparing with the plan. */
export function layoutAreas(layout: Layout): Record<string, number> {
  const cols = layout.cols, rows = layout.rows;
  const out: Record<string, number> = {};
  for (const room of layout.rooms) {
    const ranges = parseCells(room.cells, cols.length, rows.length);
    let total = 0;
    for (const [c0, r0, c1, r1] of ranges) {
      const w = cols.slice(c0, c1 + 1).reduce((s, v) => s + v, 0), h = rows.slice(r0, r1 + 1).reduce((s, v) => s + v, 0);
      total += w * h;
    }
    out[room.name] = Math.round(total / 1e5) / 10;
  }
  return out;
}
