import type { DesignIssue, HouseSpec, Point } from './types';
import { isValidKey, suggestKeys } from './catalog';
import { OPENING_TYPES, isOpeningType } from './opening-types';
import { distance, segmentDistance, enclosedRegions, pointInPolygon } from './geometry';

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every(finite);

export function validateSpec(input: unknown): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (code: string, path: string, message: string, level: DesignIssue['level'] = 'error') => issues.push({ level, code, path, msg: `${path} ${message}` });
  if (!isObject(input) || !Array.isArray(input.walls) || !input.walls.length) {
    add('schema', 'walls', '必须提供非空墙数组，每面墙填写 a、b 坐标和正数厚度 t');
    return issues;
  }
  if (input.name !== undefined && typeof input.name !== 'string') add('schema', 'name', '改为字符串');
  if (input.height !== undefined && (!finite(input.height) || input.height <= 0)) add('schema', 'height', '填写正数层高，单位 mm');
  for (const [index, wall] of input.walls.entries()) {
    const path = `walls[${index}]`;
    if (!isObject(wall) || !point(wall.a) || !point(wall.b) || !finite(wall.t) || wall.t <= 0 || distance(wall.a, wall.b) === 0) {
      add('schema', path, 'a/b 必须是两个有限数字的坐标，端点不能重合，t 必须大于 0');
      continue;
    }
    if (wall.openings !== undefined && !Array.isArray(wall.openings)) add('schema', path + '.openings', '改为洞口数组');
    for (const [oi, opening] of (Array.isArray(wall.openings) ? wall.openings : []).entries()) {
      if (!isObject(opening) || !isOpeningType(opening.type) || !finite(opening.from) || !finite(opening.to) || (opening.into !== undefined && !point(opening.into))) add('schema', `${path}.openings[${oi}]`, `type 可选 ${OPENING_TYPES.join('、')}，填写有限数字 from/to，以及有效的 into 两元坐标（如有）`);
    }
  }
  for (const key of ['rooms', 'furniture'] as const) {
    if (input[key] !== undefined && !Array.isArray(input[key])) add('schema', key, '改为数组');
    for (const [index, item] of (Array.isArray(input[key]) ? input[key] : []).entries()) {
      if (!isObject(item) || !point(item.at) || typeof item[key === 'rooms' ? 'name' : 'key'] !== 'string') add('schema', `${key}[${index}]`, '填写 at 两元坐标和名称/key 字符串');
    }
  }
  for (const key of ['structs', 'elec', 'beams'] as const) {
    if (input[key] !== undefined && !Array.isArray(input[key])) add('schema', key, '改为数组');
    const items = Array.isArray(input[key]) ? input[key] : [];
    for (const [index, item] of items.entries()) {
      const valid = isObject(item) && (key === 'beams'
        ? point(item.a) && point(item.b)
        : typeof item.kind === 'string' && (point(item.at)
          // Line fixtures (strip / track / linear) are drawn along pts instead of standing at one point.
          || (key === 'elec' && Array.isArray(item.pts) && item.pts.length >= 2 && item.pts.every(point))));
      if (!valid) add('schema', `${key}[${index}]`, key === 'beams' ? '填写 a/b 两元数字坐标' : key === 'elec' ? '填写 kind 字符串和 at 两元数字坐标（灯带 / 轨道 / 线性灯写 pts 点列）' : '填写 kind 字符串和 at 两元数字坐标');
    }
  }
  if (issues.length) return issues;
  const spec = input as unknown as HouseSpec;
  const xs = spec.walls.flatMap(wall => [wall.a[0], wall.b[0]]);
  const ys = spec.walls.flatMap(wall => [wall.a[1], wall.b[1]]);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (extent < 2000 || extent > 200000) add('unit', 'walls', `包围盒最大边 ${extent}，请把坐标统一为 mm，住宅轮廓应在 2000–200000mm 内`);
  spec.walls.forEach((wall, wi) => {
    const path = `walls[${wi}]`;
    for (const end of ['a', 'b'] as const) {
      if (!spec.walls.some((other, i) => i !== wi && segmentDistance(wall[end], other.a, other.b) <= 40)) add('free_end', `${path}.${end}`, `端点 ${wall[end]} 悬空，请将端点连接到另一面墙的端点或中线（距离 ≤40mm）`);
    }
    const length = distance(wall.a, wall.b);
    const ux = (wall.b[0] - wall.a[0]) / length, uy = (wall.b[1] - wall.a[1]) / length;
    const horizontal = Math.abs(uy) < 0.001;
    const vertical = Math.abs(ux) < 0.001;
    const origin = horizontal ? Math.min(wall.a[0], wall.b[0]) : vertical ? Math.min(wall.a[1], wall.b[1]) : 0;
    const ranges = (wall.openings ?? []).map((opening, oi) => {
      const alongWall = (value: number) => horizontal ? (value - wall.a[0]) * Math.sign(ux) : vertical ? (value - wall.a[1]) * Math.sign(uy) : value;
      const start = alongWall(opening.from), end = alongWall(opening.to);
      const from = Math.min(start, end), to = Math.max(start, end);
      const openingPath = `${path}.openings[${oi}]`;
      if (!(opening.from < opening.to && from > 0 && from < to && to < length)) {
        const over = Math.max(0, to - length, -from);
        add('opening_range', openingPath, `${opening.type} from=${opening.from} to=${opening.to} 换算沿墙距离 ${from}–${to}，墙长 ${Math.round(length)}，越界 ${Math.round(over)}mm；请满足 ${origin} < from < to < ${origin + length}（建议两端至少留 50mm）`);
      }
      return { from, to, path: openingPath };
    });
    ranges.forEach((range, i) => {
      for (const other of ranges.slice(0, i)) if (Math.max(range.from, other.from) < Math.min(range.to, other.to)) add('opening_overlap', range.path, `与 ${other.path} 重叠，请移动洞口，确保两者区间不重叠`);
    });
  });
  (spec.furniture ?? []).forEach((item, i) => {
    if (!isValidKey(item.key)) add('furniture_key', `furniture[${i}].key`, `家具库没有 ${item.key}，请从候选 ${suggestKeys(item.key).join('、')} 中选择匹配项`);
    if (item.rot !== undefined && !finite(item.rot)) add('rot', `furniture[${i}].rot`, '改为有限数字角度，如 0、90、180 或 270');
  });
  const regions = enclosedRegions(spec.walls);
  (spec.rooms ?? []).forEach((room, i) => {
    if (!regions.some(region => pointInPolygon(room.at, region))) add('room_label_outside', `rooms[${i}].at`, `${room.name} 标签在围合区域外，请将标签点移入墙体围合区域`, 'warn');
  });
  return issues;
}
