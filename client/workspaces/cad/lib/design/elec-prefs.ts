import type { RoomArea, SinglePlan } from './types';

/**
 * Wiring preferences the designer's one-click MEP layout cannot take as input. After it has placed
 * its points, these add sockets and network points, move the panel and network boxes, and add floor
 * sockets, so the result follows what the user picked in the plan.
 */
export type ElecPrefs = {
  /** Extra sockets on every free wall of living rooms and bedrooms. */
  moreSockets?: boolean;
  /** Which rooms get a network point. */
  net?: 'living' | 'bedrooms' | 'all';
  /** Where the panel (强电箱) and network box (弱电箱) go. */
  boxes?: 'entry' | 'tv' | 'hall';
  /** Extra sockets above the kitchen counter. */
  kitchenSockets?: number;
  /** A floor socket under the dining table (and coffee table). */
  floorSocket?: boolean;
  /** Bedside sockets with USB. */
  bedsideUsb?: boolean;
};

type Decision = { topic?: unknown; choice?: unknown };

/** Read the plan's wiring decisions ("插座数量: 加密", "网口: 每个卧室"…) into preferences. */
export function elecPrefsFromDecisions(decisions: unknown): ElecPrefs {
  const prefs: ElecPrefs = {};
  if (!Array.isArray(decisions)) return prefs;
  for (const item of decisions as Decision[]) {
    const topic = String(item?.topic ?? ''), choice = [item?.choice].flat().map(String).join('、');
    if (!topic || !choice || /^(不|无|标准|默认)/.test(choice) && !/网|电箱/.test(topic)) continue;
    if (/地插/.test(topic)) prefs.floorSocket = !/不/.test(choice);
    else if (/床头/.test(topic)) prefs.bedsideUsb = /USB|usb|Type/i.test(choice);
    else if (/厨房/.test(topic) && /插座/.test(topic)) prefs.kitchenSockets = /多|加/.test(choice) ? 3 : 0;
    else if (/插座/.test(topic)) prefs.moreSockets = /加密|多留|多/.test(choice);
    else if (/网/.test(topic)) prefs.net = /每个房间|全部|所有/.test(choice) ? 'all' : /卧/.test(choice) ? 'bedrooms' : 'living';
    else if (/电箱/.test(topic)) prefs.boxes = /玄关|入户|门口/.test(choice) ? 'entry' : /电视/.test(choice) ? 'tv' : /过道|走廊|储物/.test(choice) ? 'hall' : undefined;
  }
  return prefs;
}

type Elec = { id: string; kind: string; x: number; y: number; rot: number; h: number; [key: string]: unknown };
type Rect = { x: number; y: number; w: number; h: number };
type Side = 'N' | 'S' | 'W' | 'E';
// Mount heights the designer uses for these points.
const HEIGHT: Record<string, number> = { socket: 300, socketUSB: 700, net: 300, weak: 300, panel: 1800, socketFloor: 0 };
// Inward direction of each wall face, and the designer's rot for a point on it (rot = atan2(-dx, dy)).
const INWARD: Record<Side, [number, number]> = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
const rotOf = (side: Side) => Math.round(Math.atan2(-INWARD[side][0], INWARD[side][1]) * 180 / Math.PI);
const TALL = /^(wardrobe|cabinet|bookshelf|shoeCabinet|sideboard|tallOven|fridge|acFloor|cabWall)/;
const LIVING = /客|厅|起居/, BEDROOM = /卧|书房|儿童|客房/, WET = /卫|浴|厨|阳台|洗衣/;

