import test from 'node:test';
import assert from 'node:assert/strict';
import { CadDesignSession } from '../client/workspaces/cad/lib/design/design-session';
import fixture from './fixtures/hpd/example-plan.json';
import type { DesignerBridge } from '../client/workspaces/cad/designer/designer-bridge';
import type { InternalPlan, SinglePlan } from '../client/workspaces/cad/lib/design/types';

const validSpec = () => ({ walls: [
  { a: [0, 0], b: [5000, 0], t: 200 }, { a: [5000, 0], b: [5000, 4000], t: 200 },
  { a: [5000, 4000], b: [0, 4000], t: 200 }, { a: [0, 4000], b: [0, 0], t: 200 },
], furniture: [{ key: 'bed18', at: [2000, 2000] }] });
function setup() {
  const data = new Map<string, unknown>();
  const store = { read: async <T,>(key: string) => (data.get(key) ?? null) as T | null, save: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }, clear: async (key: string) => { data.delete(key); } };
  let plan = structuredClone(fixture) as SinglePlan;
  let loads = 0;
  const bridge = {
    ready: async () => {}, checkApi: () => [], readPlan: () => structuredClone(plan),
    replacePlan: (next: InternalPlan) => { plan = structuredClone(next) as SinglePlan; },
    runChecks: () => [], roomAreas: () => [],
    makeFurn: (key: string, x: number, y: number, rot: number) => ({ ...fixture.furniture[0], id: crypto.randomUUID(), key, x, y, rot }),
  } as unknown as DesignerBridge;
  const session = new CadDesignSession({ store });
  session.setLoader(async () => { loads++; return bridge; });
  return { session, bridge, store, data, loads: () => loads, plan: () => plan };
}

test('empty session stays empty and invalid specs never reach the engine', async () => {
  const { session, loads } = setup();
  await session.hydrate();
  assert.equal(session.getSnapshot().design, null);
  await assert.rejects(session.applyModelOutput({ type: 'cad_spec', spec: { walls: [] } }), /walls/);
  assert.equal(loads(), 0);
});

