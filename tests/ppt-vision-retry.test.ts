import assert from "node:assert/strict";
import { test } from "node:test";
import { reasonOf, retryOnce } from "../client/workspaces/ppt/vision/retry";

/**
 * One more try before a page is given up on.
 *
 * A page given up on exports as a flat picture, which is a steep price for a
 * rate limit or a dropped connection. But a retry also re-runs model calls
 * somebody is paying for, so it is exactly one retry, and never for a failure
 * that another attempt cannot fix.
 */

const failingThen = (failures: number, value: string) => {
  let calls = 0;
  const work = async () => {
    calls += 1;
    if (calls <= failures) throw new Error(`attempt ${calls} failed`);
    return value;
  };
  return { work, calls: () => calls };
};

test("a success on the first try runs once", async () => {
  const { work, calls } = failingThen(0, "ok");
  assert.equal(await retryOnce(work), "ok");
  assert.equal(calls(), 1);
});

test("a failure on the first try gets exactly one more", async () => {
  const { work, calls } = failingThen(1, "ok");
  const reasons: string[] = [];

  assert.equal(await retryOnce(work, { onRetry: (reason) => reasons.push(reason) }), "ok");
  assert.equal(calls(), 2);
  assert.deepEqual(reasons, ["attempt 1 failed"], "the retry is announced with its reason");
});

test("a failure that survives the retry is rethrown, not retried again", async () => {
  // A third attempt rarely fixes what a second did not, and each one is paid
  // for. The second error is the one reported: it is the latest word.
  const { work, calls } = failingThen(5, "never");
  await assert.rejects(retryOnce(work), /attempt 2 failed/);
  assert.equal(calls(), 2);
});

test("a failure another attempt cannot fix is not retried", async () => {
  // A page with no background cannot grow one by being rebuilt again; trying
  // anyway would re-run its model calls for nothing.
  let calls = 0;
  const work = async () => {
    calls += 1;
    throw new Error("no-background");
  };
  const retried: string[] = [];

  await assert.rejects(
    retryOnce(work, {
      shouldRetry: (reason) => reason !== "no-background",
      onRetry: (reason) => retried.push(reason),
    }),
    /no-background/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(retried, []);
});

test("the retry waits before trying again", async () => {
  const { work } = failingThen(1, "ok");
  const started = Date.now();
  await retryOnce(work, { delayMs: 40 });
  assert.ok(Date.now() - started >= 35, "a rate limit needs a moment to lift");
});

test("reasons come out as text whatever was thrown", () => {
  assert.equal(reasonOf(new Error("boom")), "boom");
  assert.equal(reasonOf("plain"), "plain");
  assert.equal(reasonOf(429), "429");
});
