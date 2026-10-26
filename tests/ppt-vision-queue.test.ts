import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueue } from "../client/workspaces/ppt/vision/ocr-engine";

/**
 * One page through the OCR models at a time.
 *
 * The failure this prevents is not subtle once seen and invisible before: the
 * WASM sessions are not re-entrant, so a second page entering while the first
 * is mid-run fails with "Session already started", and that page is abandoned
 * and exported as a flat picture. A deck rebuilt three pages at once lost
 * three pages in four to it.
 */

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("work never overlaps, however much is queued at once", () => {
  const queue = createQueue();
  let running = 0;
  let peak = 0;

  const job = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await settle();
    running -= 1;
  };

  return Promise.all([queue(job), queue(job), queue(job), queue(job)]).then(() => {
    assert.equal(peak, 1, "two pages were in the models at once");
  });
});

test("work runs in the order it was queued", async () => {
  const queue = createQueue();
  const order: number[] = [];

  await Promise.all(
    [1, 2, 3].map((n) =>
      queue(async () => {
        // The first job waits longest, so an unordered queue would finish it
        // last and the sequence would come out reversed.
        await new Promise((resolve) => setTimeout(resolve, 12 - n * 4));
        order.push(n);
      }),
    ),
  );

  assert.deepEqual(order, [1, 2, 3]);
});

test("a page that throws does not take the pages behind it down", async () => {
  const queue = createQueue();
  const done: string[] = [];

  const failing = queue(async () => {
    throw new Error("Session already started");
  });
  const following = queue(async () => {
    done.push("after");
    return "ok";
  });

  await assert.rejects(failing, /Session already started/);
  assert.equal(await following, "ok");
  assert.deepEqual(done, ["after"]);
});

test("each caller gets its own result back", async () => {
  const queue = createQueue();
  const results = await Promise.all([queue(async () => "a"), queue(async () => "b")]);
  assert.deepEqual(results, ["a", "b"]);
});
