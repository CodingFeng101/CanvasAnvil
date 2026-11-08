import type { HouseSpec } from './types';

export function autofixSpec<T extends HouseSpec>(spec: T): T {
  const fixed = structuredClone(spec);
  const roundPoint = (point: number[]) => point.map(value => Math.round(value * 2) / 2) as [number, number];
  for (const wall of fixed.walls) {
    wall.a = roundPoint(wall.a);
    wall.b = roundPoint(wall.b);
    for (const opening of wall.openings ?? []) {
      opening.from = Math.round(opening.from * 2) / 2;
      opening.to = Math.round(opening.to * 2) / 2;
      if (Array.isArray(opening.into)) opening.into = roundPoint(opening.into);
      if (opening.from > opening.to) [opening.from, opening.to] = [opening.to, opening.from];
    }
  }
  for (const key of ['rooms', 'furniture', 'structs', 'elec'] as const) {
    const items = fixed[key] as Array<{ at?: [number, number] }> | undefined;
    for (const item of items ?? []) if (item.at) item.at = roundPoint(item.at);
  }
  // Models often write "ceil": "edge"; the designer expects an object and would spread the string.
  for (const room of (fixed.rooms ?? []) as Array<{ ceil?: unknown }>) {
    if (typeof room.ceil === 'string') room.ceil = { type: room.ceil };
  }
  const beams = fixed.beams as Array<{ a: [number, number]; b: [number, number] }> | undefined;
  for (const beam of beams ?? []) { beam.a = roundPoint(beam.a); beam.b = roundPoint(beam.b); }
  return fixed;
}
