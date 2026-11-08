import type { BuildingPlan, HouseSpec, InternalPlan, Point, SinglePlan } from './types';
import { isBuilding } from './types';

/**
 * The designer's internal plan written back as a HouseSpec (designer/reference/spec-format.md), so the
 * model can edit any part of a design in the designer's own format and the designer loads it again.
 *
 * The designer has no such export; this inverts its spec loader field by field:
 * - walls: node ids → end points; `align` (which face stays put) → `flush` N/S/E/W, and `flush: "C"`
 *   for walls without one, so the loader neither re-infers an alignment nor moves anything;
 * - openings: `pos`/`width` along the wall → world `from`/`to` (x on horizontal walls, y on vertical
 *   ones, distance from `a` on slanted ones); `hinge` 0/1 → "from"/"to"; `side` -1 → an `into` point;
 * - voids `x/y/w/h` → `rect`; structs, furniture, MEP points `x/y` → `at`; line lights and pipes `pts`
 *   objects → pairs;
 * - cove strips (`auto: "cove:…"`) are left out: the designer derives them from the ceilings.
 * Comments, measures and prices have no spec form beyond what the loader rebuilds; `carryOver` puts
 * them back after a reload.
 *
 * The loader gives every piece of furniture a colour; with `defaults` (the designer's makeFurn) a colour
 * that is just the default is left out, as a hand-written spec would, so a top-level `style` still
 * restyles that piece ("没单独写风格、也没指定颜色的…全部按这一款建模").
 */
export type SpecExportOptions = { defaults?: (key: string) => { color?: unknown } | undefined };

type Xy = { x: number; y: number };
const pair = (point: Xy): Point => [point.x, point.y];
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
const pick = (source: Record<string, unknown>, keys: string[]) => defined(Object.fromEntries(keys.map(key => [key, source[key]])));
// A compass side whose cross product with the wall direction has the sign of `align`.
const SIDES: Array<[string, Xy]> = [['N', { x: 0, y: -1 }], ['S', { x: 0, y: 1 }], ['E', { x: 1, y: 0 }], ['W', { x: -1, y: 0 }]];

function singleToSpec(plan: SinglePlan, options: SpecExportOptions = {}): HouseSpec {
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const raw = plan as Record<string, unknown>;
  const walls = plan.walls.flatMap(wall => {
    const a = nodes.get(wall.a), b = nodes.get(wall.b);
    if (!a || !b) return [];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) return [];
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const horizontal = Math.abs(dir.y) < 0.001, vertical = Math.abs(dir.x) < 0.001;
    let flush = 'C';
    const align = Number(wall.align ?? 0);
    if (align) {
      let best: [string, number] | undefined;
      for (const [name, side] of SIDES) {
        const cross = dir.x * side.y - dir.y * side.x;
        if (Math.sign(cross) === Math.sign(align) && Math.abs(cross) > 0.5 && (!best || Math.abs(cross) > best[1])) best = [name, Math.abs(cross)];
      }
      if (best) flush = best[0];
    }
    const along = (distance: number) => horizontal ? a.x + dir.x * distance : vertical ? a.y + dir.y * distance : distance;
    const normal = { x: -dir.y, y: dir.x };
    const openings = plan.openings.filter(opening => opening.wall === wall.id).map(opening => {
      const half = opening.width / 2;
      const center = { x: a.x + dir.x * opening.pos, y: a.y + dir.y * opening.pos };
      return defined({
        type: opening.type,
        from: along(opening.pos - half),
        to: along(opening.pos + half),
        sill: opening.sill as number | undefined,
        head: opening.head as number | undefined,
        hinge: opening.hinge === 1 ? 'to' : 'from',
        into: opening.side === -1 ? [Math.round(center.x - normal.x * 600), Math.round(center.y - normal.y * 600)] as Point : undefined,
        entry: opening.entry ? true : undefined,
        name: opening.name as string | undefined,
        material: opening.material as string | undefined,
        fireRating: opening.fireRating as string | undefined,
      });
    });
    return [defined({
      a: pair(a), b: pair(b), t: wall.t,
      bearing: wall.bearing as boolean | undefined,
      status: wall.status as string | undefined,
      bearingFrom: wall.bearingFrom as string | undefined,
      flush,
      ...(openings.length ? { openings } : {}),
    })];
  });
  type Elec = Xy & { id: string; kind: string; rot?: number; h?: number; links?: string[]; pts?: Xy[]; loop?: boolean; cct?: number; w?: number; auto?: string };
  const elec = ((raw.elec ?? []) as Elec[])
    .filter(item => !String(item.auto ?? '').startsWith('cove:'))
    .map(item => defined({
      id: item.id, kind: item.kind, at: pair(item), rot: item.rot, h: item.h,
      links: item.links?.length ? item.links : undefined,
      pts: item.pts?.length ? item.pts.map(pair) : undefined,
      loop: item.loop ? true : undefined,
      cct: item.pts?.length ? item.cct : undefined,
      w: item.pts?.length ? item.w : undefined,
    }));
  type Mep = { power?: string; water?: string; floorStyle?: string; custom?: Array<{ id?: string; pts: Xy[]; [key: string]: unknown }> };
  const mep = raw.mep as Mep | undefined;
  const site = raw.site as { city?: string; lat?: number; month?: number } | undefined;
  type Comment = Xy & { text: string; author?: string };
  // The loader writes a comment for every wall whose bearing was inferred; those come back by themselves.
  const comments = ((raw.comments ?? []) as Comment[])
    .filter(item => item && typeof item.text === 'string' && !(item.author === '识图待确认' && item.text.startsWith('这面墙（厚')))
    .map(item => ({ at: pair(item), text: item.text }));
  return defined({
    name: plan.name,
    height: raw.height as number | undefined,
    phase: raw.phase as string | undefined,
    north: raw.north as number | undefined,
    site: site ? defined({ city: site.city || undefined, lat: site.lat, month: site.month }) : undefined,
    mep: mep ? defined({
      power: mep.power, water: mep.water, floorStyle: mep.floorStyle,
      custom: mep.custom?.length ? mep.custom.map(({ id: _id, pts, ...rest }) => ({ ...rest, pts: pts.map(pair) })) : undefined,
    }) : undefined,
    look: raw.look as Record<string, unknown> | undefined,
    walls,
    voids: ((raw.voids ?? []) as Array<Xy & { w: number; h: number; depth?: number; name?: string; shaft?: boolean }>).map(item => defined({
      rect: [item.x, item.y, item.x + item.w, item.y + item.h], depth: item.depth, name: item.name, shaft: item.shaft ? true : undefined,
    })),
    rooms: plan.rooms.map(room => defined({
      at: [room.x, room.y] as Point, name: room.name,
      ...pick(room, ['mat', 'wallMat', 'tile', 'skirting', 'ceil']),
    })),
    structs: ((raw.structs ?? []) as Array<Xy & { kind: string; w?: number; d?: number; rot?: number }>).map(item => defined({ kind: item.kind, at: pair(item), w: item.w, d: item.d, rot: item.rot })),
    beams: ((raw.beams ?? []) as Array<{ a: Xy; b: Xy; w?: number; depth?: number }>).map(item => defined({ a: pair(item.a), b: pair(item.b), w: item.w, depth: item.depth })),
    furniture: plan.furniture.map(item => {
      let color = item.color;
      if (color !== undefined && options.defaults) {
        try { if (options.defaults(item.key)?.color === color) color = undefined; } catch { /* unknown key: keep the colour */ }
      }
      return defined({
        key: item.key, at: [item.x, item.y] as Point, rot: item.rot as number | undefined,
        ...pick({ ...item, color }, ['w', 'd', 'h', 'z', 'name', 'color', 'price', 'brand', 'kit', 'opt', 'cab']),
      });
    }),
    elec,
    comments: comments.length ? comments : undefined,
  }) as HouseSpec;
}

