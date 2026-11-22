import assert from "node:assert/strict";
import { test } from "node:test";
import { askKindText, detectCreationKind, needsKindChoice, readAskKind } from "../client/workspaces/ppt/lib/creation-intent";

test("a PDF sent without a word is asked about, not guessed", () => {
  assert.equal(needsKindChoice("", ["deck.pdf"]), true);
  // A referenced design: its note, its texts and its drawing set.
  assert.equal(needsKindChoice("  ", ["三口之家.md", "三口之家-施工图.pdf"]), true);
  assert.equal(needsKindChoice("", ["notes.md"]), false, "no PDF: nothing to restyle, so nothing to ask");
  assert.equal(needsKindChoice("做个汇报", ["施工图.pdf"]), false, "the words say it");
});

test("the words decide once there are some", () => {
  assert.equal(detectCreationKind("帮我美化一下", ["deck.pdf"]), "beautify");
  assert.equal(detectCreationKind("根据这份资料做个汇报", ["施工图.pdf"]), "idea");
});

test("the question round-trips as a message", () => {
  assert.deepEqual(readAskKind(askKindText({})), {});
  assert.deepEqual(readAskKind(askKindText({ picked: "idea" })), { picked: "idea" });
  assert.equal(readAskKind("正在写大纲"), null);
});
