import type { HouseSpec, Point, SinglePlan } from "@/workspaces/cad/lib/design/types";
import { layoutToSpec, parseCells, type Layout } from "@/workspaces/cad/lib/design/layout";
import { parsePartialJson } from "@/shared/lib/partial-json";

/*
 * The floor plan the model is still writing, as steps the designer can show
 * one after another while the pen draws each.
 *
 * The model writes a floor plan in one of two ways:
 *  - a HouseSpec: walls from point a to point b. Each wall is a step as soon
 *    as both its ends have arrived; the pen draws it from end to end.
 *  - a cad_layout: a grid (cols, rows) and the cells each room takes. Each
 *    room is a step as soon as its cells are written; the pen goes round the
 *    room, and the plan of the rooms so far (computed as the finished layout
 *    will be) is shown.
 * Doors, windows and furniture wait for the finished plan. Millimetres.
 */

export type PreviewStep = {
  /** What the pen draws, in plan millimetres. */
  outline: Point[];
  /** The plan once this step is in. */
  plan: SinglePlan;
};
export type StreamPreview = {
  steps: PreviewStep[];
  /** What to show once every step is in (the rooms' names, say). */
  full: SinglePlan;
};

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const POINT = String.raw`\[\s*${NUM}\s*,\s*${NUM}\s*\]`;
const WALL = new RegExp(String.raw`"a"\s*:\s*${POINT}\s*,\s*"b"\s*:\s*${POINT}(?:\s*,\s*"t"\s*:\s*${NUM})?`, "g");
const FLAT = /\{[^{}]*\}/g;
const AT = new RegExp(String.raw`"at"\s*:\s*${POINT}`);
const NAME = /"name"\s*:\s*"([^"]{1,24})"/;

/** A HouseSpec's walls and rooms as a plan for the designer. */
export function planFromSpec(spec: Pick<HouseSpec, "walls" | "rooms">): SinglePlan {
  const nodes: SinglePlan["nodes"] = [];
  const byPoint = new Map<string, string>();
  const node = (x: number, y: number) => {
    const key = `${x},${y}`;
    let id = byPoint.get(key);
    if (!id) {
      id = `n${nodes.length}`;
      byPoint.set(key, id);
      nodes.push({ id, x, y });
    }
    return id;
  };
  const walls: SinglePlan["walls"] = [];
  for (const wall of spec.walls) {
    const [ax, ay] = wall.a;
    const [bx, by] = wall.b;
    if (![ax, ay, bx, by].every(Number.isFinite) || (ax === bx && ay === by)) continue;
    walls.push({ id: `w${walls.length}`, a: node(ax, ay), b: node(bx, by), t: Number.isFinite(wall.t) && wall.t > 0 ? wall.t : 120 });
  }
  const rooms = (spec.rooms ?? []).map((room, index) => ({ id: `r${index}`, x: room.at[0], y: room.at[1], name: room.name }));
  return { version: 2, name: "", nodes, walls, openings: [], rooms, furniture: [] };
}

/** The walls and rooms written so far of a HouseSpec; null while there is no wall yet. */
export function planFromCadText(text: string): SinglePlan | null {
  const walls: HouseSpec["walls"] = [];
  for (const m of text.matchAll(WALL)) {
    const [ax, ay, bx, by] = [m[1], m[2], m[3], m[4]].map(Number);
    walls.push({ a: [ax, ay], b: [bx, by], t: Number(m[5]) });
  }
  if (!walls.length) return null;
  const rooms: NonNullable<HouseSpec["rooms"]> = [];
  for (const m of text.matchAll(FLAT)) {
    const body = m[0];
    if (/"key"\s*:/.test(body)) continue; // furniture
    const at = AT.exec(body);
    const name = NAME.exec(body);
    if (at && name) rooms.push({ at: [Number(at[1]), Number(at[2])], name: name[1] });
  }
  const plan = planFromSpec({ walls, rooms });
  return plan.walls.length ? plan : null;
}

/** The first `count` walls of a plan, with their corners; the rooms only once every wall is in. */
export function planPrefix(plan: SinglePlan, count: number): SinglePlan {
  const walls = plan.walls.slice(0, count);
  const used = new Set(walls.flatMap((wall) => [wall.a, wall.b]));
  return { ...plan, walls, nodes: plan.nodes.filter((node) => used.has(node.id)), rooms: count >= plan.walls.length ? plan.rooms : [] };
}

/** The rooms of a cad_layout whose cells are written in full. */
function layoutSoFar(text: string): { layout: Layout; rooms: Layout["rooms"] } | null {
  const at = text.indexOf('"rooms"');
  if (at < 0) return null;
  const parsed = parsePartialJson(text);
  const layout: Layout | undefined = parsed?.layout ?? parsed;
  if (!layout || !Array.isArray(layout.cols) || !Array.isArray(layout.rows) || !Array.isArray(layout.rooms)) return null;
  // A room counts once its cells string is closed: "A1:B" may still become "A1:B2".
  const written = [...text.slice(at).matchAll(/"cells"\s*:\s*"[^"]*"/g)].length;
  const rooms = layout.rooms.slice(0, written).filter((room) => room && typeof room.name === "string" && room.name && typeof room.cells === "string");
  return rooms.length ? { layout, rooms } : null;
}

function layoutPreview(text: string): StreamPreview | null {
  const found = layoutSoFar(text);
  if (!found) return null;
  const { layout, rooms } = found;
  const cols = layout.cols.map(Number);
  const rows = layout.rows.map(Number);
  if (![...cols, ...rows].every((value) => Number.isFinite(value) && value >= 600 && value <= 20000)) return null;
  const X = [0];
  const Y = [0];
  for (const value of cols) X.push(X[X.length - 1] + value);
  for (const value of rows) Y.push(Y[Y.length - 1] + value);
  const steps: PreviewStep[] = [];
  for (let i = 0; i < rooms.length; i++) {
    let ranges: Array<[number, number, number, number]>;
    let spec: HouseSpec;
    try {
      ranges = parseCells(rooms[i].cells, cols.length, rows.length);
      // Only the grid and the rooms: doors, windows and furniture come with the finished layout.
      spec = layoutToSpec({ cols, rows, rooms: rooms.slice(0, i + 1) }).spec;
    } catch {
      break;
    }
    // Round each of the room's rectangles.
    const outline: Point[] = ranges.flatMap(([c0, r0, c1, r1]) => [
      [X[c0], Y[r0]], [X[c1 + 1], Y[r0]], [X[c1 + 1], Y[r1 + 1]], [X[c0], Y[r1 + 1]], [X[c0], Y[r0]],
    ] as Point[]);
    steps.push({ outline, plan: planFromSpec(spec) });
  }
  return steps.length ? { steps, full: steps[steps.length - 1].plan } : null;
}

/** The floor plan written so far, as steps; null while there is nothing to draw. */
export function previewFromCadText(text: string): StreamPreview | null {
  const plan = planFromCadText(text);
  if (plan) {
    const ends = (id: string) => plan.nodes.find((node) => node.id === id)!;
    return {
      steps: plan.walls.map((wall, i) => ({ outline: [[ends(wall.a).x, ends(wall.a).y], [ends(wall.b).x, ends(wall.b).y]] as Point[], plan: planPrefix(plan, i + 1) })),
      full: plan,
    };
  }
  return layoutPreview(text);
}
