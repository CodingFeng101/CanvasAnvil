import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateSpec } from '../client/workspaces/cad/lib/design/spec-validate';
import { autofixSpec } from '../client/workspaces/cad/lib/design/spec-autofix';
import { applyOps } from '../client/workspaces/cad/lib/design/plan-ops';
import { summarizePlan } from '../client/workspaces/cad/lib/design/plan-summary';
import { reviseUntilClean } from '../client/workspaces/cad/lib/design/revise-loop';
import { isValidKey, suggestKeys, catalogPromptTable } from '../client/workspaces/cad/lib/design/catalog';
import fixture from './fixtures/hpd/example-plan.json';
import type { SinglePlan, CadDesign, DesignIssue, HouseSpec } from '../client/workspaces/cad/lib/design/types';

const rectangle = (): HouseSpec => ({ name: 'Test', walls: [
  { a: [1000, 1000], b: [6000, 1000], t: 200, openings: [{ type: 'door', from: 2000, to: 2900 }] },
  { a: [6000, 1000], b: [6000, 5000], t: 200 },
  { a: [6000, 5000], b: [1000, 5000], t: 200 },
  { a: [1000, 5000], b: [1000, 1000], t: 200 },
], rooms: [{ at: [3000, 3000], name: 'Bedroom' }], furniture: [{ key: 'bed18', at: [3000, 3000], rot: 0 }] });
const codes = (spec: unknown) => validateSpec(spec).map(issue => issue.code);

test('catalog uses runtime keys and offers useful suggestions', () => {
  assert.ok(isValidKey('bed18'));
  assert.ok(!isValidKey('__proto__'));
  assert.ok(suggestKeys('bed99').some(key => key.startsWith('bed')));
  assert.equal(suggestKeys('missing').length, 3);
  assert.ok(catalogPromptTable().includes('bed18'));
});

test('valid world-coordinate spec passes all validation rules', () => {
  assert.deepEqual(validateSpec(rectangle()), []);
});
for (const [code, mutate] of [
  ['schema', (s: any) => { s.walls[0].a = [1]; }],
  ['schema', (s: any) => { s.walls[0].t = 0; }],
  ['unit', (s: any) => { for (const w of s.walls) { w.a = w.a.map((v: number) => v / 1000); w.b = w.b.map((v: number) => v / 1000); } }],
  ['free_end', (s: any) => { s.walls.pop(); }],
  ['opening_range', (s: any) => { s.walls[0].openings[0].to = 6500; }],
  ['opening_overlap', (s: any) => { s.walls[0].openings.push({ type: 'window', from: 2500, to: 3500 }); }],
  ['furniture_key', (s: any) => { s.furniture[0].key = 'bed99'; }],
  ['room_label_outside', (s: any) => { s.rooms[0].at = [10000, 10000]; }],
  ['rot', (s: any) => { s.furniture[0].rot = '90'; }],
] as const) {
  test(`validation rejects ${code}`, () => {
    const spec = rectangle();
    mutate(spec);
    assert.ok(codes(spec).includes(code));
    assert.ok(!codes(rectangle()).includes(code));
  });
}

test('autofix only swaps openings and rounds coordinates without mutating input', () => {
  const spec = rectangle();
  spec.walls[0].a[0] = 1000.24;
  spec.walls[0].openings![0] = { type: 'door', from: 6500, to: 2000 };
  const copy = structuredClone(spec);
  const fixed = autofixSpec(spec);
  assert.deepEqual(spec, copy);
  assert.equal(fixed.walls[0].a[0], 1000);
  assert.equal(fixed.walls[0].openings![0].to, 6500);
  assert.equal(fixed.walls[0].openings![0].from, 2000);
});

const plan = fixture as SinglePlan;
const ctx = { isValidKey, makeFurn: (key: string, x: number, y: number, rot: number) => ({ id: 'made-furn', key, type: 'bed', name: key, x, y, rot, w: 1800, d: 2100, h: 1000, color: '#fff' }) };

