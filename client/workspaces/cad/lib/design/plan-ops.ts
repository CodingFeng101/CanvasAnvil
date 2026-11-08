import type { InternalPlan, SinglePlan, Point } from './types';
import { isBuilding } from './types';
import type { DesignerBridge } from '../../designer/designer-bridge';
import { distance, enclosedRegions, containingRegion } from './geometry';
import { OPENING_DEFAULTS, OPENING_TYPES, isOpeningType } from './opening-types';
import { FLOOR_MATS, WALL_MATS, SKIRTINGS, LOOK_STYLES, LOOK_PALETTES, finish } from './finishes';

export type PlanOp =
  | { op: 'add_furniture'; key: string; x: number; y: number; rot?: number; w?: number; d?: number }
  | { op: 'move_furniture'; id: string; x?: number; y?: number; rot?: number }
  | { op: 'resize_furniture'; id: string; w?: number; d?: number; h?: number }
  | { op: 'replace_furniture'; id: string; key: string }
  | { op: 'remove'; id: string }
  | { op: 'add_opening'; wall: string; type: string; pos: number; width: number; sill?: number; head?: number; hinge?: number }
  | { op: 'update_opening'; id: string; pos?: number; width?: number; type?: string; hinge?: number; sill?: number; head?: number }
  | { op: 'add_wall'; a: Point; b: Point; t: number; bearing?: boolean }
  | { op: 'move_node'; id: string; x: number; y: number }
  | { op: 'update_wall'; id: string; t?: number; bearing?: boolean; status?: string }
  | { op: 'set_room'; at: Point; name: string; ceil?: string | Record<string, unknown> }
  | { op: 'set_plan'; name?: string; height?: number }
  | { op: 'set_finish'; room: string; mat?: string; wallMat?: string; skirting?: string }
  | { op: 'set_look'; style?: string; palette?: string }
  | { op: 'add_elec'; kind: string; x: number; y: number; h?: number; links?: string[] }
  | { op: 'move_elec'; id: string; x?: number; y?: number; h?: number }
  | { op: 'link_elec'; id: string; lights: string[] }
  | { op: 'relayout_elec' };

/** What a batch of operations touched: the session re-runs the MEP layout after layout changes. */
export type OpsTouched = { layout: boolean; elec: boolean; finish: boolean; look: boolean; relayoutElec: boolean };

/** MEP point kinds the designer draws (plan.elec[].kind); line lights (strip / track / linear) are left to the designer. */
export const ELEC_KINDS = ['socket', 'socketUSB', 'socketW', 'socket16', 'socketAC', 'socketHood', 'socketFloor', 'socketEV', 'panel',
  'switch1', 'switch2', 'switch3', 'dimmer', 'light', 'pendant', 'downlight', 'spot', 'wallLamp',
  'weak', 'net', 'tv', 'intercom', 'smoke', 'cold', 'hot', 'waste', 'waterIn', 'acHole', 'freshAir', 'gas'] as const;
const SWITCHES = new Set(['switch1', 'switch2', 'switch3', 'dimmer']);
const LIGHTS = new Set(['light', 'pendant', 'downlight', 'spot', 'wallLamp', 'strip', 'track', 'linear']);
// On the ceiling or in the floor: no wall to stand against.
const UNMOUNTED = new Set(['light', 'pendant', 'downlight', 'spot', 'smoke', 'freshAir', 'socketFloor']);
// Mount heights the designer's own MEP layout uses.
const ELEC_HEIGHT: Record<string, number> = {
  socket: 300, socketUSB: 700, socketW: 1100, socket16: 300, socketAC: 2200, socketHood: 2150, socketEV: 1300, panel: 1800,
  switch1: 1300, switch2: 1300, switch3: 1300, dimmer: 1300, wallLamp: 1800, weak: 300, net: 300, tv: 1100, intercom: 1400,
  cold: 500, hot: 500, waste: 400, waterIn: 300, acHole: 2350, gas: 600,
};
type Elec = { id: string; kind: string; x: number; y: number; rot: number; h: number; links?: string[]; [key: string]: unknown };
const elecOf = (plan: SinglePlan) => ((plan as { elec?: Elec[] }).elec ??= []);

type Context = { makeFurn: DesignerBridge['makeFurn']; isValidKey(key: string): boolean };

/**
 * A wall point goes on the face of the nearest wall, on the side the given point is on, 60mm out
 * from the wall surface as the designer places its own points; rot faces into the room.
 */
