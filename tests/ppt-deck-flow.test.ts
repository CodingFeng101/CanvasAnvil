import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyActivity,
  closeInterrupted,
  flowText,
  latestFlowIndex,
  newFlow,
  readFlow,
  type DeckActivity,
} from "../client/workspaces/ppt/lib/deck-flow";

const activity = (patch: Partial<DeckActivity>): DeckActivity => ({ phase: "idle", titles: [], drawn: 0, total: 0, ...patch });

test("a deck's steps round-trip through the message text", () => {
  const flow = newFlow(2);
  assert.deepEqual(readFlow(flowText(flow)), flow);
  assert.equal(readFlow("普通回复"), null);
  assert.equal(readFlow("[[PPT_FLOW]]{oops"), null);
});

test("reading hands over to writing the outline, whose titles follow the canvas", () => {
  let flow = newFlow(1);
  assert.equal(flow.outline.state, "pending");
  flow = applyActivity(flow, activity({ phase: "outlining", titles: ["封面", "现状"] }));
  assert.equal(flow.reading?.state, "done");
  assert.equal(flow.outline.state, "running");
  assert.deepEqual(flow.outline.titles, ["封面", "现状"]);
});

test("drawing counts pages and ends done, or with the pages that failed", () => {
  const base = { ...newFlow(0), outline: { state: "done" as const, titles: ["a", "b", "c"] }, confirm: { state: "done" as const }, slides: { state: "running" as const, done: 0, total: 3 } };
  const mid = applyActivity(base, activity({ phase: "drawing", drawn: 1, total: 3 }));
  assert.deepEqual(mid.slides, { state: "running", done: 1, total: 3 });
  const end = applyActivity(mid, activity({ phase: "done", drawn: 2, total: 3 }));
  assert.deepEqual(end.slides, { state: "done", done: 2, total: 3, failed: 1 });
  const none = applyActivity(mid, activity({ phase: "done", drawn: 0, total: 3 }));
  assert.equal(none.slides.state, "error");
});

test("a refresh mid-step marks what was under way as not finished; waiting stays", () => {
  const flow = { ...newFlow(0), confirm: { state: "waiting" as const } };
  const closed = closeInterrupted(flow);
  assert.equal(closed.outline.state, "error");
  assert.equal(closed.confirm.state, "waiting");
});

test("the live activity belongs to the latest flow message", () => {
  const messages = [
    { role: "assistant", content: flowText(newFlow(0)) },
    { role: "user", content: "再做一份" },
    { role: "assistant", content: flowText(newFlow(0)) },
    { role: "assistant", content: "好的" },
  ];
  assert.equal(latestFlowIndex(messages), 2);
});