/** The whole design as a HouseSpec; a building becomes `floors`. */
export function planToSpec(plan: InternalPlan, options: SpecExportOptions = {}): HouseSpec {
  if (!isBuilding(plan)) return singleToSpec(plan, options);
  const building = plan as BuildingPlan & { slab?: number; base?: number; grade?: number };
  const floors = building.floors.map(floor => {
    const { north: _north, site: _site, look: _look, name: _name, ...rest } = singleToSpec(floor.plan, options) as HouseSpec & Record<string, unknown>;
    return { name: String(floor.name ?? floor.plan.name), ...rest };
  });
  const first = floors.length ? singleToSpec(building.floors[0].plan) as HouseSpec & Record<string, unknown> : {} as Record<string, unknown>;
  const site = first.site || building.grade ? defined({ ...(first.site as object | undefined), grade: building.grade || undefined }) : undefined;
  return defined({
    name: building.name, cur: building.cur, slab: building.slab, base: building.base,
    north: first.north, site, look: first.look,
    floors,
  }) as unknown as HouseSpec;
}

/**
 * After a design is reloaded from its spec, put back what the spec cannot carry: the comment threads
 * (authors, replies, resolved), measures and prices. A floor keeps its own; a patch that rewrote the
 * comments keeps the reloaded ones.
 */
export function carryOver(before: InternalPlan, after: InternalPlan, options: { comments?: boolean } = {}): InternalPlan {
  const keep = (from: SinglePlan, to: SinglePlan): SinglePlan => {
    const source = from as Record<string, unknown>;
    return {
      ...to,
      ...(source.measures !== undefined ? { measures: structuredClone(source.measures) } : {}),
      ...(source.prices !== undefined ? { prices: structuredClone(source.prices) } : {}),
      ...(options.comments !== false && source.comments !== undefined ? { comments: structuredClone(source.comments) } : {}),
    };
  };
  if (isBuilding(before) && isBuilding(after)) {
    return { ...after, floors: after.floors.map((floor, index) => before.floors[index] ? { ...floor, plan: keep(before.floors[index].plan, floor.plan) } : floor) };
  }
  if (!isBuilding(before) && !isBuilding(after)) return keep(before, after);
  return after;
}