function mountOnWall(plan: SinglePlan, kind: string, x: number, y: number, h: number): { x: number; y: number; rot: number } {
  if (UNMOUNTED.has(kind)) return { x: Math.round(x), y: Math.round(y), rot: 0 };
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  let best: { wall: SinglePlan['walls'][number]; along: number; length: number; ux: number; uy: number; ax: number; ay: number; gap: number } | undefined;
  for (const wall of plan.walls) {
    const a = nodes.get(wall.a), b = nodes.get(wall.b);
    if (!a || !b || wall.status === 'removed') continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) continue;
    const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    const along = Math.max(0, Math.min(length, (x - a.x) * ux + (y - a.y) * uy));
    const gap = Math.hypot(a.x + ux * along - x, a.y + uy * along - y);
    if (!best || gap < best.gap) best = { wall, along, length, ux, uy, ax: a.x, ay: a.y, gap };
  }
  requireValue(best && best.gap <= 600, `点位 (${Math.round(x)}, ${Math.round(y)}) 离最近的墙超过 600mm；${kind} 要装在墙上，坐标请给在房间里贴近那面墙的位置`);
  const { wall, length, ux, uy, ax, ay } = best;
  const along = Math.max(100, Math.min(length - 100, best.along));
  for (const opening of plan.openings.filter(item => item.wall === wall.id)) {
    const sill = Number(opening.sill ?? 0);
    if (h + 100 > sill && Math.abs(along - opening.pos) < opening.width / 2 + 50) {
      throw new Error(`点位落在洞口 ${opening.id}（${opening.type}，沿墙 ${Math.round(opening.pos - opening.width / 2)}–${Math.round(opening.pos + opening.width / 2)}）上，请挪到洞口旁边的实墙上（门旁开关一般离门边 150–300mm）`);
    }
  }
  const nx = -uy, ny = ux, cx = ax + ux * along, cy = ay + uy * along;
  const side = (x - cx) * nx + (y - cy) * ny >= 0 ? 1 : -1;
  const ix = nx * side, iy = ny * side, offset = wall.t / 2 + 60;
  return { x: Math.round(cx + ix * offset), y: Math.round(cy + iy * offset), rot: Math.round(Math.atan2(-ix, iy) * 180 / Math.PI) };
}
/** Rooms a finish applies to: by name, or every indoor dry room for "全部". */
function roomsNamed(plan: SinglePlan, name: string) {
  if (/^(\*|全部|所有|全屋)$/.test(name.trim())) return plan.rooms.filter(room => !/卫|浴|厕|厨|阳台|露台|庭院|花园|车库/.test(room.name));
  const exact = plan.rooms.filter(room => room.name === name);
  const found = exact.length ? exact : plan.rooms.filter(room => room.name.includes(name) || name.includes(room.name));
  requireValue(found.length, `找不到房间“${name}”，可用：${plan.rooms.map(room => room.name).join('、')}`);
  return found;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every(finite);
function patch<T extends object>(target: T, operation: object, fields: string[]) {
  const values = operation as Record<string, unknown>;
  for (const field of fields) if (values[field] !== undefined) Object.assign(target, { [field]: values[field] });
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function find<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find(item => item.id === id);
  requireValue(item, `找不到 id=${id}，请使用当前摘要里的 id`);
  return item;
}
function openingDefaults(type: string) {
  requireValue(isOpeningType(type),
    `不支持洞口类型 ${String(type)}，可选类型：${OPENING_TYPES.join('、')}`);
  return OPENING_DEFAULTS[type];
}
function checkFurniturePosition(plan: SinglePlan, x: number, y: number) {
  const wallNodes = plan.walls.filter(wall => wall.status !== 'removed')
    .flatMap(wall => [find(plan.nodes, wall.a), find(plan.nodes, wall.b)]);
  requireValue(wallNodes.length > 0, '缺少有效墙体，无法校验家具坐标');
  const xs = wallNodes.map(node => node.x), ys = wallNodes.map(node => node.y);
  const minX = Math.min(...xs) - 2000, maxX = Math.max(...xs) + 2000;
  const minY = Math.min(...ys) - 2000, maxY = Math.max(...ys) + 2000;
  requireValue(x >= minX && x <= maxX && y >= minY && y <= maxY,
    `家具坐标 (${x}, ${y}) 超出墙体包围盒外扩 2000mm 的范围，请满足 ${minX} ≤ x ≤ ${maxX}、${minY} ≤ y ≤ ${maxY}`);
}
function checkOpenings(plan: SinglePlan, wallIds: string[]) {
  for (const wallId of wallIds) {
    const wall = find(plan.walls, wallId);
    const a = find(plan.nodes, wall.a), b = find(plan.nodes, wall.b);
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    requireValue(length > 0, '墙的端点不能重合');
    for (const opening of plan.openings.filter(item => item.wall === wallId)) {
      requireValue(finite(opening.pos) && finite(opening.width) && opening.width > 0 && opening.pos - opening.width / 2 > 0 && opening.pos + opening.width / 2 < length,
        `洞口 ${opening.id} 越界或宽度无效，请满足 0 < pos-width/2 < pos+width/2 < ${Math.round(length)}`);
    }
  }
}
function applyOne(plan: SinglePlan, operation: PlanOp, ctx: Context) {
  requireValue(operation && typeof operation === 'object', '操作必须是对象');
  const values = operation as unknown as Record<string, unknown>;
  for (const key of ['x', 'y', 'rot', 'w', 'd', 'h', 't', 'pos', 'width', 'sill', 'head', 'hinge', 'height']) {
    if (values[key] !== undefined) requireValue(finite(values[key]), `${key} 必须是有限数字`);
  }
  for (const key of ['w', 'd', 'h', 't', 'width', 'height']) {
    if (values[key] !== undefined) requireValue(Number(values[key]) > 0, `${key} 必须大于 0`);
  }
  if (values.bearing !== undefined) requireValue(typeof values.bearing === 'boolean', 'bearing 必须是布尔值');
  if (values.name !== undefined) requireValue(typeof values.name === 'string', 'name 必须是字符串');
  if (values.status !== undefined) requireValue(['existing', 'new', 'removed'].includes(String(values.status)), 'status 必须为 existing/new/removed');
  switch (operation.op) {
    case 'add_furniture': {
      requireValue(ctx.isValidKey(operation.key), `家具库没有 ${operation.key}`);
      requireValue(finite(operation.x) && finite(operation.y), '填写家具 x/y');
      checkFurniturePosition(plan, operation.x, operation.y);
      const furniture = ctx.makeFurn(operation.key, operation.x, operation.y, operation.rot ?? 0) as SinglePlan['furniture'][number];
      requireValue(furniture.id && !plan.furniture.some(item => item.id === furniture.id), '家具 id 缺失或重复');
      const added = structuredClone(furniture);
      patch(added, operation, ['w', 'd']);
      plan.furniture.push(added);
      break;
    }
    case 'move_furniture': {
      const furniture = find(plan.furniture, operation.id);
      checkFurniturePosition(plan, operation.x ?? furniture.x, operation.y ?? furniture.y);
      patch(furniture, operation, ['x', 'y', 'rot']);
      break;
    }
    case 'resize_furniture':
      patch(find(plan.furniture, operation.id), operation, ['w', 'd', 'h']);
      break;
    case 'replace_furniture': {
      requireValue(ctx.isValidKey(operation.key), `家具库没有 ${operation.key}`);
      const old = find(plan.furniture, operation.id);
      const replacement = ctx.makeFurn(operation.key, old.x, old.y, Number(old.rot ?? 0));
      plan.furniture[plan.furniture.indexOf(old)] = { ...structuredClone(replacement), id: old.id, key: operation.key, x: old.x, y: old.y, rot: old.rot };
      break;
    }
    case 'remove': {
      const furniture = plan.furniture.find(item => item.id === operation.id);
      if (furniture) { plan.furniture.splice(plan.furniture.indexOf(furniture), 1); break; }
      const opening = plan.openings.find(item => item.id === operation.id);
      if (opening) { plan.openings.splice(plan.openings.indexOf(opening), 1); break; }
      const elec = elecOf(plan), point = elec.find(item => item.id === operation.id);
      if (point) {
        elec.splice(elec.indexOf(point), 1);
        for (const item of elec) if (item.links?.includes(point.id)) item.links = item.links.filter(id => id !== point.id);
        break;
      }
      const wall = find(plan.walls, operation.id);
      plan.walls.splice(plan.walls.indexOf(wall), 1);
      plan.openings = plan.openings.filter(item => item.wall !== wall.id);
      const usedNodes = new Set(plan.walls.flatMap(item => [item.a, item.b]));
      plan.nodes = plan.nodes.filter(item => usedNodes.has(item.id));
      break;
    }
    case 'add_opening': {
      find(plan.walls, operation.wall);
      const defaults = openingDefaults(operation.type);
      const opening = { id: crypto.randomUUID(), wall: operation.wall, type: operation.type, pos: operation.pos, width: operation.width, ...defaults, hinge: 0, side: 1 };
      patch(opening, operation, ['sill', 'head', 'hinge']);
      plan.openings.push(opening);
      checkOpenings(plan, [operation.wall]);
      break;
    }
    case 'update_opening': {
      const opening = find(plan.openings, operation.id);
      const defaults = openingDefaults(operation.type === undefined ? opening.type : operation.type);
      if (operation.type !== undefined && operation.type !== opening.type) Object.assign(opening, defaults);
      patch(opening, operation, ['pos', 'width', 'type', 'hinge', 'sill', 'head']);
      checkOpenings(plan, [opening.wall]);
      break;
    }
    case 'add_wall': {
      requireValue(isPoint(operation.a) && isPoint(operation.b), 'a/b 必须为两元数字坐标');
      requireValue(finite(operation.t) && operation.t > 0, '墙厚 t 必须大于 0');
      const nodeFor = (point: Point) => {
        const existing = plan.nodes.find(node => distance([node.x, node.y], point) <= 40);
        if (existing) return existing.id;
        const node = { id: crypto.randomUUID(), x: point[0], y: point[1] };
        plan.nodes.push(node);
        return node.id;
      };
      const a = nodeFor(operation.a), b = nodeFor(operation.b);
      requireValue(a !== b, '端点吸附后墙长为 0，请拉开两个端点');
      plan.walls.push({ id: crypto.randomUUID(), a, b, t: operation.t, bearing: operation.bearing ?? false, status: 'new' });
      break;
    }
    case 'move_node': {
      requireValue(finite(operation.x) && finite(operation.y), '填写节点 x/y');
      patch(find(plan.nodes, operation.id), operation, ['x', 'y']);
      checkOpenings(plan, plan.walls.filter(wall => wall.a === operation.id || wall.b === operation.id).map(wall => wall.id));
      break;
    }
    case 'update_wall':
      patch(find(plan.walls, operation.id), operation, ['t', 'bearing', 'status']);
      break;
    case 'set_room': {
      requireValue(isPoint(operation.at) && typeof operation.name === 'string', '填写房间 at 坐标和 name');
      // One label per enclosed room: renaming a recognized or earlier room replaces its label instead of stacking a second one.
      const nodes = new Map(plan.nodes.map(node => [node.id, node]));
      const regions = enclosedRegions(plan.walls.filter(wall => wall.status !== 'removed' && nodes.has(wall.a) && nodes.has(wall.b)).map(wall => ({ a: [nodes.get(wall.a)!.x, nodes.get(wall.a)!.y] as Point, b: [nodes.get(wall.b)!.x, nodes.get(wall.b)!.y] as Point })));
      const region = containingRegion(operation.at, regions);
      const existing = plan.rooms.find(room => distance([room.x, room.y], operation.at) <= 40)
        ?? (region && plan.rooms.find(room => containingRegion([room.x, room.y], regions) === region));
      // Same defaults the designer uses when it reads a spec's room ceiling.
      const given = typeof operation.ceil === 'string' ? { type: operation.ceil } : operation.ceil;
      const ceil = given && typeof given === 'object' ? { ceil: { type: 'none', drop: 0, edgeW: 400, cove: false, ...given } } : {};
      if (existing) Object.assign(existing, { name: operation.name, x: operation.at[0], y: operation.at[1] }, ceil);
      else plan.rooms.push({ id: crypto.randomUUID(), x: operation.at[0], y: operation.at[1], name: operation.name, ...ceil });
      break;
    }
    case 'set_plan':
      patch(plan, operation, ['name', 'height']);
      break;
    case 'set_finish': {
      requireValue(typeof operation.room === 'string' && operation.room, '填写 room 房间名');
      const values: Record<string, string> = {};
      for (const [field, table, label] of [['mat', FLOOR_MATS, '地面'], ['wallMat', WALL_MATS, '墙面'], ['skirting', SKIRTINGS, '踢脚线']] as const) {
        const given = (operation as Record<string, unknown>)[field];
        if (given === undefined) continue;
        const key = finish(table, given);
        requireValue(key, `${label}材质“${String(given)}”设计器里没有，可选：${Object.entries(table).map(([k, names]) => `${k}(${names[0]})`).join('、')}`);
        values[field] = key;
      }
      requireValue(Object.keys(values).length, 'set_finish 至少填 mat / wallMat / skirting 之一');
      for (const room of roomsNamed(plan, operation.room)) Object.assign(room, values);
      break;
    }
    case 'set_look': {
      const look: Record<string, string> = {};
      if (operation.style !== undefined) {
        const key = finish(LOOK_STYLES, operation.style);
        requireValue(key, `3D 风格“${String(operation.style)}”没有，可选：${Object.keys(LOOK_STYLES).join('、')}`);
        look.style = key;
      }
      if (operation.palette !== undefined) {
        const key = finish(LOOK_PALETTES, operation.palette);
        requireValue(key, `配色“${String(operation.palette)}”没有，可选：${Object.entries(LOOK_PALETTES).map(([k, names]) => `${k}(${names[0]})`).join('、')}`);
        look.palette = key;
      }
      requireValue(Object.keys(look).length, 'set_look 至少填 style 或 palette');
      plan.look = { ...(plan.look as object | undefined), ...look };
      break;
    }
    case 'add_elec': {
      requireValue((ELEC_KINDS as readonly string[]).includes(operation.kind), `没有点位类型 ${String(operation.kind)}，可选：${ELEC_KINDS.join('、')}`);
      requireValue(finite(operation.x) && finite(operation.y), '填写点位 x/y');
      checkFurniturePosition(plan, operation.x, operation.y);
      const h = operation.h ?? ELEC_HEIGHT[operation.kind] ?? 0;
      const elec = elecOf(plan);
      const point: Elec = { id: Math.random().toString(36).slice(2, 10), kind: operation.kind, ...mountOnWall(plan, operation.kind, operation.x, operation.y, h), h };
      if (operation.links !== undefined) {
        requireValue(SWITCHES.has(operation.kind), 'links 只用于开关');
        requireValue(Array.isArray(operation.links) && operation.links.every(id => elec.some(item => item.id === id && LIGHTS.has(item.kind))), 'links 里每个 id 都必须是摘要里已有的灯');
        point.links = [...operation.links];
      }
      elec.push(point);
      break;
    }
    case 'move_elec': {
      const point = find(elecOf(plan), operation.id);
      const h = operation.h ?? point.h;
      Object.assign(point, mountOnWall(plan, point.kind, operation.x ?? point.x, operation.y ?? point.y, h), { h });
      break;
    }
    case 'link_elec': {
      const elec = elecOf(plan), point = find(elec, operation.id);
      requireValue(SWITCHES.has(point.kind), `${operation.id} 不是开关`);
      requireValue(Array.isArray(operation.lights) && operation.lights.every(id => elec.some(item => item.id === id && LIGHTS.has(item.kind))), 'lights 里每个 id 都必须是摘要里已有的灯');
      point.links = [...operation.lights];
      break;
    }
    case 'relayout_elec':
      break;
    default:
      throw new Error(`未知操作 ${values.op}`);
  }
}
const TOUCHES: Record<string, keyof OpsTouched> = {
  set_finish: 'finish', set_look: 'look', set_plan: 'finish',
  add_elec: 'elec', move_elec: 'elec', link_elec: 'elec', relayout_elec: 'relayoutElec',
};
export function applyOps(input: InternalPlan, ops: PlanOp[], ctx: Context): { plan: InternalPlan; applied: number; rejected: { index: number; reason: string }[]; touched: OpsTouched } {
  let plan = structuredClone(input);
  const rejected: { index: number; reason: string }[] = [];
  const touched: OpsTouched = { layout: false, elec: false, finish: false, look: false, relayoutElec: false };
  let applied = 0;
  ops.forEach((operation, index) => {
    try {
      requireValue(!isBuilding(plan), '暂只支持单层修改');
      const candidate = structuredClone(plan);
      applyOne(candidate, operation, ctx);
      // remove takes any id: it is an MEP edit when the id was a point.
      const removedPoint = operation.op === 'remove' && ((plan as { elec?: Elec[] }).elec ?? []).some(item => item.id === operation.id);
      touched[removedPoint ? 'elec' : TOUCHES[operation.op] ?? 'layout'] = true;
      plan = candidate;
      applied++;
    } catch (reason) {
      rejected.push({ index, reason: reason instanceof Error ? reason.message : String(reason) });
    }
  });
  return { plan, applied, rejected, touched };
}
