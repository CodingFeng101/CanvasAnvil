import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeDataUrl, itemToFile, referenceToFiles, safeFileName } from "../client/shared/references/to-files";
import { canvasReferenceItems } from "../client/workspaces/canvas/references";
import { notesMarkdown, outlineMarkdown, pptReferenceItems } from "../client/workspaces/ppt/references";
import { diagramReferenceItems } from "../client/workspaces/diagram/references";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("a data URL decodes to its type and bytes", () => {
  const decoded = decodeDataUrl(PNG);
  assert.equal(decoded?.type, "image/png");
  assert.deepEqual(Array.from(decoded!.bytes.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(decodeDataUrl("data:text/plain,a%20b") && new TextDecoder().decode(decodeDataUrl("data:text/plain,a%20b")!.bytes), "a b");
  assert.equal(decodeDataUrl("https://example.com/a.png"), null);
});

test("file names lose characters file systems refuse", () => {
  assert.equal(safeFileName('a/b:c*"d'), "a b c d");
  assert.equal(safeFileName("  "), "reference");
});

test("referenced items become files: text as Markdown, pictures with their type", async () => {
  const files = referenceToFiles({
    workspace: "ppt",
    workId: "w1",
    workName: "季度汇报",
    items: [
      { id: "o", kind: "text", label: "大纲", text: "## 第 1 页" },
      { id: "s", kind: "image", label: "第 1 页", dataUrl: PNG },
      { id: "empty", kind: "text", label: "讲稿", text: "  " },
    ],
  });
  assert.deepEqual(files.map((f) => [f.name, f.type]), [
    ["季度汇报 · 大纲.md", "text/markdown"],
    ["季度汇报 · 第 1 页.png", "image/png"],
  ]);
  assert.equal(await files[0].text(), "## 第 1 页");
  assert.equal(itemToFile({ workName: "" }, { id: "x", kind: "image", label: "x" }), null);
});

test("free canvas: pictures grouped by lineage, the latest version ticked", () => {
  const items = canvasReferenceItems(
    {
      elements: [
        { id: "a1", type: "image", fileId: "f1", customData: { canvasAnvil: { lineageId: "L", createdAt: 1, note: "一只猫" } } },
        { id: "a2", type: "image", fileId: "f2", customData: { canvasAnvil: { lineageId: "L", createdAt: 2, note: "改成蓝色" } } },
        { id: "b", type: "image", fileId: "f3" },
        { id: "gone", type: "image", fileId: "f1", isDeleted: true },
        { id: "arrow", type: "arrow" },
      ],
      files: { f1: { dataURL: PNG }, f2: { dataURL: PNG }, f3: { dataURL: PNG } },
    },
    "zh",
  );
  assert.deepEqual(items.map((i) => [i.label, !!i.defaultOn, i.group]), [
    ["一只猫 · 版本 1", false, "canvas:L"],
    ["一只猫 · 版本 2", true, "canvas:L"],
    ["图片 2", true, undefined],
  ]);
});

test("PPT: outline and notes as text, each slide's current picture ticked, earlier versions offered", () => {
  const slides = [
    { id: "s1", title: "封面", content: ["标题", " "], note: "开场白" },
    { id: "s2", title: "", content: ["要点"] },
  ] as never;
  assert.equal(outlineMarkdown(slides, "zh"), "## 第 1 页 · 封面\n- 标题\n\n## 第 2 页\n- 要点");
  assert.equal(notesMarkdown(slides, "zh"), "## 第 1 页 · 封面\n开场白");
  const items = pptReferenceItems(
    {
      localSlides: slides,
      imageVersions: {
        s1: [
          { id: "v1", url: "data:image/png;base64,AAAA" },
          { id: "v2", url: PNG },
          { id: "t", url: "data:image/png;base64,BBBB", type: "derived_textless" },
        ] as never,
      },
      currentImageVersionId: { s1: "v2" },
      generatedImages: { s2: PNG },
      slideMaterials: { s2: [{ id: "m", name: "logo", dataUrl: PNG }] as never },
    },
    "zh",
  );
  assert.deepEqual(items.map((i) => [i.label, i.kind, !!i.defaultOn]), [
    ["大纲", "text", true],
    ["讲稿", "text", false],
    ["第 1 页 · 封面", "image", true],
    ["第 1 页 · 封面 · 历史版本 1", "image", false],
    ["第 2 页", "image", true],
    ["第 2 页 · logo", "image", false],
  ]);
});

test("diagram: current diagram and distinct earlier versions, empty ones skipped, rendered on demand", () => {
  const cell = (id: string) => `<mxGraphModel><root><mxCell id="${id}" vertex="1"/></root></mxGraphModel>`;
  const empty = "<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>";
  const items = diagramReferenceItems(cell("c"), [[0, empty], [1, cell("a")], [2, cell("b")], [3, cell("c")]], "zh", "thumb");
  assert.deepEqual(items.map((i) => [i.label, !!i.defaultOn, !!i.resolve, i.dataUrl]), [
    ["当前图表", true, true, undefined],
    ["历史版本 2", false, true, undefined],
    ["历史版本 1", false, true, undefined],
  ]);
  assert.equal(items[0].thumb, "thumb");
  assert.deepEqual(diagramReferenceItems(empty, [], "zh"), []);
});