test('model operation rejection retries once against the original plan', async () => {
  const { session, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  const id = plan().furniture[0].id;
  let retried = 0;
  await session.applyModelOutput({ type: 'cad_ops', ops: [{ op: 'resize_furniture', id, w: -1 }] }, async feedback => {
    assert.match(feedback, /大于 0/);
    retried++;
    return { type: 'cad_ops', ops: [{ op: 'resize_furniture', id, w: 1500 }] };
  });
  assert.equal(retried, 1);
  assert.equal(plan().furniture[0].w, 1500);
});

test('manual changes persist, invalidate confirmation and survive unrelated AI edits and undo', async () => {
  const { session, bridge, store, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  await session.confirm();
  const manuallyMoved = structuredClone(plan());
  manuallyMoved.furniture[1].x += 300;
  bridge.replacePlan(manuallyMoved);
  await session.sync();
  const revision = session.getSnapshot().design!.revision;
  assert.equal(session.getSnapshot().design!.status, 'draft');
  const id = plan().furniture[0].id;
  await session.applyModelOutput({ type: 'cad_ops', ops: [{ op: 'resize_furniture', id, w: 1500 }] });
  assert.equal(plan().furniture[1].x, manuallyMoved.furniture[1].x);
  assert.ok(session.getSnapshot().design!.revision > revision);
  await session.restoreVersion(session.versions().length - 2);
  assert.equal(plan().furniture[1].x, manuallyMoved.furniture[1].x);
  assert.equal(plan().furniture[0].w, manuallyMoved.furniture[0].w);
  const restored = new CadDesignSession({ store });
  await restored.hydrate();
  assert.equal((restored.getSnapshot().design!.plan as SinglePlan).furniture[1].x, manuallyMoved.furniture[1].x);
});

test('unsupported spec opening types are rejected before iframe loading', async () => {
  const { session, loads } = setup();
  const spec = validSpec();
  const invalid = { ...spec, walls: spec.walls.map((wall, index) => index ? wall : { ...wall, openings: [{ type: 'arch', from: 1000, to: 2000 }] }) };
  await assert.rejects(session.applyModelOutput({ type: 'cad_spec', spec: invalid }), /door/);
  assert.equal(loads(), 0);
});

test('invalid spec retries include original data and load only after validation succeeds', async () => {
  const { session, loads } = setup();
  const invalid = validSpec(); invalid.furniture[0].key = 'missing';
  let calls = 0;
  await session.applyModelOutput({ type: 'cad_spec', spec: invalid }, async feedback => {
    assert.equal(loads(), 0);
    assert.equal(JSON.parse(feedback).spec.furniture[0].key, 'missing');
    calls++;
    return { type: 'cad_spec', spec: validSpec() };
  });
  assert.equal(calls, 1);
  assert.equal(loads(), 1);
});

test('a rejected operation batch never partially updates the engine and retries only once', async () => {
  const { session, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  const before = structuredClone(plan());
  let calls = 0;
  await assert.rejects(session.applyModelOutput({ type: 'cad_ops', ops: [
    { op: 'resize_furniture', id: before.furniture[0].id, w: 1500 },
    { op: 'remove', id: 'missing' },
  ] }, async () => {
    assert.deepEqual(plan(), before);
    calls++;
    return { type: 'cad_ops', ops: [{ op: 'remove', id: 'still-missing' }] };
  }), /still-missing/);
  assert.equal(calls, 1);
  assert.deepEqual(plan(), before);
});

test('redraws require explicit permission and recover a previous plan after loading failure', async () => {
  const { session, bridge, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  const before = structuredClone(plan());
  await assert.rejects(session.applyModelOutput({ type: 'cad_spec', replace: true, spec: validSpec() }), /明确要求/);
  let recovered = false;
  session.setLoader(async preset => {
    if ('spec' in preset) throw new Error('Designer API incompatible');
    recovered = true;
    bridge.replacePlan(preset.plan);
    return bridge;
  });
  await assert.rejects(session.applyModelOutput({ type: 'cad_spec', replace: true, spec: validSpec() }, undefined, { allowReplace: true }), /incompatible/);
  assert.ok(recovered);
  assert.deepEqual(plan(), before);
  assert.deepEqual(session.getSnapshot().design!.plan, before);
});

test('cancellation during operation repair preserves the current design', async () => {
  const { session, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  const before = structuredClone(plan());
  const controller = new AbortController();
  await assert.rejects(session.applyModelOutput({ type: 'cad_ops', ops: [{ op: 'remove', id: 'missing' }] }, async () => {
    controller.abort();
    return { type: 'cad_ops', ops: [{ op: 'remove', id: before.furniture[0].id }] };
  }, { signal: controller.signal }), /aborted/);
  assert.deepEqual(plan(), before);
});

test('undo serializes engine restoration and persistence against polling', async () => {
  const { session, store, plan } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  await session.applyModelOutput({ type: 'cad_ops', ops: [{ op: 'resize_furniture', id: plan().furniture[0].id, w: 1500 }] });
  const originalSave = store.save;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  store.save = async (key, value) => { await gate; await originalSave(key, value); };
  const undo = session.restoreVersion(session.versions().length - 2);
  await new Promise(resolve => setTimeout(resolve, 0));
  const busyDuringWrite = session.getSnapshot().busy;
  const sync = session.sync();
  release();
  await Promise.all([undo, sync]);
  const restored = new CadDesignSession({ store });
  await restored.hydrate();
  assert.equal(restored.getSnapshot().canUndo, false);
  assert.equal(busyDuringWrite, true);
});

test('JSON-format repair consumes the same six-round design repair budget', async () => {
  const { session, bridge, plan } = setup();
  let calls = 0;
  bridge.runChecks = () => Array.from({ length: 6 - calls }, () => ({ level: 'error' as const, code: 'test', msg: 'test' }));
  const result = await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() }, async () => {
    calls++;
    return { type: 'cad_ops', ops: [{ op: 'resize_furniture', id: plan().furniture[0].id, w: 1500 - calls }] };
  }, { initialRepairRounds: 1 });
  assert.equal(calls, 5);
  assert.equal(result.rounds, 6);
  assert.equal(result.errors, 1);
});

test('restoring an incompatible stored plan falls back to the previous version', async () => {
  const { session, bridge, store, plan, data } = setup();
  await session.applyModelOutput({ type: 'cad_spec', spec: validSpec() });
  await session.applyModelOutput({ type: 'cad_ops', ops: [{ op: 'resize_furniture', id: plan().furniture[0].id, w: 1500 }] });
  const record: any = structuredClone(data.get('cad-design-record'));
  record.design.plan.name = 'incompatible';
  await store.save('cad-design-record', record);
  const restored = new CadDesignSession({ store });
  const recoveries: boolean[] = [];
  restored.setLoader(async (preset, recovery) => {
    recoveries.push(!!recovery);
    if ('plan' in preset && preset.plan.name === 'incompatible') throw new Error('Designer API incompatible');
    if ('plan' in preset) bridge.replacePlan(preset.plan);
    return bridge;
  });
  await restored.ensureReady();
  assert.equal(restored.getSnapshot().design!.plan.name, record.history.at(-1).plan.name);
  assert.equal(restored.getSnapshot().design!.revision, record.design.revision + 1);
  assert.deepEqual(recoveries, [false, true]);
});

test('completing a recognized draft keeps the original underlay and records the symbol list once', async () => {
  const { session } = setup();
  const underlay = { src: 'data:image/png;base64,AA==', imgW: 10, imgH: 10, mmPerPx: 10, x: 0, y: 0 };
  await session.loadDraft(validSpec() as never, underlay, { recognition: { route: 'image', notes: ['比例来源：总宽'] } });
  assert.equal(session.getSnapshot().design!.lastSource, 'recognize');
  await session.noteRecognition({ answers: { 层高: ['2900'] } });
  await session.applyModelOutput({
    type: 'cad_spec', replace: true, spec: validSpec(),
    symbols: [{ symbol: '双人床', where: '主卧', count: 1, model: 'bed18' }, { nope: true }],
    confirm: ['层高按 2900'],
  }, undefined, { allowReplace: true });
  const design = session.getSnapshot().design!;
  assert.deepEqual(design.underlay, underlay);
  assert.equal(design.recognition!.completed, true);
  assert.deepEqual(design.recognition!.answers, { 层高: ['2900'] });
  assert.deepEqual(design.recognition!.symbols, [{ symbol: '双人床', where: '主卧', count: 1, model: 'bed18' }]);
  assert.deepEqual(design.recognition!.confirm, ['层高按 2900']);
});
