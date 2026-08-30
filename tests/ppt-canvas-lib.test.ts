import assert from "node:assert/strict";
import { test } from "node:test";
import { errorText, isRetryableBeautifyError } from "../client/workspaces/ppt/canvas/lib/errors";
import { runInParallel, sleep } from "../client/workspaces/ppt/canvas/lib/concurrency";
import { parseJsonLoose } from "../client/workspaces/ppt/canvas/lib/parse-json";
import { buildBeautifyInstruction } from "../client/workspaces/ppt/canvas/lib/beautify-instruction";
import { getSlideshowDimensions } from "../client/workspaces/ppt/canvas/lib/slideshow-size";

/**
 * The pure helpers behind slide generation, lifted out of PptCanvas. Each one
 * decides something the user sees: whether a failed slide is retried, whether
 * a model reply is usable, how many slides render at once.
 */

test("errorText prefers a real message and reports absence as empty", () => {
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText("  spaced  "), "spaced");
  assert.equal(errorText(new Error("")), "", "the caller supplies its own wording");
  assert.equal(errorText(null), "");
  assert.equal(errorText({ message: "not an Error" }), "");
});

test("transient failures are retried and refusals are not", () => {
  assert.equal(isRetryableBeautifyError(new Error("429 Too Many Requests")), true);
  assert.equal(isRetryableBeautifyError(new Error("524 origin timeout")), true);
  assert.equal(isRetryableBeautifyError(new Error("Rate Limit exceeded")), true, "matching is case-insensitive");
  assert.equal(isRetryableBeautifyError(new Error("TypeError: Failed to fetch")), true);
  assert.equal(isRetryableBeautifyError(new Error("content policy violation")), false);
  assert.equal(isRetryableBeautifyError(new Error("400 invalid image")), false);
});

test("an unreadable error is not retried forever", () => {
  assert.equal(isRetryableBeautifyError(null), false);
});

test("runInParallel never exceeds the limit", async () => {
  let inFlight = 0;
  let peak = 0;
  const tasks = Array.from({ length: 10 }, () => async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await sleep(5);
    inFlight -= 1;
  });

  await runInParallel(tasks, 3);
  assert.equal(peak, 3);
  assert.equal(inFlight, 0);
});

test("one failed slide does not abandon the rest of the deck", async () => {
  const done: number[] = [];
  const tasks = [0, 1, 2, 3, 4].map((n) => async () => {
    if (n === 1) throw new Error("slide 1 failed");
    await sleep(1);
    done.push(n);
  });

  await assert.rejects(runInParallel(tasks, 2), /slide 1 failed/);
  assert.deepEqual(done.sort(), [0, 2, 3, 4], "every other slide finished before the throw");
});

test("runInParallel accepts an empty deck", async () => {
  await runInParallel([], 4);
});

test("parseJsonLoose reads bare JSON", () => {
  assert.deepEqual(parseJsonLoose('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parseJsonLoose('  {"a":1}  '), { a: 1 });
});

test("parseJsonLoose digs the answer out of a fenced block", () => {
  const reply = 'Sure, here you go:\n```json\n[{"slide":1}]\n```\nHope that helps!';
  assert.deepEqual(parseJsonLoose(reply), [{ slide: 1 }]);
});

test("parseJsonLoose falls back to the outermost brackets", () => {
  assert.deepEqual(parseJsonLoose('Here: [1, 2, 3] — done.'), [1, 2, 3]);
});

test("parseJsonLoose returns null rather than throwing on junk", () => {
  assert.equal(parseJsonLoose(""), null);
  assert.equal(parseJsonLoose("no json at all"), null);
  assert.equal(parseJsonLoose("[unclosed"), null);
  assert.equal(parseJsonLoose("[not, valid, json]"), null);
});

test("the beautify instruction always carries its preservation rules", () => {
  const plain = buildBeautifyInstruction("");
  assert.match(plain, /preserving all original text/);
  assert.match(plain, /16:9 landscape/);
  assert.ok(!plain.includes("User requirements"), "nothing to append");
});

test("the user's wording is appended, whitespace-only counts as none", () => {
  assert.match(buildBeautifyInstruction("make it blue"), /User requirements: make it blue$/);
  assert.ok(!buildBeautifyInstruction("   ").includes("User requirements"));
});

test("the slideshow box keeps 16:9 inside the window", () => {
  const wide = getSlideshowDimensions({ width: 4000, height: 1000 });
  assert.equal(typeof wide.width, "number");
  // 0.9 * 4000 = 3600 wide would need 2025 high, past the 850 budget.
  assert.equal(wide.height, 850);
  assert.ok(Math.abs((wide.width as number) / (wide.height as number) - 16 / 9) < 1e-9);
});

test("a tall window is limited by width instead", () => {
  const tall = getSlideshowDimensions({ width: 1000, height: 4000 });
  assert.equal(tall.width, 900);
  assert.equal(tall.height, 506.25);
});

test("before the window is measured it falls back to viewport units", () => {
  assert.deepEqual(getSlideshowDimensions({ width: 0, height: 0 }), {
    width: "90vw",
    height: "50.625vw",
  });
});
