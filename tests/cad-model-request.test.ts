import test from 'node:test';
import assert from 'node:assert/strict';
import { retryCadTextRequest } from '../client/workspaces/cad/lib/design/model-request';

test('CAD text requests retry one transient network failure', async () => {
  let calls = 0;
  const result = await retryCadTextRequest(async () => { if (++calls === 1) throw new Error('fetch failed'); return 'valid output'; });
  assert.equal(result, 'valid output');
  assert.equal(calls, 2);
});
test('CAD text requests stop after the second network failure', async () => {
  let calls = 0;
  await assert.rejects(retryCadTextRequest(async () => { calls++; throw new Error('Failed to fetch'); }), /fetch/);
  assert.equal(calls, 2);
});
test('CAD requests do not retry authentication errors or cancelled calls', async () => {
  let calls = 0;
  await assert.rejects(retryCadTextRequest(async () => { calls++; throw new Error('Invalid API key'); }), /API key/);
  assert.equal(calls, 1);
  const controller = new AbortController();
  await assert.rejects(retryCadTextRequest(async () => { controller.abort(); throw new Error('fetch failed'); }, controller.signal));
});
