import assert from "node:assert/strict";
import { test as fileTest } from "node:test";
import { isReferenceFile } from "../client/shared/references/message-marker";

fileTest("a work's other files fold into its card; unrelated files stay", () => {
  const refs = [{ workspace: "cad" as const, workName: "两室一厅 80㎡，三口之家", labels: [], text: "" }];
  assert.equal(isReferenceFile("两室一厅 80㎡，三口之家 · 面积表.md", "| 房间 |", refs), true);
  assert.equal(isReferenceFile("notes.md", "hello", refs), false);
  assert.equal(isReferenceFile("x.md", "[[WORK_REF|cad|a|b]]\ntext", []), true);
});
import { test } from "node:test";
import { splitTextIntoFileSections } from "../client/shared/chat/message-content";
import { readReference, referenceMarker } from "../client/shared/references/message-marker";
import { referenceToChatFiles } from "../client/shared/references/to-files";
import type { WorkReference } from "../client/shared/references/types";

const reference = {
  workspace: "cad",
  workId: "w1",
  workName: "两室一厅 80㎡",
  items: [
    { kind: "text", label: "设计方案", text: "三口之家，南北通透。" },
    { kind: "image", label: "户型图", dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
  ],
} as unknown as WorkReference;

test("a referenced work's text carries its marker and reads back from a sent message", async () => {
  const files = referenceToChatFiles(reference);
  const text = files.find((file) => file.type === "text/markdown")!;
  const message = `做一份汇报\n\n[File: ${text.name}]\n${await text.text()}`;
  const section = splitTextIntoFileSections(message).find((s) => s.type === "file")!;
  const read = readReference(section.content);
  assert.equal(read?.workspace, "cad");
  assert.equal(read?.workName, "两室一厅 80㎡");
  assert.deepEqual(read?.labels, ["设计方案", "户型图"]);
  assert.equal(read?.text, "三口之家，南北通透。");
});

test("a reference without text still gets a marker note; ordinary files read as no reference", async () => {
  const onlyImage = { ...reference, items: [reference.items[1]] } as WorkReference;
  const files = referenceToChatFiles(onlyImage);
  assert.equal(files.length, 2);
  assert.ok(readReference(await files[0].text()));
  assert.equal(readReference("# 普通文件\n内容"), null);
  assert.match(referenceMarker({ ...reference, workName: "a|b]c" }), /^\[\[WORK_REF\|cad\|a b c\|/);
});
