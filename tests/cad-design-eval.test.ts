import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error JavaScript evaluation helper has no declaration file.
import { judgeEdit, judgeCase, extractSpecFlags, classifyModelResponse, classifyChatError, selectCases, summarizeRun } from '../tools/eval/cad-design/judge.mjs';

test('edit judgment catches unrelated changes and preserves manual furniture', () => {
  const before = { furniture: [{ id: 'bed', key: 'bed15', x: 0 }, { id: 'sofa', key: 'sofa', x: 300 }], nodes: [] };
  const after = structuredClone(before);
  after.furniture[0].key = 'bed18';
  assert.ok(judgeEdit(before, after, { expectOnlyChanged: 'furniture:bed*', expectPreserved: 'furniture:sofa*', expectKeys: ['bed18'] }).passed);
  after.furniture[1].x = 0;
  assert.ok(!judgeEdit(before, after, { expectOnlyChanged: 'furniture:bed*', expectPreserved: 'furniture:sofa*' }).passed);
});

test('room judgments require furniture inside the corresponding region', () => {
  const rules = { maxFixRounds: 3, areaTolerance: 0.15, bedroomNeedsAnyOf: ['bed18'], bathroomNeedsAnyOf: ['toilet'], kitchenNeedsAnyOf: ['counter'], minDoorPassage: 700 };
  const snapshot = { plan: { furniture: [{ id: 'bed', key: 'bed18', x: 50, y: 50 }], rooms: [{ name: '卧室' }], openings: [] }, regions: [{ area: 10, labels: [{ name: '卧室' }], rects: [{ x: 0, y: 0, w: 100, h: 100 }] }] };
  assert.ok(judgeCase(snapshot, { totalArea: 10, rooms: [['卧室']] }, rules).passed);
  snapshot.plan.furniture[0].x = 200;
  assert.ok(!judgeCase(snapshot, { totalArea: 10 }, rules).passed);
});


test('spec flags come from actual model response content only', () => {
  assert.deepEqual(extractSpecFlags('```json\n{"type":"cad_spec","spec":{"autoElec":true}}\n```'), { autoElec: true });
  assert.deepEqual(extractSpecFlags('{"type":"cad_spec","spec":{"autoElec":false}}'), { autoElec: false });
  assert.equal(extractSpecFlags('{"type":"cad_ops","ops":[]}'), undefined);
  assert.equal(extractSpecFlags('Applied 1 changes. 0 errors.'), undefined);
});


test('response diagnostics distinguish complete JSON, surrounding prose, empty and truncated output', () => {
  assert.equal(classifyModelResponse('  '), 'empty');
  assert.equal(classifyModelResponse('{"type":"cad_spec","spec":{}}'), 'raw_json');
  assert.equal(classifyModelResponse('```JSON\n{"type":"cad_spec"}\n```'), 'fenced_json');
  assert.equal(classifyModelResponse('```json\n{"type":"cad_spec"}'), 'fenced_json');
  assert.equal(classifyModelResponse('Here is the result {"type":"cad_spec"} done'), 'prose_with_json');
  assert.equal(classifyModelResponse('{"type":"cad_spec","spec":{"name":"complete nested object"}'), 'possibly_truncated');
  assert.equal(classifyModelResponse('{"type": nope}'), 'invalid_json');
  assert.equal(classifyModelResponse('Please clarify the bedroom count.'), 'prose_only');
  assert.equal(classifyChatError('模型未返回完整的 CAD JSON 数据'), 'parse_failed');
  assert.equal(classifyChatError('fetch failed'), 'fetch_failed');
});

test('single-case filtering preserves the suite default and rejects unknown ids', () => {
  const cases = [{ id: 'c01' }, { id: 'c02' }];
  assert.equal(selectCases(cases), cases);
  assert.deepEqual(selectCases(cases, 'c02'), [cases[1]]);
  assert.throws(() => selectCases(cases, 'unknown'), /Unknown CAD evaluation case/);
});


test('partial and subset rounds never claim full-suite acceptance', () => {
  const selected = Array.from({ length: 10 }, (_, index) => `c${index}`);
  const passed = (id: string) => ({ id, passed: true, edits: [{ passed: true }] });
  const partial = summarizeRun(selected, selected.slice(0, 6).map(passed), true, 10);
  assert.equal(partial.partial, true);
  assert.equal(partial.passed, false);
  assert.equal(partial.selectedCasesPassed, false);
  const subset = summarizeRun(['c1'], [passed('c1')], false, 10);
  assert.equal(subset.completed, true);
  assert.equal(subset.selectedCasesPassed, true);
  assert.equal(subset.passed, false);
  const full = summarizeRun(selected, selected.map(passed), true, 10);
  assert.equal(full.partial, false);
  assert.equal(full.passed, true);
});


test('model authentication failures have a distinct diagnostic category', () => {
  assert.equal(classifyChatError('无效的令牌'), 'auth_failed');
  assert.equal(classifyChatError('HTTP 401 Unauthorized'), 'auth_failed');
});
