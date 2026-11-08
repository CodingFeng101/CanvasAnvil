/**
 * Room-by-room MEP audit against common home-renovation practice: lights, switches, sockets, which
 * switch controls which light, mounting heights, switches beside doors, and each room type's
 * standard points. The same rules as the designer's MEP audit script (MIT, see
 * public/vendor/house-designer/LICENSE), so the app and the skill agree; the designer's own checks do not look at any of this.
 *
 * Reads the designer's runtime (window.__designer: the room grid, wall geometry with openings, the
 * plan's MEP points and furniture), so it runs inside the designer page.
 */

// The designer is a minified bundle with no types; this reads its runtime structures as they are.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runtime = any;
type Point = { x: number; y: number };

export type ElecAuditRoom = { name: string; kind: string; area: number; lights: number; switches: number; sockets: number };
export type ElecAudit = {
  /** Must be fixed: each line is "房间：问题". */
  problems: string[];
  /** Worth mentioning, not wrong in itself (no AC socket, a second door without a switch, ...). */
  notes: string[];
  rooms: ElecAuditRoom[];
  total: { points: number; lights: number; switches: number };
};

const LIGHT = ['light', 'pendant', 'downlight', 'spot', 'wallLamp', 'strip', 'track', 'linear'];
const SWITCH = ['switch1', 'switch2', 'switch3', 'dimmer'];
const SOCKET = ['socket', 'socketUSB', 'socketW', 'socket16', 'socketAC', 'socketHood', 'socketFloor', 'socketEV'];
const DOOR = ['door', 'double', 'unequal', 'sliding', 'folding', 'pocket', 'hole'];

function roomKind(name: string) {
  if (/卫|浴|厕|马桶|淋浴/.test(name)) return 'bath';
  if (/备餐|西厨|水吧/.test(name)) return 'pantry';
  if (/厨/.test(name) && !/过道|走廊|通道/.test(name)) return 'kitchen';
  if (/主卧|次卧|卧室|客卧|老人房|儿童房|保姆房|卧/.test(name)) return 'bed';
  if (/客厅|起居/.test(name)) return 'living';
  if (/餐/.test(name)) return 'dining';
  if (/书房|茶室|工作/.test(name)) return 'study';
  if (/阳台|露台|庭院|花园/.test(name)) return 'balcony';
  if (/玄关|门厅|走廊|过道|过厅/.test(name)) return 'hall';
  if (/衣帽|储藏|储物|杂物/.test(name)) return 'store';
  if (/井|空调位|设备/.test(name)) return 'skip';
  return 'other';
}

