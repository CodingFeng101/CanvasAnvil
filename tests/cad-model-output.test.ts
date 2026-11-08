import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCadPayload } from '../client/workspaces/cad/lib/design/model-output';

const payload = { type: 'cad_spec', spec: { name: 'Quoted {room}', walls: [] } };
const json = JSON.stringify(payload);
for (const [name, text] of [
  ['raw JSON', json], ['lowercase fence', '```json\n' + json + '\n```'],
  ['uppercase fence', '```JSON\n' + json + '\n```'],
  ['missing ending fence with complete JSON', '```json\n' + json],
  ['surrounding prose', 'Here is the plan.\n' + json + '\nDone.'],
  ['an unrelated fence before valid JSON', '```text\nnotes\n```\n' + json],
] as const) test(`CAD payload parser accepts ${name}`, () => assert.deepEqual(parseCadPayload(text), payload));

test('CAD parser rejects empty, untyped and truncated JSON without inventing data', () => {
  for (const text of ['', '{"spec":{}}', '{"type":"cad_spec","spec":{"walls":[', '```json\n{"type":"cad_ops","ops":[']) assert.throws(() => parseCadPayload(text));
});