test('operations reject invalid identifiers and dimensions without mutating the plan', () => {
  const before = structuredClone(plan);
  const result = applyOps(plan, [{ op: 'move_furniture', id: 'missing', x: 1 }, { op: 'add_furniture', key: 'missing', x: 0, y: 0 }, { op: 'resize_furniture', id: plan.furniture[0].id, w: 0 }], ctx);
  assert.equal(result.applied, 0);
  assert.equal(result.rejected.length, 3);
  assert.deepEqual(result.plan, before);
  assert.deepEqual(plan, before);
});

test('summary is compact and deterministic', () => {
  const summary = summarizePlan(plan, [], []);
  assert.ok(summary.length <= 12000);
  assert.equal(summary, summarizePlan(plan, [], []));
  assert.equal(JSON.parse(summary).walls.length, plan.walls.length);
});

const initial: CadDesign = { plan, revision: 0, lastSource: 'ai', status: 'draft', updatedAt: 0 };
const issues = (count: number): DesignIssue[] => Array.from({ length: count }, () => ({ level: 'error', code: 'test', msg: 'test', room: 'Bedroom' }));
test('revision loop rolls back when errors do not decrease', async () => {
  const applied: CadDesign[] = [];
  const result = await reviseUntilClean({ initial, issuesOf: async d => issues(d.name === 'worse' ? 3 : 2), askModel: async () => [], apply: async () => { const d = { ...initial, plan: { ...plan, name: 'worse' }, revision: 1 }; applied.push(d); return d; } });
  assert.ok(result.rolledBack);
  assert.deepEqual(result.design, initial);
});

const operationCases: Array<{ name: string; op: import('../client/workspaces/cad/lib/design/plan-ops').PlanOp; changed: string[]; check(result: SinglePlan): void }> = [
  { name: 'add_furniture', op: { op: 'add_furniture', key: 'bed18', x: 100, y: 200, w: 1200 }, changed: [], check: p => { assert.equal(p.furniture.at(-1)!.w, 1200); assert.equal(p.furniture.length, plan.furniture.length + 1); } },
  { name: 'move_furniture', op: { op: 'move_furniture', id: plan.furniture[0].id, x: 500, y: 600, rot: 90 }, changed: [plan.furniture[0].id], check: p => assert.equal(p.furniture[0].x, 500) },
  { name: 'resize_furniture', op: { op: 'resize_furniture', id: plan.furniture[0].id, w: 1200, d: 1900, h: 800 }, changed: [plan.furniture[0].id], check: p => assert.equal(p.furniture[0].w, 1200) },
  { name: 'replace_furniture', op: { op: 'replace_furniture', id: plan.furniture[0].id, key: 'bed15' }, changed: [plan.furniture[0].id], check: p => { assert.equal(p.furniture[0].key, 'bed15'); assert.equal(p.furniture[0].rot, plan.furniture[0].rot); assert.equal(p.furniture[0].x, plan.furniture[0].x); } },
  { name: 'remove furniture', op: { op: 'remove', id: plan.furniture[0].id }, changed: [plan.furniture[0].id], check: p => assert.ok(!p.furniture.some(f => f.id === plan.furniture[0].id)) },
  { name: 'remove opening', op: { op: 'remove', id: plan.openings[0].id }, changed: [plan.openings[0].id], check: p => assert.equal(p.openings.length, plan.openings.length - 1) },
  { name: 'remove wall', op: { op: 'remove', id: plan.openings[0].wall }, changed: [plan.openings[0].wall, ...plan.openings.filter(o => o.wall === plan.openings[0].wall).map(o => o.id), ...plan.nodes.filter(n => !plan.walls.some(w => w.id !== plan.openings[0].wall && (w.a === n.id || w.b === n.id))).map(n => n.id)], check: p => { assert.ok(!p.openings.some(o => o.wall === plan.openings[0].wall)); assert.ok(p.nodes.every(n => p.walls.some(w => w.a === n.id || w.b === n.id))); } },
  { name: 'add_opening', op: { op: 'add_opening', wall: plan.walls[0].id, type: 'window', pos: 400, width: 200, sill: 900 }, changed: [], check: p => { assert.equal(p.openings.at(-1)!.width, 200); assert.equal(p.openings.length, plan.openings.length + 1); } },
  { name: 'update_opening', op: { op: 'update_opening', id: plan.openings[0].id, width: 900, pos: 900, hinge: 1, head: 2400, sill: 0, type: 'door' }, changed: [plan.openings[0].id], check: p => assert.equal(p.openings[0].width, 900) },
  { name: 'add_wall', op: { op: 'add_wall', a: [plan.nodes[0].x + 10, plan.nodes[0].y], b: [19000, 19000], t: 120 }, changed: [], check: p => { assert.equal(p.nodes.length, plan.nodes.length + 1); assert.equal(p.walls.at(-1)!.a, plan.nodes[0].id); assert.equal(p.walls.at(-1)!.status, 'new'); } },
  { name: 'move_node', op: { op: 'move_node', id: plan.nodes[0].id, x: plan.nodes[0].x + 5, y: plan.nodes[0].y }, changed: [plan.nodes[0].id], check: p => assert.equal(p.nodes[0].x, plan.nodes[0].x + 5) },
  { name: 'update_wall', op: { op: 'update_wall', id: plan.walls[0].id, t: 180, bearing: false, status: 'new' }, changed: [plan.walls[0].id], check: p => assert.equal(p.walls[0].t, 180) },
  { name: 'set_room', op: { op: 'set_room', at: [plan.rooms[0].x, plan.rooms[0].y], name: 'Updated room' }, changed: [plan.rooms[0].id], check: p => assert.equal(p.rooms[0].name, 'Updated room') },
  { name: 'set_plan', op: { op: 'set_plan', name: 'Updated plan', height: 3000 }, changed: [], check: p => { assert.equal(p.name, 'Updated plan'); assert.equal(p.height, 3000); } },
];
for (const entry of operationCases) {
  test(`applyOps ${entry.name} preserves unrelated objects`, () => {
    const before = structuredClone(plan);
    const result = applyOps(plan, [entry.op], ctx);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.applied, 1);
    const next = result.plan as SinglePlan;
    entry.check(next);
    for (const category of ['nodes', 'walls', 'openings', 'furniture', 'rooms'] as const) {
      for (const object of before[category]) {
        if (!entry.changed.includes(object.id)) assert.deepEqual(next[category].find(item => item.id === object.id), object);
      }
    }
    for (const key of Object.keys(before).filter(key => !['nodes', 'walls', 'openings', 'furniture', 'rooms', 'name', 'height'].includes(key))) assert.deepEqual(next[key], before[key]);
    assert.deepEqual(plan, before);
  });
}