export function auditElec(designer: Runtime): ElecAudit {
  const app = designer.app;
  const plan = app.plan;
  const grid = app.rooms;
  const elec: Runtime[] = plan.elec ?? [];
  const furniture: Runtime[] = plan.furniture ?? [];
  const regionAt = (point: Point) => {
    const i = Math.floor((point.x - grid.x0) / grid.c), j = Math.floor((point.y - grid.y0) / grid.c);
    if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return null;
    const index = grid.grid[j * grid.cols + i];
    return grid.regions.find((region: Runtime) => region.idx === index) || null;
  };
  // A switch just outside the door (bathrooms, balconies) still counts for the room.
  const near = (point: Point, region: Runtime) => {
    if (regionAt(point) === region) return true;
    return [[150, 0], [-150, 0], [0, 150], [0, -150]].some(([dx, dy]) => regionAt({ x: point.x + dx, y: point.y + dy }) === region);
  };
  const linkedBy = (id: string) => elec.filter(item => SWITCH.includes(item.kind) && item.links?.includes(id));
  const at = (point: Point) => `（${Math.round(point.x)}, ${Math.round(point.y)}）`;
  const doors: Array<{ g: Runtime; q: Runtime }> = [];
  for (const g of app.geo.active ?? []) for (const q of g.ops ?? []) if (DOOR.includes(q.o.type)) doors.push({ g, q });

  const problems: string[] = [];
  const notes: string[] = [];
  const rooms: ElecAuditRoom[] = [];
  for (const region of grid.regions) {
    if (region.area < 1.5 || !region.labels.length) continue;
    const name = region.labels.map((label: Runtime) => label.name).join(' + ') || '（未命名）';
    const kind = region.labels.map((label: Runtime) => roomKind(label.name)).find((value: string) => value !== 'other') || 'other';
    if (kind === 'skip') continue;
    const inside = elec.filter(item => regionAt(item) === region);
    const lights = inside.filter(item => LIGHT.includes(item.kind));
    const lightIds = new Set(lights.map(light => light.id));
    const switches = elec.filter(item => SWITCH.includes(item.kind) && (near(item, region) || item.links?.some((id: string) => lightIds.has(id))));
    const sockets = inside.filter(item => SOCKET.includes(item.kind));
    const has = (kinds: string[]) => inside.some(item => kinds.includes(item.kind));
    const count = (kinds: string[]) => inside.filter(item => kinds.includes(item.kind)).length;
    const roomFurniture = furniture.filter(item => regionAt(item) === region);
    const add = (message: string) => problems.push(`${name}：${message}`);
    const note = (message: string) => notes.push(`${name}：${message}`);
    rooms.push({ name, kind, area: +region.area.toFixed(1), lights: lights.length, switches: switches.length, sockets: sockets.length });

    if ((kind !== 'store' || region.area >= 3) && !lights.length) add('没有灯');
    for (const light of lights) if (!linkedBy(light.id).length) add(`${light.kind === 'strip' ? '灯带' : '灯'}${at(light)}没有开关控制`);
    if (lights.length && !switches.length) add('有灯但房间里 / 门口没有开关');
    // A switch controls lights in its own or the next room, not half the flat away.
    for (const sw of switches) for (const id of sw.links || []) {
      const light = elec.find(item => item.id === id);
      const distance = light ? Math.hypot(light.x - sw.x, light.y - sw.y) : 0;
      if (light && regionAt(light) !== regionAt(sw) && !near(sw, regionAt(light)) && distance > 8000) add(`开关${at(sw)}控制的灯离它 ${(distance / 1000).toFixed(1)}m，跨房间太远`);
    }
    for (const sw of switches) if (!(sw.links || []).length) add(`开关${at(sw)}没关联任何灯`);
    // Mounting heights (GB 50327 and common practice).
    for (const item of inside) {
      if (SWITCH.includes(item.kind) && (item.h < 1100 || item.h > 1450) && !(kind === 'bed' && item.h >= 650 && item.h <= 1000)) add(`开关离地 ${item.h}（常规 1300，床头双控 700~900）`);
      if (['socket', 'socketUSB'].includes(item.kind) && item.h > 0 && item.h < 200) add(`插座离地 ${item.h}，低于 200（易受潮、踢到）`);
      if (kind === 'bath' && ['socket', 'socketUSB'].includes(item.kind)) add(`卫生间用了非防水插座（${item.kind}），应换防水 / 带防溅盒`);
      if (kind === 'bath' && item.kind === 'socket16') note('16A 插座（热水器）在卫生间，要加防溅盒、装在 1.8m 以上');
      if (item.kind === 'socketAC' && (item.h < 1800 || item.h > 2400)) add(`挂机空调插座离地 ${item.h}（常规 2000~2200）`);
    }
    // Door switches: on the handle side, within 600 of the frame, not behind the open leaf.
    const myDoors = doors.filter(({ g, q }) => {
      const mid = q.s0 + (q.s1 - q.s0) / 2;
      return [1, -1].some(side => regionAt({ x: g.a.x + g.u.x * mid + g.n.x * side * (g.ht + 200), y: g.a.y + g.u.y * mid + g.n.y * side * (g.ht + 200) }) === region);
    });
    if (lights.length && myDoors.length && switches.length) {
      for (const { g, q } of myDoors) {
        const byDoor = switches.filter(sw => {
          const dx = sw.x - g.a.x, dy = sw.y - g.a.y, along = dx * g.u.x + dy * g.u.y, off = Math.abs(dx * g.n.x + dy * g.n.y);
          return off < 600 && along > q.s0 - 700 && along < q.s1 + 700;
        });
        if (!byDoor.length) {
          const real = myDoors.filter(door => door.q.o.type !== 'hole');
          // The entry door and a room's only door need a switch beside them; with more doors the main one is enough.
          if (q.o.entry || (real.length === 1 && q.o.type !== 'hole' && ['bed', 'study', 'kitchen', 'hall', 'living', 'dining', 'other'].includes(kind))) add(`${q.o.entry ? '入户门' : '门'}旁 700mm 内没有开关（进门顺手开不了灯）`);
          else if (q.o.type !== 'hole' && myDoors.length <= 2) note(`门（${q.o.type}）旁 700mm 内没有开关`);
          continue;
        }
        if (['door', 'unequal'].includes(q.o.type)) for (const sw of byDoor) {
          const dx = sw.x - g.a.x, dy = sw.y - g.a.y, along = dx * g.u.x + dy * g.u.y;
          const hingeAt = q.o.hinge ? q.s1 : q.s0;
          const onHinge = Math.abs(along - hingeAt) < Math.abs(along - (q.o.hinge ? q.s0 : q.s1));
          const side = Math.sign(dx * g.n.x + dy * g.n.y);
          const onWall = along > g.endA - 20 && along < g.len - g.endB + 20;
          const leaf = (along - hingeAt) * (q.o.hinge ? 1 : -1);
          if (onWall && onHinge && side === q.o.side && leaf < q.s1 - q.s0 + 150) add('开关在门轴一侧、门扇打开时被挡住（应在门把手一侧，离门框 150~200）');
        }
      }
    }
    // Standard points per room type.
    if (kind === 'bed') {
      const bed = roomFurniture.find(item => /bed/i.test(item.type) && item.type !== 'bedBench');
      const double = !!bed && bed.w >= 1350;
      if (!elec.some(item => item.kind === 'switch2' && regionAt(item) === region)) (double && region.area >= 8 ? add : note)('卧室没有双控（门口 + 床头）');
      if (bed && elec.filter(item => SOCKET.includes(item.kind) && regionAt(item) === region && Math.hypot(item.x - bed.x, item.y - bed.y) < Math.max(bed.w, bed.d) * 0.9).length < (double ? 2 : 1)) add(double ? '双人床两侧插座不足 2 个' : '床边没有插座');
      if (!has(['socketAC', 'socket16'])) note('没有空调插座（不装空调 / 中央空调可忽略）');
    }
    if (kind === 'living') {
      if (count(['tv']) < 1 && !roomFurniture.some(item => /wallTV|tvCabinet|projScreen/.test(item.type))) note('没有电视位');
      if (count(SOCKET) < 4) add(`插座只有 ${count(SOCKET)} 个（客厅常规 ≥ 6：电视墙 4 + 沙发两侧）`);
    }
    if (kind === 'kitchen') {
      if (!has(['socketHood'])) add('没有烟机插座');
      if (!has(['smoke'])) add('没有燃气 / 烟雾报警');
      const counter = count(['socket', 'socketW', 'socket16', 'socketUSB']);
      if (counter < 3) add(`台面 + 冰箱插座只有 ${counter} 个（常规 ≥ 4）`);
    }
    if (kind === 'pantry' && count(SOCKET) < 2) add(`备餐间插座只有 ${count(SOCKET)} 个（台面电器至少 2 个）`);
    if (kind === 'bath') {
      if (!has(['socketW'])) add('没有防水插座（吹风机、智能马桶）');
      if (roomFurniture.some(item => item.type === 'toilet') && !has(['cold'])) add('马桶没有冷水点');
    }
    if (kind === 'balcony' && roomFurniture.some(item => item.type === 'washer') && !has(['socketW'])) add('洗衣机旁没有防水插座');
  }
  if (!elec.some(item => item.kind === 'panel')) problems.push('全屋：没有强电箱');
  if (!elec.some(item => item.kind === 'weak')) problems.push('全屋：没有弱电箱');
  for (const strip of elec.filter(item => item.pts?.length)) if (!linkedBy(strip.id).length) problems.push(`灯带 / 轨道${at(strip)}没有开关控制`);
  return {
    problems: [...new Set(problems)],
    notes: [...new Set(notes)],
    rooms,
    total: { points: elec.length, lights: elec.filter(item => LIGHT.includes(item.kind)).length, switches: elec.filter(item => SWITCH.includes(item.kind)).length },
  };
}
