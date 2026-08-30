import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyFlowRequest,
  isExplicitFullRegenerationRequest,
  isLikelyLocalEditRequest,
  normalizeIntentText,
  shouldRunDeepThinking,
} from "../server/chat/intent";

/**
 * Routing a Flow turn wrong is destructive: choosing full_generation for what
 * was meant as a tweak replaces the user's diagram. These pin the decision.
 */

const EMPTY_DIAGRAM = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
const DIAGRAM_WITH_CONTENT =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="2" value="Start" vertex="1" parent="1"/></root></mxGraphModel>';

test("normalizeIntentText lowercases and collapses whitespace", () => {
  assert.equal(normalizeIntentText("  Add   a\tNODE\n"), "add a node");
  assert.equal(normalizeIntentText(""), "");
  assert.equal(normalizeIntentText(null as unknown as string), "");
});

test("recognises local edits in both languages", () => {
  for (const text of ["把这个节点改成红色", "删除第二个框", "调整一下连线", "add a node", "remove the arrow", "rename that box"]) {
    assert.equal(isLikelyLocalEditRequest(text), true, text);
  }
});

test("does not mistake an unrelated sentence for an edit", () => {
  assert.equal(isLikelyLocalEditRequest("这是什么"), false);
  assert.equal(isLikelyLocalEditRequest("what does this show"), false);
  assert.equal(isLikelyLocalEditRequest(""), false);
});

test("recognises an explicit request to start over", () => {
  for (const text of ["重新生成一张", "从头画一个", "整体重构", "regenerate this", "redraw it from scratch", "create a new diagram"]) {
    assert.equal(isExplicitFullRegenerationRequest(text), true, text);
  }
});

test("an edit phrase alone is not a regeneration request", () => {
  assert.equal(isExplicitFullRegenerationRequest("改成蓝色"), false);
  assert.equal(isExplicitFullRegenerationRequest("add a node"), false);
});

test("an empty canvas always routes to full generation", () => {
  // Nothing to preserve, so the wording of the request cannot matter.
  assert.equal(classifyFlowRequest({ xml: "", userText: "改一下颜色" }), "full_generation");
  assert.equal(classifyFlowRequest({ xml: EMPTY_DIAGRAM, userText: "add a node" }), "full_generation");
});

test("an explicit regeneration request wins over the edit heuristics", () => {
  // "修改" reads as a local edit; "重新生成" has to override it, or the user
  // asking to start over gets a patch instead.
  assert.equal(
    classifyFlowRequest({ xml: DIAGRAM_WITH_CONTENT, userText: "重新生成，不要修改原来的" }),
    "full_generation",
  );
});

test("anything else on a non-empty canvas stays a local edit", () => {
  for (const text of ["改成红色", "这是什么", "", "explain this diagram"]) {
    assert.equal(classifyFlowRequest({ xml: DIAGRAM_WITH_CONTENT, userText: text }), "local_edit", text);
  }
});

test("classification ignores isLikelyLocalEditRequest entirely", () => {
  // Both remaining branches return local_edit, so the helper does not affect
  // the outcome. Pinned so that removing the branch is a deliberate choice
  // rather than a silent behaviour change.
  const recognised = "add a node";
  const unrecognised = "这是什么";
  assert.equal(isLikelyLocalEditRequest(recognised), true);
  assert.equal(isLikelyLocalEditRequest(unrecognised), false);
  assert.equal(
    classifyFlowRequest({ xml: DIAGRAM_WITH_CONTENT, userText: recognised }),
    classifyFlowRequest({ xml: DIAGRAM_WITH_CONTENT, userText: unrecognised }),
  );
});

test("deep thinking runs only for a full generation the user asked for", () => {
  assert.equal(shouldRunDeepThinking({ deepThinkingEnabled: true, route: "full_generation" }), true);
  assert.equal(shouldRunDeepThinking({ deepThinkingEnabled: true, route: "local_edit" }), false);
  assert.equal(shouldRunDeepThinking({ deepThinkingEnabled: false, route: "full_generation" }), false);
});
