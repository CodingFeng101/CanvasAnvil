import test from "node:test";
import assert from "node:assert/strict";
import { readUsage } from "../server/ai/text";
import { addUsage, onUsage, reportUsage, toTokenUsage } from "../client/ai/usage";

test("readUsage takes only the numbers the provider sent", () => {
  assert.deepEqual(readUsage({ prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }), { input: 120, output: 30 });
  assert.deepEqual(readUsage({ input_tokens: 5 }), { input: 5, output: undefined });
  assert.equal(readUsage(undefined), undefined);
  assert.equal(readUsage({}), undefined);
  assert.equal(readUsage({ prompt_tokens: "12" }), undefined);
});

test("a turn's calls add up; a side never reported stays absent", () => {
  const first = addUsage(null, { input: 100, output: 20 });
  assert.deepEqual(addUsage(first, { input: 50, output: 5 }), { input: 150, output: 25 });
  assert.deepEqual(addUsage(null, { output: 7 }), { input: undefined, output: 7 });
});

test("nothing is reported without numbers", () => {
  const seen: unknown[] = [];
  const stop = onUsage((usage) => seen.push(usage));
  reportUsage(null);
  reportUsage({});
  reportUsage({ input: 3, output: 4 });
  stop();
  reportUsage({ input: 9 });
  assert.deepEqual(seen, [{ input: 3, output: 4 }]);
  assert.equal(toTokenUsage({ input: -1 }), undefined);
});
