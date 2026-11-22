import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsReferenceItem } from "../client/shared/references/sources";

test("a diagram takes only a deck's outline; other canvases take everything", () => {
  const outline = { id: "ppt:outline", kind: "text" as const, label: "大纲" };
  const notes = { id: "ppt:notes", kind: "text" as const, label: "讲稿" };
  const slide = { id: "ppt:slide:1", kind: "image" as const, label: "第 1 页" };
  assert.equal(acceptsReferenceItem("diagram", "ppt", outline), true);
  assert.equal(acceptsReferenceItem("diagram", "ppt", notes), false);
  assert.equal(acceptsReferenceItem("diagram", "ppt", slide), false);
  assert.equal(acceptsReferenceItem("canvas", "ppt", slide), true);
});