export function applyElecPrefs(plan: SinglePlan, rooms: RoomArea[], prefs: ElecPrefs): { plan: SinglePlan; changed: number; notes: string[] } {
  const next: SinglePlan = JSON.parse(JSON.stringify(plan));
  const elec = ((next as { elec?: Elec[] }).elec ??= []) as Elec[];
  const notes: string[] = [];
  let changed = 0;
  const nodes = new Map(next.nodes.map(node => [node.id, node]));
  const furniture = next.furniture as Array<{ key: string; type?: string; x: number; y: number; w?: number; d?: number; rot?: number }>;
  const footprint = (item: (typeof furniture)[number]) => {
    const turned = Math.abs(Math.round((item.rot ?? 0) / 90)) % 2 === 1;
    const w = Number(item.w ?? 600), d = Number(item.d ?? 600);
    return { hw: (turned ? d : w) / 2, hd: (turned ? w : d) / 2 };
  };
  const roomOf = (x: number, y: number) => rooms.find(room => room.rects?.some(r => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1));

  /** Openings on the wall behind a rect side, as intervals along that side. */
  const openingsOn = (rect: Rect, side: Side): Array<[number, number]> => {
    const horizontal = side === 'N' || side === 'S';
    const face = side === 'N' ? rect.y : side === 'S' ? rect.y + rect.h : side === 'W' ? rect.x : rect.x + rect.w;
    const spans: Array<[number, number]> = [];
    for (const wall of next.walls) {
      const a = nodes.get(wall.a), b = nodes.get(wall.b);
      if (!a || !b) continue;
      const line = horizontal ? a.y : a.x;
      if ((horizontal ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x)) > 1 || Math.abs(Math.abs(line - face) - wall.t / 2) > 80) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      for (const opening of next.openings.filter(item => item.wall === wall.id)) {
        const cx = a.x + ux * opening.pos, cy = a.y + uy * opening.pos, at = horizontal ? cx : cy;
        spans.push([at - opening.width / 2 - 150, at + opening.width / 2 + 150]);
      }
    }
    return spans;
  };
  const pointOn = (rect: Rect, side: Side, along: number): [number, number] => {
    const inset = 60;
    return side === 'N' ? [along, rect.y + inset] : side === 'S' ? [along, rect.y + rect.h - inset] : side === 'W' ? [rect.x + inset, along] : [rect.x + rect.w - inset, along];
  };
  const blocked = (x: number, y: number, h: number) => furniture.some(item => {
    if (!TALL.test(String(item.type ?? item.key)) || h > 2000) return false;
    const { hw, hd } = footprint(item);
    return Math.abs(x - item.x) < hw + 80 && Math.abs(y - item.y) < hd + 80;
  });
  /** A free spot on this rect side, nearest to `prefer` (an along-the-wall coordinate). */
  const spotOn = (rect: Rect, side: Side, kind: string, prefer?: number): [number, number] | null => {
    const horizontal = side === 'N' || side === 'S';
    const [start, end] = horizontal ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    if (end - start < 700) return null;
    const target = prefer ?? (start + end) / 2;
    const spans = openingsOn(rect, side);
    const candidates: number[] = [];
    for (let at = start + 300; at <= end - 300; at += 50) candidates.push(at);
    candidates.sort((p, q) => Math.abs(p - target) - Math.abs(q - target));
    for (const at of candidates) {
      if (spans.some(([lo, hi]) => at > lo && at < hi)) continue;
      const [x, y] = pointOn(rect, side, at);
      if (blocked(x, y, HEIGHT[kind] ?? 300)) continue;
      const boxes = /^(panel|weak)$/;
      if (elec.some(item => (item.kind === kind || (boxes.test(kind) && boxes.test(item.kind))) && Math.hypot(item.x - x, item.y - y) < (boxes.test(kind) ? 500 : 400))) continue;
      return [x, y];
    }
    return null;
  };
  const add = (kind: string, x: number, y: number, rot: number, h = HEIGHT[kind] ?? 300) => {
    elec.push({ id: `pref-${kind}-${Math.random().toString(36).slice(2, 9)}`, kind, x: Math.round(x), y: Math.round(y), rot, h });
    changed++;
  };
  const sides: Side[] = ['N', 'S', 'W', 'E'];
  const nearSide = (rect: Rect, side: Side, x: number, y: number) =>
    side === 'N' ? Math.abs(y - rect.y) < 300 && x >= rect.x && x <= rect.x + rect.w
      : side === 'S' ? Math.abs(y - rect.y - rect.h) < 300 && x >= rect.x && x <= rect.x + rect.w
        : side === 'W' ? Math.abs(x - rect.x) < 300 && y >= rect.y && y <= rect.y + rect.h
          : Math.abs(x - rect.x - rect.w) < 300 && y >= rect.y && y <= rect.y + rect.h;
  const mainRect = (room: RoomArea) => [...(room.rects ?? [])].sort((p, q) => q.w * q.h - p.w * p.h)[0];

  if (prefs.moreSockets) {
    let added = 0;
    for (const room of rooms.filter(item => (LIVING.test(item.name) || BEDROOM.test(item.name)) && !WET.test(item.name))) {
      for (const rect of room.rects ?? []) for (const side of sides) {
        const length = side === 'N' || side === 'S' ? rect.w : rect.h;
        if (length < 1500) continue;
        if (elec.some(item => /^socket/.test(item.kind) && item.kind !== 'socketAC' && nearSide(rect, side, item.x, item.y))) continue;
        const spot = spotOn(rect, side, 'socket');
        if (spot) { add('socket', spot[0], spot[1], rotOf(side)); added++; }
      }
    }
    if (added) notes.push(`插座加密：多留了 ${added} 个插座`);
  }

  if (prefs.net) {
    const wanted = rooms.filter(room => !WET.test(room.name) && (LIVING.test(room.name) || (prefs.net !== 'living' && BEDROOM.test(room.name)) || (prefs.net === 'all' && !/玄关|过道|走廊|储物/.test(room.name))));
    let added = 0;
    for (const room of wanted) {
      const rect = mainRect(room);
      if (!rect || elec.some(item => item.kind === 'net' && roomOf(item.x, item.y) === room)) continue;
      // Next to a socket on the same wall when there is one (desk, TV, bedside), otherwise a free wall.
      const socket = elec.find(item => /^socket(USB)?$/.test(item.kind) && roomOf(item.x, item.y) === room);
      let side = socket ? sides.find(item => nearSide(rect, item, socket.x, socket.y)) : undefined;
      let point = side && socket ? spotOn(rect, side, 'net', (side === 'N' || side === 'S' ? socket.x : socket.y) + 150) : null;
      if (!point) for (const item of sides) { point = spotOn(rect, item, 'net'); if (point) { side = item; break; } }
      if (point && side) { add('net', point[0], point[1], rotOf(side)); added++; }
    }
    if (added) notes.push(`网口：补了 ${added} 个房间的网络插座`);
  }

  if (prefs.boxes) {
    // Walls to try, best first: next to the front door / the TV, then the rest of that room.
    type Spot = { rect: Rect; side: Side; prefer?: number };
    const wallsOf = (room: RoomArea, near?: { x: number; y: number }): Spot[] =>
      (room.rects ?? []).flatMap(rect => sides.map(side => ({ rect, side })))
        .sort((p, q) => (near ? distanceTo(p.rect, p.side, near.x, near.y) - distanceTo(q.rect, q.side, near.x, near.y) : 0))
        .map(({ rect, side }) => ({ rect, side, prefer: near ? (side === 'N' || side === 'S' ? near.x : near.y) : undefined }));
    let candidates: Spot[] = [], place = '';
    if (prefs.boxes === 'tv') {
      const tv = furniture.find(item => /^(tvCabinet|wallTV)/.test(item.key));
      const room = tv && roomOf(tv.x, tv.y);
      if (tv && room) {
        const { hw } = footprint(tv);
        candidates = wallsOf(room, tv).map((spot, index) => (index === 0 && spot.prefer !== undefined ? { ...spot, prefer: spot.prefer + hw + 300 } : spot));
        place = '电视墙旁';
      }
    } else {
      const door = entryDoor();
      const room = prefs.boxes === 'entry' ? rooms.find(item => /玄关|门厅/.test(item.name)) ?? door?.room : rooms.find(item => /储物|过道|走廊/.test(item.name));
      if (room) {
        candidates = wallsOf(room, prefs.boxes === 'entry' && door ? door : undefined)
          .map(spot => (door && spot.prefer !== undefined ? { ...spot, prefer: spot.prefer + door.width / 2 + 400 } : spot));
        place = prefs.boxes === 'entry' && door ? `${room.name}入户门附近` : room.name;
      }
    }
    let moved = 0;
    for (const kind of ['panel', 'weak']) {
      for (const candidate of candidates) {
        const spot = spotOn(candidate.rect, candidate.side, kind, candidate.prefer === undefined ? undefined : candidate.prefer + (kind === 'weak' ? 500 : 0));
        if (!spot) continue;
        const existing = elec.find(item => item.kind === kind);
        if (existing) { Object.assign(existing, { x: Math.round(spot[0]), y: Math.round(spot[1]), rot: rotOf(candidate.side), h: HEIGHT[kind] }); changed++; }
        else add(kind, spot[0], spot[1], rotOf(candidate.side));
        moved++;
        break;
      }
    }
    notes.push(moved ? `强弱电箱：放在${place}` : '强弱电箱：没找到合适的墙，保留设计器的位置');
  }

  if (prefs.kitchenSockets) {
    const counter = furniture.find(item => /^(counter|lCounter|uCounter)$/.test(item.key));
    const room = counter && roomOf(counter.x, counter.y), rect = room && mainRect(room);
    if (counter && rect) {
      const side = sides.slice().sort((p, q) => distanceTo(rect, p, counter.x, counter.y) - distanceTo(rect, q, counter.x, counter.y))[0];
      const { hw, hd } = footprint(counter);
      const half = side === 'N' || side === 'S' ? hw : hd, middle = side === 'N' || side === 'S' ? counter.x : counter.y;
      // Walk the counter's length and add waterproof sockets (as the designer uses in kitchens) wherever
      // none is within 450mm at counter height.
      let added = 0;
      const spans = openingsOn(rect, side);
      for (let along = middle - half + 150; along <= middle + half - 150 && added < prefs.kitchenSockets; along += 50) {
        if (spans.some(([lo, hi]) => along > lo && along < hi)) continue;
        const [x, y] = pointOn(rect, side, along);
        if (elec.some(item => /^socket/.test(item.kind) && Math.abs(item.h - 1100) < 300 && Math.hypot(item.x - x, item.y - y) < 450)) continue;
        add('socketW', x, y, rotOf(side), 1100);
        added++;
      }
      if (added) notes.push(`厨房台面：多留了 ${added} 个插座`);
      if (added < prefs.kitchenSockets) notes.push(added ? '厨房台面：其余位置是窗或已有插座，没再加' : '厨房台面：台面那面墙是窗或已经有插座，没地方多留');
    }
  }

  if (prefs.floorSocket) {
    let added = 0;
    for (const table of furniture.filter(item => /^(diningTable|roundTable|coffeeTable|roundCoffee|ovalCoffee)/.test(item.key))) {
      if (elec.some(item => item.kind === 'socketFloor' && Math.hypot(item.x - table.x, item.y - table.y) < 600)) continue;
      add('socketFloor', table.x, table.y, 0, 0);
      added++;
    }
    if (added) notes.push(`地插：餐桌/茶几下加了 ${added} 个`);
  }

  if (prefs.bedsideUsb) {
    let swapped = 0;
    for (const stand of furniture.filter(item => /^nightstand/.test(item.key))) {
      const socket = elec.filter(item => item.kind === 'socket' && Math.hypot(item.x - stand.x, item.y - stand.y) < 700)
        .sort((p, q) => Math.hypot(p.x - stand.x, p.y - stand.y) - Math.hypot(q.x - stand.x, q.y - stand.y))[0];
      if (socket) { socket.kind = 'socketUSB'; socket.h = HEIGHT.socketUSB; swapped++; changed++; }
    }
    if (swapped) notes.push(`床头：${swapped} 个插座换成 USB 插座`);
  }
  return { plan: next, changed, notes };

  /** Distance from a point to this side of the rect, as a segment (beyond its ends counts too). */
  function distanceTo(rect: Rect, side: Side, x: number, y: number) {
    const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);
    const [px, py] = side === 'N' ? [clamp(x, rect.x, rect.x + rect.w), rect.y] : side === 'S' ? [clamp(x, rect.x, rect.x + rect.w), rect.y + rect.h]
      : side === 'W' ? [rect.x, clamp(y, rect.y, rect.y + rect.h)] : [rect.x + rect.w, clamp(y, rect.y, rect.y + rect.h)];
    return Math.hypot(x - px, y - py);
  }
  /** The front door: its centre, width and the room it opens into. */
  function entryDoor() {
    const door = next.openings.find(opening => opening.entry);
    const wall = door && next.walls.find(item => item.id === door.wall);
    const a = wall && nodes.get(wall.a), b = wall && nodes.get(wall.b);
    if (!door || !a || !b) return undefined;
    const length = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    const x = a.x + ux * door.pos, y = a.y + uy * door.pos;
    for (const sign of [1, -1]) {
      const room = roomOf(x - uy * sign * (wall!.t / 2 + 300), y + ux * sign * (wall!.t / 2 + 300));
      if (room) return { room, x, y, width: door.width };
    }
    return undefined;
  }
}
