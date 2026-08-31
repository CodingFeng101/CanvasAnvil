import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reviewProgressSummary,
  summariseReviewProgress,
  type LayerStatus,
} from "../client/workspaces/ppt/canvas/lib/review-progress";
import type { EditableExtractionStatus } from "../client/workspaces/ppt/canvas/types";

/**
 * Export review runs two passes over the deck: prepare each slide's text-box
 * layer, then extract the text inside those boxes. The sidebar reports
 * whichever is running, and the two counts are easy to confuse -- a slide can
 * have its boxes ready while its text is still coming.
 */

const ex = (...s: EditableExtractionStatus[]) => s;
const layers = (...s: LayerStatus[]) => s;

test("an empty deck is not finished, it is empty", () => {
  const p = summariseReviewProgress([], []);
  assert.equal(p.allLayersPrepared, false, "there is nothing to review");
  assert.equal(p.allExtractionsDone, false);
  assert.equal(p.phase, "boxes");
});

test("preparing boxes is the first phase", () => {
  const p = summariseReviewProgress(
    ex("idle", "idle", "idle"),
    layers("ready", undefined, undefined),
  );
  assert.equal(p.phase, "boxes");
  assert.equal(p.preparedCount, 1);
  assert.equal(p.allLayersPrepared, false);
});

test("a failed layer still counts as prepared", () => {
  // It will not be retried, so the pass is over for that slide.
  const p = summariseReviewProgress(ex("idle", "idle"), layers("ready", "failed"));
  assert.equal(p.preparedCount, 2);
  assert.equal(p.allLayersPrepared, true);
});

test("any slide extracting switches the phase to text", () => {
  const p = summariseReviewProgress(ex("done", "extracting"), layers("ready", "ready"));
  assert.equal(p.isExtracting, true);
  assert.equal(p.phase, "text");
});

test("extraction counts track done and failed separately", () => {
  const p = summariseReviewProgress(
    ex("done", "done", "failed", "idle"),
    layers("ready", "ready", "ready", "ready"),
  );
  assert.equal(p.doneCount, 2);
  assert.equal(p.failedCount, 1);
  assert.equal(p.allExtractionsDone, false, "a failure is not a completion");
});

test("all done only when every slide is done", () => {
  assert.equal(summariseReviewProgress(ex("done", "done"), layers("ready", "ready")).allExtractionsDone, true);
  assert.equal(summariseReviewProgress(ex("done", "failed"), layers("ready", "ready")).allExtractionsDone, false);
});

test("the summary reports the boxes pass while it runs", () => {
  const p = summariseReviewProgress(ex("idle", "idle", "idle"), layers("ready", undefined, undefined));
  assert.equal(reviewProgressSummary(p, 3, "zh"), "文本框准备中 1/3 页");
  assert.equal(reviewProgressSummary(p, 3, "en"), "1/3 text-box layers prepared");
});

test("the summary switches to extraction once it starts", () => {
  const p = summariseReviewProgress(ex("done", "extracting"), layers("ready", "ready"));
  assert.equal(reviewProgressSummary(p, 2, "zh"), "文本提取中 1/2 页");
  assert.equal(reviewProgressSummary(p, 2, "en"), "1/2 slides text extracted");
});

test("a clean finish says nothing about failures", () => {
  const p = summariseReviewProgress(ex("done", "done"), layers("ready", "ready"));
  assert.equal(reviewProgressSummary(p, 2, "zh"), "文本提取完成 2/2 页");
  assert.equal(reviewProgressSummary(p, 2, "en"), "2/2 slides text extracted");
});

test("failures are named in the finished summary", () => {
  const p = summariseReviewProgress(ex("done", "failed"), layers("ready", "ready"));
  assert.equal(reviewProgressSummary(p, 2, "zh"), "文本提取完成 1/2 页，失败 1 页");
  assert.equal(reviewProgressSummary(p, 2, "en"), "1/2 slides text extracted, 1 failed");
});