test('operations are atomic individually and preserve earlier accepted operations', () => {
  const result = applyOps(plan, [
    { op: 'set_plan', name: 'Accepted' },
    { op: 'add_wall', a: [25000, 25000], b: [25010, 25000], t: 120 },
    { op: 'add_opening', wall: plan.walls[0].id, type: 'door', pos: 1, width: 1000 },
    { op: 'update_opening', id: plan.openings[0].id, width: -1 },
    { op: 'move_furniture', id: plan.furniture[0].id, x: NaN },
  ], ctx);
  assert.equal(result.applied, 1);
  assert.equal(result.rejected.length, 4);
  assert.deepEqual(result.plan, { ...plan, name: 'Accepted' });
});

test('vertical, reversed and diagonal openings follow upstream coordinates', () => {
  const spec = rectangle();
  spec.walls[0].a = [6000, 1000]; spec.walls[0].b = [1000, 1000];
  spec.walls[1].openings = [{ type: 'door', from: 2000, to: 2800 }];
  assert.deepEqual(validateSpec(spec), []);
  spec.walls[1].openings[0].to = 5100;
  assert.ok(codes(spec).includes('opening_range'));
  const diagonal: HouseSpec = { walls: [
    { a: [1000, 1000], b: [4000, 5000], t: 120, openings: [{ type: 'door', from: 100, to: 1000 }] },
    { a: [4000, 5000], b: [6000, 1000], t: 120 },
    { a: [6000, 1000], b: [1000, 1000], t: 120 },
  ] };
  assert.deepEqual(validateSpec(diagonal), []);
});

test('labels in partitioned rooms and T junctions are valid', () => {
  const spec = rectangle();
  spec.walls.push({ a: [3500, 1000], b: [3500, 5000], t: 120 });
  spec.rooms!.push({ at: [4500, 3000], name: 'Second bedroom' });
  assert.deepEqual(validateSpec(spec), []);
});

