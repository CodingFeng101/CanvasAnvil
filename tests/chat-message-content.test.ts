import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMessageTextContent,
  getUserOriginalText,
  splitTextIntoFileSections,
  type UIMessage,
} from "../client/shared/chat/message-content";
import {
  extractImageTags,
  extractPptSlideTags,
  extractPptToolPayload,
  getSlideNumber,
  slideFieldLabel,
  slidePatchEntries,
  splitInlinePptTags,
} from "../client/shared/chat/ppt-message-tags";

/**
 * The readers every workspace transcript runs over a message before showing
 * it. All three chat panels append uploaded file contents to what the user
 * typed, and the PPT one embeds slide markers in the text; getting either
 * wrong shows the user raw machinery instead of their own words.
 */

test("a message with no attachments comes back as one text section", () => {
  const sections = splitTextIntoFileSections("just a question");
  assert.deepEqual(sections, [{ type: "text", content: "just a question" }]);
});

test("an appended file becomes its own section with a character count", () => {
  const sections = splitTextIntoFileSections("summarise this\n\n[PDF: report.pdf]\nthe extracted text");
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0], { type: "text", content: "summarise this" });
  assert.equal(sections[1].type, "file");
  assert.equal(sections[1].filename, "report.pdf");
  assert.equal(sections[1].fileType, "pdf");
  assert.equal(sections[1].content, "the extracted text");
  assert.equal(sections[1].charCount, "the extracted text".length, "the count the header shows");
});

test("several attachments each get their own section", () => {
  const sections = splitTextIntoFileSections(
    "look\n\n[File: a.txt]\nAAA\n\n[File: b.txt]\nBBB",
  );
  assert.deepEqual(
    sections.map((s) => s.filename ?? s.type),
    ["text", "a.txt", "b.txt"],
  );
});

test("a non-pdf attachment is typed as text", () => {
  const [section] = splitTextIntoFileSections("[File: notes.md]\nhello");
  assert.equal(section.fileType, "text");
});

test("an empty message is not turned into nothing", () => {
  assert.deepEqual(splitTextIntoFileSections(""), [{ type: "text", content: "" }]);
});

test("text is read from streaming parts", () => {
  const message: UIMessage = {
    id: "1",
    role: "assistant",
    parts: [
      { type: "text", text: "hello" },
      { type: "tool-call", toolCallId: "x" },
      { type: "text", text: "world" },
    ],
  };
  assert.equal(getMessageTextContent(message), "hello\nworld", "non-text parts are skipped");
});

test("text is read from a multimodal content array", () => {
  // The shape a message takes once it has been sent with an image attached.
  const message: UIMessage = {
    id: "1",
    role: "user",
    content: [
      { type: "text", text: "what is this" },
      { type: "image", image: "data:image/png;base64,x" },
    ] as unknown[],
  };
  assert.equal(getMessageTextContent(message), "what is this");
});

test("text is read from a plain string content", () => {
  assert.equal(getMessageTextContent({ id: "1", role: "user", content: "plain" }), "plain");
});

test("a message with nothing in it reads as empty", () => {
  assert.equal(getMessageTextContent({ id: "1", role: "user" }), "");
  assert.equal(getMessageTextContent({ id: "1", role: "assistant", parts: [] }), "");
});

test("the user's own words are recovered from an attachment-laden message", () => {
  const message: UIMessage = {
    id: "1",
    role: "user",
    content: "summarise this\n\n[PDF: report.pdf]\npages and pages of text",
  };
  assert.equal(getUserOriginalText(message), "summarise this", "editing shows what was typed");
});

test("a message without attachments is returned whole", () => {
  assert.equal(getUserOriginalText({ id: "1", role: "user", content: "  hi  " }), "hi");
});

test("slide markers on their own line are lifted out of the text", () => {
  const { tags, rest } = extractPptSlideTags("[[PPT_SLIDE|2|Revenue|outline]]\nplease redo this");
  assert.deepEqual(tags, [{ n: 2, title: "Revenue", kind: "outline" }]);
  assert.equal(rest, "please redo this");
});

test("a marker from before kind existed still reads as a slide image", () => {
  const { tags } = extractPptSlideTags("[[PPT_SLIDE|3|Old Title]]");
  assert.deepEqual(tags, [{ n: 3, title: "Old Title", kind: "slide_image" }]);
});

