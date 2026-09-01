import assert from "node:assert/strict";
import { test } from "node:test";
import {
  creationReducer,
  initialCreationState,
  isGenerating,
  type CreationEvent,
  type CreationState,
} from "../client/workspaces/ppt/canvas/lib/creation-machine";

/**
 * The state machine behind the deck-building flows. Which step the canvas is
 * in decides which whole screen the user sees, so a wrong transition here is
 * not a cosmetic bug -- it strands the user on a progress bar or throws away
 * a finished deck.
 */

const run = (events: CreationEvent[], from: CreationState = initialCreationState()) =>
  events.reduce(creationReducer, from);

const NO_PROGRESS = { current: 0, total: 0, message: "" };

test("a fresh workspace starts idle with no progress", () => {
  assert.deepEqual(initialCreationState(), { step: "idle", progress: NO_PROGRESS });
});

test("a restored workspace resumes at its stored step", () => {
  assert.equal(run([{ type: "restored", step: "outline" }]).step, "outline");
  assert.equal(run([{ type: "restored", step: "done" }]).step, "done");
});

test("a restore never brings back a stale progress bar", () => {
  const mid = run([{ type: "writing", message: "half way" }]);
  assert.deepEqual(creationReducer(mid, { type: "restored", step: "done" }).progress, NO_PROGRESS);
});

test("the outline flow walks input to outline to done", () => {
  const steps = [
    { type: "preparing", message: "reading files" },
    { type: "outlined" },
    { type: "rendering" },
    { type: "finished" },
  ] as CreationEvent[];

  const seen = steps.reduce<string[]>((acc, event, i) => {
    acc.push(run(steps.slice(0, i + 1)).step);
    return acc;
  }, []);
  assert.deepEqual(seen, ["input", "outline", "generating_images", "done"]);
});

test("preparing keeps the user on the input form with a message", () => {
  const state = run([{ type: "preparing", message: "正在解析参考素材..." }]);
  assert.equal(state.step, "input", "the form stays up while the plan is built");
  assert.equal(state.progress.message, "正在解析参考素材...");
});

test("a finished deck never shows a progress message", () => {
  // The flow that lacked a `finally` used to leave one on screen, which
  // disabled the retry button on the deck view.
  const mid = run([
    { type: "rendering" },
    { type: "progress", current: 4, total: 9, message: "Rendering images..." },
  ]);
  assert.equal(mid.progress.message, "Rendering images...");
  assert.deepEqual(creationReducer(mid, { type: "finished" }).progress, NO_PROGRESS);
});

test("a failure returns to the start screen and clears progress", () => {
  const mid = run([{ type: "writing", message: "Parsing file..." }]);
  const failed = creationReducer(mid, { type: "failed" });
  assert.equal(failed.step, "idle");
  assert.deepEqual(failed.progress, NO_PROGRESS);
});

test("starting over clears everything", () => {
  const mid = run([{ type: "rendering" }, { type: "progress", current: 2, total: 5, message: "x" }]);
  assert.deepEqual(creationReducer(mid, { type: "cleared" }), {
    step: "idle",
    progress: NO_PROGRESS,
  });
});

test("rendering keeps whatever the progress tracker already reported", () => {
  // The image flows hand the bar to a two-stage tracker before entering this
  // step; clearing here would blank a bar that is already counting.
  const mid = run([{ type: "progress", current: 3, total: 10, message: "Generating..." }]);
  const rendering = creationReducer(mid, { type: "rendering" });
  assert.equal(rendering.step, "generating_images");
  assert.deepEqual(rendering.progress, { current: 3, total: 10, message: "Generating..." });
});

test("rendering with its own message replaces the bar", () => {
  const mid = run([{ type: "progress", current: 3, total: 10, message: "old" }]);
  assert.deepEqual(creationReducer(mid, { type: "rendering", message: "new" }).progress, {
    current: 0,
    total: 0,
    message: "new",
  });
});

test("progress updates never move the step", () => {
  const mid = run([{ type: "writing", message: "start" }]);
  const stepped = creationReducer(mid, { type: "progress", current: 1, total: 3, message: "1/3" });
  assert.equal(stepped.step, "generating_content");
  assert.deepEqual(stepped.progress, { current: 1, total: 3, message: "1/3" });
});

test("the reducer never mutates the state it was given", () => {
  const before = initialCreationState("outline");
  const snapshot = JSON.parse(JSON.stringify(before));
  creationReducer(before, { type: "finished" });
  assert.deepEqual(before, snapshot);
});

test("isGenerating covers exactly the two full-screen progress steps", () => {
  assert.equal(isGenerating("generating_content"), true);
  assert.equal(isGenerating("generating_images"), true);
  assert.equal(isGenerating("idle"), false);
  assert.equal(isGenerating("input"), false);
  assert.equal(isGenerating("outline"), false);
  assert.equal(isGenerating("done"), false);
});