test('validation handles unknown input and oversized units', () => {
  for (const input of [null, [], {}, { walls: [] }, { walls: [null] }]) assert.ok(codes(input).includes('schema'));
  const spec = rectangle();
  spec.walls.forEach(w => { w.a = w.a.map(v => v * 100) as [number, number]; w.b = w.b.map(v => v * 100) as [number, number]; });
  assert.ok(codes(spec).includes('unit'));
  const unknown = rectangle(); unknown.furniture![0].key = 'bed99';
  assert.match(validateSpec(unknown).find(i => i.code === 'furniture_key')!.msg, /候选.*bed/);
});

test('repair loop stops at three improving rounds and passes scoped error-only context', async () => {
  let count = 0;
  const result = await reviseUntilClean({ initial,
    issuesOf: async p => [...issues(5 - Number(p.round ?? 0)), { level: 'warn', code: 'warn', msg: 'warning' }],
    askModel: async (errors, summary) => {
      assert.ok(errors.every(issue => issue.level === 'error'));
      const context = JSON.parse(summary);
      assert.ok(context.rooms.length < plan.rooms.length);
      return [];
    },
    apply: async (_, current) => ({ ...current, plan: { ...plan, round: ++count }, revision: count }),
    maxRounds: 9,
  });
  assert.equal(result.rounds, 3);
  assert.equal(result.issues.filter(i => i.level === 'error').length, 2);
  assert.equal(result.design.revision, 3);
});

test('repair loop restores the best applied plan after a plateau', async () => {
  let calls = 0;
  const loaded: string[] = [];
  const result = await reviseUntilClean({ initial,
    issuesOf: async p => { loaded.push(String(p.name)); return issues(p.name === 'improved' ? 1 : 2); },
    askModel: async () => [],
    apply: async (_, current) => ({ ...current, plan: { ...plan, name: ++calls === 1 ? 'improved' : 'worse' }, revision: calls }),
  });
  assert.equal(result.design.plan.name, 'improved');
  assert.equal(loaded.at(-1), 'improved');
  assert.ok(result.rolledBack);
  assert.equal(result.rounds, 2);
});

test('repair loop ignores warnings and restores a plan after partial apply failure', async () => {
  const result = await reviseUntilClean({ initial, issuesOf: async () => [{ level: 'warn', code: 'warn', msg: 'warning' }], askModel: async () => { throw new Error('must not call'); }, apply: async () => initial });
  assert.equal(result.rounds, 0);
  let loaded = 0;
  await assert.rejects(reviseUntilClean({ initial, issuesOf: async () => { loaded++; return issues(1); }, askModel: async () => [], apply: async () => { throw new Error('partial apply'); } }), /partial apply/);
  assert.equal(loaded, 2);
});


