import assert from "node:assert/strict";
import { test } from "node:test";
import { designMark, designMarkOf, stripCadMarkers, stripDesignMark } from "../client/workspaces/cad/chat/cad-steps-text";

test("a turn's design mark is read back, never shown and never sent to the model", () => {
  const text = `[[CAD_STEPS|generate|done]]\n户型已画好${designMark("3:100")}`;
  assert.equal(designMarkOf(text), "3:100");
  assert.equal(stripDesignMark(text), "[[CAD_STEPS|generate|done]]\n户型已画好");
  assert.equal(stripCadMarkers(text), "户型已画好");
  assert.equal(designMarkOf("没有标记"), undefined);
  // Marked again: the last one counts.
  assert.equal(designMarkOf(`${text}${designMark("4:200")}`), "4:200");
});