test("a marker with no title keeps the slide number", () => {
  const { tags } = extractPptSlideTags("[[PPT_SLIDE|4||outline]]");
  assert.deepEqual(tags, [{ n: 4, title: undefined, kind: "outline" }]);
});

test("image markers are lifted out, and only for renderable urls", () => {
  const { images, rest } = extractImageTags(
    ["[[IMAGE|shot|data:image/png;base64,AAA]]", "[[IMAGE|bad|javascript:alert(1)]]", "text"].join("\n"),
  );
  assert.deepEqual(images, [{ name: "shot", url: "data:image/png;base64,AAA" }]);
  assert.ok(rest.includes("javascript:alert(1)"), "a rejected marker stays as text rather than rendering");
  assert.ok(rest.includes("text"));
});

test("a marker mid-sentence splits into text and a chip", () => {
  const parts = splitInlinePptTags("please fix [[PPT_SLIDE|2|Revenue|outline]] today");
  assert.deepEqual(parts, [
    { type: "text", text: "please fix " },
    { type: "ppt", n: 2, title: "Revenue", kind: "outline" },
    { type: "text", text: " today" },
  ]);
});

test("a title containing a pipe survives the split", () => {
  // Only a trailing known kind is treated as the kind, so titles keep theirs.
  const parts = splitInlinePptTags("[[PPT_SLIDE|1|A|B|slide_image]]");
  assert.deepEqual(parts, [{ type: "ppt", n: 1, title: "A|B", kind: "slide_image" }]);
});

test("text with no markers comes back as a single run", () => {
  assert.deepEqual(splitInlinePptTags("nothing here"), [{ type: "text", text: "nothing here" }]);
});

test("a slide-edit payload is read whether fenced or bare", () => {
  const slides = '{"type":"ppt_edit","slides":[{"id":"slide-2","title":"New"}]}';
  for (const raw of [slides, "Sure!\n```json\n" + slides + "\n```"]) {
    const payload = extractPptToolPayload(raw);
    assert.equal(payload?.slides[0].title, "New", raw);
  }
});

test("a naked array of slides counts as an edit payload", () => {
  const payload = extractPptToolPayload('[{"id":"slide-1","title":"A"}]');
  assert.equal(payload?.type, "ppt_edit");
  assert.equal(payload?.slides.length, 1);
});

test("anything that is not a slide edit is refused", () => {
  assert.equal(extractPptToolPayload(""), null);
  assert.equal(extractPptToolPayload("just prose"), null);
  assert.equal(extractPptToolPayload('{"type":"cad_patch","edits":[]}'), null, "another tool's payload");
  assert.equal(extractPptToolPayload('{"type":"ppt_edit","slides":[]}'), null, "nothing to apply");
});

test("the slide number comes from the id, and falls back to position", () => {
  assert.equal(getSlideNumber({ id: "slide-7" }, 0), 7);
  assert.equal(getSlideNumber({ id: "cover" }, 3), 4, "1-based position");
  assert.equal(getSlideNumber({}, 0), 1);
});

test("a patch is flattened into rows in a readable order", () => {
  const rows = slidePatchEntries({ id: "slide-1", note: "n", title: "T", content: ["a", "b"] });
  assert.deepEqual(
    rows.map((r) => r.key),
    ["title", "note", "content"],
    "known fields come first, in their own order",
  );
  assert.equal(rows[2].value, "a；b");
});

test("an empty field is shown as empty rather than dropped", () => {
  const rows = slidePatchEntries({ title: "", content: [] });
  assert.equal(rows.find((r) => r.key === "title")?.value, "（空）");
  assert.equal(rows.find((r) => r.key === "content")?.value, "（空）");
});

test("a field the model invented is still shown", () => {
  const rows = slidePatchEntries({ id: "slide-1", surprise: "value" });
  assert.deepEqual(rows, [{ key: "surprise", value: "value" }]);
});

test("field labels follow the language and fall back to the key", () => {
  assert.equal(slideFieldLabel("title", "zh"), "标题");
  assert.equal(slideFieldLabel("title", "en"), "Title");
  assert.equal(slideFieldLabel("surprise", "en"), "surprise");
});