test('example summary matches the normalized snapshot', () => {
  const stable = structuredClone(plan);
  const ids = new Map<string, string>();
  for (const category of ['nodes', 'walls', 'openings', 'furniture', 'rooms'] as const) stable[category].forEach((item, index) => ids.set(item.id, `${category}_${index}`));
  const normalized = JSON.parse(JSON.stringify(stable, (_, value) => typeof value === 'string' ? ids.get(value) ?? value : value));
  const expected = JSON.parse(readFileSync(new URL('./fixtures/hpd/example-summary.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(summarizePlan(normalized, [], [])), expected);
});

test('nested enclosed rooms keep furniture and repair context in the smallest containing region', async () => {
  const { issueSummary } = await import('../client/workspaces/cad/lib/design/plan-summary');
  const nested: SinglePlan = { version: 2, name: 'Nested', nodes: [], walls: [], openings: [], rooms: [
    { id: 'living', name: 'Living', x: 1000, y: 1000 }, { id: 'bath', name: 'Bathroom', x: 5000, y: 5000 },
  ], furniture: [{ id: 'toilet', key: 'toilet', x: 5000, y: 5000 }, { id: 'sofa', key: 'sofa', x: 1000, y: 1000 }] };
  for (const [index, coords] of [[0, 0, 10000, 10000], [4000, 4000, 6000, 6000]].entries()) {
    const [x1, y1, x2, y2] = coords;
    const points = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    points.forEach(([x, y], i) => nested.nodes.push({ id: `node-${index}-${i}`, x, y }));
    points.forEach((_, i) => nested.walls.push({ id: `wall-${index}-${i}`, a: `node-${index}-${i}`, b: `node-${index}-${(i + 1) % 4}`, t: 120 }));
  }
  const summary = JSON.parse(summarizePlan(nested, [], []));
  assert.equal(summary.furniture.Bathroom[0].id, 'toilet');
  const scoped = JSON.parse(issueSummary(nested, [{ level: 'error', code: 'test', msg: 'test', room: 'Bathroom' }]));
  assert.deepEqual(scoped.rooms.map((room: any) => room.name), ['Bathroom']);
  assert.deepEqual(Object.keys(scoped.furniture), ['Bathroom']);
  assert.equal(scoped.walls.length, 4);
});

test('optional structures, electrical points and beams are schema-checked', () => {
  for (const fields of [
    { structs: {} }, { structs: [{ kind: 'drain', at: [1] }] },
    { elec: {} }, { elec: [{ kind: 'socket', at: [NaN, 0] }] },
    { beams: {} }, { beams: [{ a: [0, 0], b: 'bad' }] },
  ]) assert.ok(codes({ ...rectangle(), ...fields }).includes('schema'));
  assert.ok(!codes({ ...rectangle(), structs: [{ kind: 'drain', at: [2000, 2000] }], elec: [{ kind: 'socket', at: [2000, 2000] }], beams: [{ a: [2000, 2000], b: [4000, 2000] }] }).includes('schema'));
});

test('near-axis opening coordinates use the measured upstream direction threshold', () => {
  const spec = rectangle();
  spec.walls[0].b[1] += 1;
  assert.deepEqual(validateSpec(spec), []);
});

test('summary uses measured room areas and regions and falls back to compact furniture', () => {
  const probe = JSON.parse(readFileSync(new URL('./fixtures/hpd/runtime-probe.json', import.meta.url), 'utf8'));
  const rooms = probe.regions.map((region: any) => ({ name: region.labels.map((label: any) => label.name).join(' / '), area: region.area, at: [region.interior.x, region.interior.y], rects: region.rects }));
  const summary = JSON.parse(summarizePlan(plan, rooms, [{ level: 'info', code: 'info', msg: 'info' }]));
  assert.deepEqual(summary.rooms.map((room: any) => room.area), rooms.map((room: any) => room.area));
  assert.deepEqual(summary.issues, []);
  const large = structuredClone(plan);
  large.furniture.forEach(item => { item.name = 'Long furniture label'.repeat(100); });
  const compact = summarizePlan(large, rooms, []);
  assert.ok(compact.length <= 12000);
  assert.ok(Object.values(JSON.parse(compact).furniture).flat().every((item: any) => !('name' in item)));
});

test('the upstream example spec passes prevalidation', () => {
  const spec = JSON.parse(readFileSync(new URL('./fixtures/hpd/example-spec.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateSpec(spec), []);
});

const openingDefaults: Record<string, [number, number]> = {
  door: [0, 2100], double: [0, 2100], unequal: [0, 2100], pocket: [0, 2100], hole: [0, 2100],
  sliding: [0, 2400], folding: [0, 2400], garage: [0, 2400], window: [900, 2400],
  slideWindow: [900, 2400], floorWindow: [0, 2500], highWindow: [1500, 2100], bay: [450, 2400], glassWall: [0, 2600],
};

test('every fixture opening has a supported type', () => {
  for (const opening of plan.openings) assert.ok(Object.prototype.hasOwnProperty.call(openingDefaults, opening.type), opening.type);
});

for (const [type, [sill, head]] of Object.entries(openingDefaults)) {
  test(`opening defaults match ${type} for creation and type changes`, () => {
    const added = applyOps(plan, [{ op: 'add_opening', wall: plan.walls[0].id, type, pos: 400, width: 200 }], ctx);
    assert.deepEqual(added.rejected, []);
    const created = (added.plan as SinglePlan).openings.at(-1)!;
    assert.equal(created.sill, sill);
    assert.equal(created.head, head);
    const before = structuredClone(plan);
    before.openings[0] = { ...before.openings[0], type: 'legacy', sill: 123, head: 456 };
    const updated = applyOps(before, [{ op: 'update_opening', id: before.openings[0].id, type }], ctx);
    assert.deepEqual(updated.rejected, []);
    const opening = (updated.plan as SinglePlan).openings[0];
    assert.equal(opening.sill, sill);
    assert.equal(opening.head, head);
    assert.equal(opening.id, before.openings[0].id);
    assert.equal(opening.pos, before.openings[0].pos);
    assert.deepEqual(before.openings[0].sill, 123);
  });
}

test('unsupported opening types are rejected with the available types and no changes', () => {
  for (const invalid of ['arch', '', '__proto__', 'constructor', null, ['door'], 1]) {
    const type = invalid as string;
    const result = applyOps(plan, [
      { op: 'add_opening', wall: plan.walls[0].id, type, pos: 400, width: 200 },
      { op: 'update_opening', id: plan.openings[0].id, type },
    ], ctx);
    assert.equal(result.applied, 0);
    assert.equal(result.rejected.length, 2);
    for (const rejected of result.rejected) for (const allowed of Object.keys(openingDefaults)) assert.ok(rejected.reason.includes(allowed));
    assert.deepEqual(result.plan, plan);
  }
});

test('opening defaults respect explicit heights independently and preserve heights without a type change', () => {
  const original = structuredClone(plan);
  original.openings[0] = { ...original.openings[0], type: 'door', sill: 100, head: 2200 };
  for (const [override, expected] of [
    [{ sill: 50 }, [50, 2400]], [{ head: 2300 }, [900, 2300]], [{ sill: 0, head: 2000 }, [0, 2000]],
  ] as const) {
    const added = applyOps(plan, [{ op: 'add_opening', wall: plan.walls[0].id, type: 'window', pos: 400, width: 200, ...override }], ctx);
    const created = (added.plan as SinglePlan).openings.at(-1)!;
    assert.deepEqual([created.sill, created.head], expected);
    const updated = applyOps(original, [{ op: 'update_opening', id: original.openings[0].id, type: 'window', ...override }], ctx);
    const changed = (updated.plan as SinglePlan).openings[0];
    assert.deepEqual([changed.sill, changed.head], expected);
  }
  for (const op of [
    { op: 'update_opening', id: original.openings[0].id, pos: original.openings[0].pos + 1 },
    { op: 'update_opening', id: original.openings[0].id, type: 'door' },
  ] as const) {
    const result = applyOps(original, [op], ctx);
    const opening = (result.plan as SinglePlan).openings[0];
    assert.deepEqual([opening.sill, opening.head], [100, 2200]);
  }
});

test('furniture creation and partial moves reject positions beyond the 2000mm wall bounds', () => {
  const xs = plan.nodes.map(n => n.x), ys = plan.nodes.map(n => n.y);
  const minX = Math.min(...xs) - 2000, maxX = Math.max(...xs) + 2000;
  const minY = Math.min(...ys) - 2000, maxY = Math.max(...ys) + 2000;
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  for (const [x, y, outside] of [
    [minX, centerY, false], [maxX, centerY, false], [centerX, minY, false], [centerX, maxY, false],
    [minX - 1, centerY, true], [maxX + 1, centerY, true], [centerX, minY - 1, true], [centerX, maxY + 1, true],
  ] as const) {
    const created = applyOps(plan, [{ op: 'add_furniture', key: 'bed18', x, y }], ctx);
    const moved = applyOps(plan, [{ op: 'move_furniture', id: plan.furniture[0].id, x, y }], ctx);
    assert.equal(created.rejected.length, Number(outside));
    assert.equal(moved.rejected.length, Number(outside));
    if (outside) { assert.deepEqual(created.plan, plan); assert.deepEqual(moved.plan, plan); }
  }
  for (const position of [{ x: maxX + 1 }, { y: maxY + 1 }]) {
    const result = applyOps(plan, [{ op: 'move_furniture', id: plan.furniture[0].id, ...position }], ctx);
    assert.equal(result.rejected.length, 1);
    assert.deepEqual(result.plan, plan);
  }
});


test('updating a legacy unsupported opening requires an explicit supported replacement', () => {
  const original = structuredClone(plan);
  original.openings[0].type = 'arch';
  const rejected = applyOps(original, [{ op: 'update_opening', id: original.openings[0].id, width: 900 }], ctx);
  assert.equal(rejected.rejected.length, 1);
  assert.deepEqual(rejected.plan, original);
  const repaired = applyOps(original, [{ op: 'update_opening', id: original.openings[0].id, type: 'window' }], ctx);
  assert.deepEqual(repaired.rejected, []);
  assert.equal((repaired.plan as SinglePlan).openings[0].sill, 900);
});

test('set_finish and set_look take keys or Chinese names and reject what the designer lacks', () => {
  const result = applyOps(plan, [
    { op: 'set_finish', room: '次卧', mat: '人字拼地板', wallMat: 'latexGrey' },
    { op: 'set_look', style: '沙盘', palette: '奶油' },
    { op: 'set_finish', room: '次卧', mat: '金砖' },
  ], ctx);
  const next = result.plan as SinglePlan;
  assert.deepEqual(result.rejected.map(item => item.index), [2]);
  assert.equal(next.rooms.find(room => room.name === '次卧')?.mat, 'herring');
  assert.equal(next.rooms.find(room => room.name === '次卧')?.wallMat, 'latexGrey');
  assert.deepEqual(next.look, { style: 'diorama', palette: 'cream' });
  assert.deepEqual({ ...result.touched }, { layout: false, elec: false, finish: true, look: true, relayoutElec: false });
});

test('MEP points snap onto the nearest wall face, link to lights and refuse door openings', () => {
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const wall = plan.walls.find(item => { const a = nodes.get(item.a)!, b = nodes.get(item.b)!; return Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 3000 && !plan.openings.some(o => o.wall === item.id); })!;
  const a = nodes.get(wall.a)!, b = nodes.get(wall.b)!;
  const midX = (a.x + b.x) / 2;
  const base = { ...structuredClone(plan), elec: [{ id: 'lamp1', kind: 'light', x: midX, y: a.y + 1500, rot: 0, h: 0 }] } as SinglePlan;
  const result = applyOps(base, [
    { op: 'add_elec', kind: 'switch1', x: midX, y: a.y + 300, links: ['lamp1'] },
    { op: 'add_elec', kind: 'socket', x: midX, y: a.y + 5000 },
    { op: 'add_elec', kind: 'downlight', x: midX, y: a.y + 900 },
  ], ctx);
  const elec = (result.plan as unknown as { elec: Array<{ id: string; kind: string; x: number; y: number; rot: number; h: number; links?: string[] }> }).elec;
  const sw = elec.find(item => item.kind === 'switch1')!;
  assert.equal(sw.y, Math.round(a.y + wall.t / 2 + 60));
  assert.equal(sw.rot, 0);
  assert.equal(sw.h, 1300);
  assert.deepEqual(sw.links, ['lamp1']);
  assert.ok(elec.some(item => item.kind === 'downlight' && item.y === Math.round(a.y + 900)));
  assert.equal(result.touched.elec, true);
  assert.equal(result.touched.layout, false);
  // Far from every wall: rejected with a reason.
  assert.deepEqual(result.rejected.map(item => item.index), result.rejected.length ? [1] : []);
  const removed = applyOps(result.plan, [{ op: 'remove', id: 'lamp1' }], ctx);
  assert.deepEqual((removed.plan as unknown as { elec: Array<{ kind: string; links?: string[] }> }).elec.find(item => item.kind === 'switch1')?.links, []);
  assert.equal(removed.touched.elec, true);
  const door = plan.openings.find(item => item.type === 'door')!;
  const doorWall = plan.walls.find(item => item.id === door.wall)!;
  const da = nodes.get(doorWall.a)!, db = nodes.get(doorWall.b)!, len = Math.hypot(db.x - da.x, db.y - da.y);
  const onDoor = [da.x + (db.x - da.x) * door.pos / len, da.y + (db.y - da.y) * door.pos / len];
  const blocked = applyOps(plan, [{ op: 'add_elec', kind: 'switch1', x: onDoor[0], y: onDoor[1] }], ctx);
  assert.match(blocked.rejected[0]?.reason ?? '', /洞口/);
});
