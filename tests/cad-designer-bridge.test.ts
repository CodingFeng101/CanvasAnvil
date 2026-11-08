import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignerBridge, cleanDesignerStorage } from '../client/workspaces/cad/designer/designer-bridge';

test('bridge reports missing API and returns detached plan snapshots', async () => {
  const api: any = { app: { plan: { version: 2, furniture: [] } }, bld: { floors: [] } };
  const bridge = createDesignerBridge(() => api);
  assert.ok(bridge.checkApi().includes('replacePlan'));
  const plan: any = bridge.readPlan();
  plan.furniture.push({ id: 'x' });
  assert.equal(api.app.plan.furniture.length, 0);
});

test('storage cleanup preserves unrelated and current preset keys', () => {
  const data = new Map([['house-designer-v2-plan:old', '1'], ['house-designer-scheme:now', '2'], ['other', '3']]);
  cleanDesignerStorage({ get length() { return data.size; }, key: (i: number) => [...data.keys()][i], removeItem: (k: string) => data.delete(k) }, 'now');
  assert.deepEqual([...data.keys()], ['house-designer-scheme:now', 'other']);
});

test('bridge reads the current floor into building snapshots', () => {
  const api: any = { app: { plan: { version: 2, name: 'edited', furniture: [] } }, bld: { name: 'building', cur: 1, floors: [{ plan: { name: 'first' } }, { plan: { name: 'stale' } }], slab: 120 } };
  const bridge = createDesignerBridge(() => api);
  const plan: any = bridge.readPlan();
  assert.equal(plan.kind, 'building');
  assert.equal(plan.floors[1].plan.name, 'edited');
  assert.equal(api.bld.floors[1].plan.name, 'stale');
});

test('bridge uses measured export arguments and room geometry', () => {
  const calls: unknown[] = [];
  const api: any = {
    app: { geo: { bounds: { x: 10, y: 20, w: 10000, h: 8000 } }, rooms: { regions: [{ area: 12, interior: { x: 100, y: 200 }, labels: [{ name: 'Bedroom' }] }] } },
    dxfBytes: (...args: unknown[]) => { calls.push(args); return [65, 66]; },
    shot2d: (...args: unknown[]) => { calls.push(args); return 'data:image/png;base64,AA'; },
  };
  const bridge = createDesignerBridge(() => api);
  assert.deepEqual(bridge.exportDxf(), new Uint8Array([65, 66]));
  assert.deepEqual(calls[0], ['gb', 'layout']);
  assert.ok(bridge.shot2d().startsWith('data:image/png'));
  assert.deepEqual(calls[1], ['layout', 5010, 4020, 0.125]);
  assert.deepEqual(bridge.roomAreas(), [{ name: 'Bedroom', area: 12, at: [100, 200] }]);
});

test('bridge preserves check targets and only converts numeric coordinates', () => {
  const api: any = { runChecks: () => ({ issues: [
    { level: 'error', type: 'test', msg: 'test', at: { x: 1, y: 2 }, targets: [{ kind: 'furn', id: 'one', extra: 5 }] },
    { level: 'warn', type: 'test', msg: 'test', at: { x: 1 } },
    { level: 'info', type: 'test', msg: 'test', at: { x: '1', y: 2 } },
  ] }) };
  const issues = createDesignerBridge(() => api).runChecks();
  assert.deepEqual(issues[0].targets, [{ kind: 'furn', id: 'one' }]);
  assert.deepEqual(issues[0].at, [1, 2]);
  assert.ok(!('at' in issues[1]));
  assert.ok(!('at' in issues[2]));
});

test('bridge fails immediately for an early missing-furniture error', async () => {
  const start = Date.now();
  const bridge = createDesignerBridge(() => undefined, () => ['家具库缺少：missing']);
  await assert.rejects(bridge.ready(), /家具库缺少/);
  assert.ok(Date.now() - start < 500);
});
