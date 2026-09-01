import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleDisplay,
  assemblePrompt,
  buildContextAttachments,
  buildImageTags,
  safeTagText,
  type Attachment,
} from "../client/workspaces/cad/lib/chat-prompt";

/**
 * A CAD turn produces two texts from the same input: the prompt the model
 * reads and the message the transcript shows. They differ on purpose, so the
 * user is not shown the extracted file text and the model is not shown the
 * image markers.
 */

const sections = (over: Partial<Parameters<typeof assemblePrompt>[0]> = {}) => ({
  rawInput: "",
  fileTexts: [],
  contextAttachments: "",
  cadContext: "",
  history: "",
  ...over,
});

test("the sections join in a fixed order", () => {
  const prompt = assemblePrompt(
    sections({
      rawInput: "make it wider",
      fileTexts: ["[File: a.txt]\nAAA"],
      contextAttachments: "[Context 1: b.json | json]",
      cadContext: "Current 2D SVG:",
      history: "Recent chat history:",
    }),
  );
  const order = ["make it wider", "[File: a.txt]", "[Context 1:", "Current 2D SVG:", "Recent chat history:"];
  const positions = order.map((needle) => prompt.indexOf(needle));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, prompt);
  assert.ok(positions.every((p) => p >= 0));
});

test("empty sections leave no blank gaps", () => {
  const prompt = assemblePrompt(sections({ rawInput: "hello", history: "history" }));
  assert.equal(prompt, "hello\n\nhistory", "no run of blank lines where sections were skipped");
});

test("a turn with nothing in it produces nothing", () => {
  assert.equal(assemblePrompt(sections()), "");
});

test("several files are separated from each other", () => {
  const prompt = assemblePrompt(sections({ fileTexts: ["one", "two"] }));
  assert.equal(prompt, "one\n\ntwo");
});

test("the transcript shows images, the words typed, and the files", () => {
  const display = assembleDisplay("[[IMAGE|a.png|data:x]]", "look at this", ["[PDF: r.pdf]\ntext"]);
  assert.ok(display.indexOf("[[IMAGE") < display.indexOf("look at this"));
  assert.ok(display.indexOf("look at this") < display.indexOf("[PDF: r.pdf]"));
});

test("a turn with only text shows only text", () => {
  assert.equal(assembleDisplay("", "just words", []), "just words");
});

const attachment = (over: Partial<Attachment> = {}): Attachment => ({
  id: "a1",
  name: "notes.txt",
  type: "text",
  content: "body",
  ...over,
});

test("an attachment is fenced with its own type", () => {
  const out = buildContextAttachments([attachment({ type: "json", content: "{}" })]);
  assert.ok(out.startsWith("[Context 1: notes.txt | json]"), out);
  assert.ok(out.includes("```json\n{}\n```"), out);
});

test("attachments are numbered as the user sees them", () => {
  const out = buildContextAttachments([attachment({ name: "a" }), attachment({ name: "b" })]);
  assert.ok(out.includes("[Context 1: a"), out);
  assert.ok(out.includes("[Context 2: b"), out);
});

test("only the first twelve attachments are carried", () => {
  // Everything here is spent from the model's context window.
  const many = Array.from({ length: 20 }, (_, i) => attachment({ id: `a${i}`, name: `f${i}` }));
  const out = buildContextAttachments(many);
  assert.ok(out.includes("f11"), "the twelfth is kept");
  assert.ok(!out.includes("f12"), "the thirteenth is not");
});

test("one huge paste cannot crowd out the question", () => {
  const out = buildContextAttachments([attachment({ content: "x".repeat(50_000) })]);
  assert.ok(out.length < 13_000, `expected a capped body, got ${out.length}`);
});

test("no attachments means no section at all", () => {
  assert.equal(buildContextAttachments([]), "");
});

test("a filename cannot break the image marker", () => {
  // The name comes from a file, so it can contain anything; a pipe or a `]]`
  // would end the marker early and leave the rest as junk in the transcript.
  assert.equal(safeTagText("a|b"), "a,b");
  assert.equal(safeTagText("weird]]name"), "weirdname");
  assert.equal(safeTagText("two\nlines"), "two lines");
  assert.equal(safeTagText(""), "");
});

test("one marker per image, one per line", () => {
  const tags = buildImageTags([
    { name: "a.png", url: "data:1" },
    { name: "b|c.png", url: "data:2" },
  ]);
  assert.deepEqual(tags.split("\n"), ["[[IMAGE|a.png|data:1]]", "[[IMAGE|b,c.png|data:2]]"]);
});

test("no images means no markers", () => {
  assert.equal(buildImageTags([]), "");
});
