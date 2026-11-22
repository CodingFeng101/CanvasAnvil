import assert from "node:assert/strict";
import { test } from "node:test";
import {
  areaTableMarkdown,
  furnitureMarkdown,
  isBundleCurrent,
  mepMarkdown,
  overviewMarkdown,
  type ReferenceBundle,
} from "../client/workspaces/cad/lib/reference-bundle";
import { extractCadReference } from "../client/workspaces/cad/references";
import { matchReportImages, reportSourceItems } from "../client/workspaces/ppt/canvas/lib/report-images";
import type { CadDesign, RoomArea, SinglePlan } from "../client/workspaces/cad/lib/design/types";

const plan = {
  version: 2,
  name: "三室两厅",
  nodes: [],
  walls: [],
  openings: [],
  rooms: [],
  furniture: [
    { id: "f1", key: "sofa", name: "沙发", x: 500, y: 500 },
    { id: "f2", key: "chair", name: "餐椅", x: 600, y: 600 },
    { id: "f3", key: "chair", name: "餐椅", x: 700, y: 600 },
    { id: "f4", key: "bed", name: "双人床", x: 5000, y: 5000 },
  ],
} as unknown as SinglePlan;
const rooms: RoomArea[] = [
  { name: "客厅", area: 25.04, at: [500, 500], rects: [{ x: 0, y: 0, w: 1000, h: 1000 }] },
  { name: "主卧", area: 14.5, at: [3000, 3000], rects: [{ x: 2000, y: 2000, w: 2000, h: 2000 }] },
];

test("overview and area table read the designer's rooms", () => {
  assert.equal(overviewMarkdown(plan, rooms, "zh"), "# 三室两厅\n- 房间：2 个\n- 室内面积合计：约 39.5 ㎡\n- 家具：4 件");
  assert.equal(areaTableMarkdown(rooms, "zh"), "| 房间 | 面积（㎡） |\n|---|---|\n| 客厅 | 25 |\n| 主卧 | 14.5 |\n| 合计 | 39.5 |");
  assert.equal(areaTableMarkdown([], "zh"), "");
  // Areas in mm² are converted.
  assert.match(overviewMarkdown(plan, [{ name: "厅", area: 20_000_000, at: [0, 0] }], "zh"), /约 20 ㎡/);
});

test("furniture is listed by room, repeats counted", () => {
  assert.equal(furnitureMarkdown(plan, rooms, "zh"), "## 客厅\n- 沙发\n- 餐椅 × 2\n\n## 其他\n- 双人床");
});

test("MEP summary: totals and a room table; nothing without points", () => {
  const text = mepMarkdown({ problems: [], notes: [], rooms: [{ name: "客厅", kind: "living", area: 25, lights: 3, switches: 2, sockets: 6 }], total: { points: 11, lights: 3, switches: 2 } }, "zh");
  assert.equal(text, "点位合计 11 个（灯 3、开关 2）\n\n| 房间 | 灯 | 开关 | 插座 |\n|---|---|---|---|\n| 客厅 | 3 | 2 | 6 |");
  assert.equal(mepMarkdown(null, "zh"), "");
});

const design = (status: CadDesign["status"], revision: number) => ({ plan, revision, status, lastSource: "user", updatedAt: 1 }) as CadDesign;
const bundle: ReferenceBundle = { revision: 3, createdAt: 1, items: [{ id: "cad:overview", kind: "text", label: "户型概况", text: "x" }] };

test("a bundle counts only for a confirmed design at its revision", () => {
  assert.equal(isBundleCurrent(bundle, design("confirmed", 3)), true);
  assert.equal(isBundleCurrent(bundle, design("confirmed", 4)), false);
  assert.equal(isBundleCurrent(bundle, design("draft", 3)), false);
  assert.equal(isBundleCurrent(null, design("confirmed", 3)), false);
});

const storeWith = (values: Record<string, unknown>) => ({
  read: async <T,>(key: string) => (values[key] ?? null) as T | null,
  save: async () => {},
  clear: async () => {},
});

test("referencing a design: blocked until it is confirmed and its bundle is current", async () => {
  let opened = 0;
  const open = () => { opened++; };
  const blocked = async (values: Record<string, unknown>) => {
    const result = await extractCadReference(storeWith(values), "zh", open);
    assert.ok("blocked" in result);
    result.blocked.action?.run();
    return result.blocked.title;
  };
  assert.match(await blocked({}), /还没有户型/);
  assert.match(await blocked({ "cad-design-record": { design: design("draft", 3) } }), /还没确认/);
  assert.match(await blocked({ "cad-design-record": { design: design("confirmed", 4) }, "reference-bundle": bundle }), /交付物还没准备好/);
  assert.equal(opened, 3);
  const ok = await extractCadReference(storeWith({ "cad-design-record": { design: design("confirmed", 3) }, "reference-bundle": bundle }), "zh", open);
  assert.deepEqual(ok, { items: bundle.items, revision: 3 });
});

test("report pictures go to the slide that talks about them", () => {
  const slides = [
    { id: "a", title: "项目概况", content: [] },
    { id: "b", title: "原始户型与改造思路", content: [] },
    { id: "c", title: "平面布置方案", content: [] },
    { id: "d", title: "效果图展示", content: [] },
  ] as never;
  const img = (label: string) => ({ id: label, kind: "image" as const, label, dataUrl: "data:image/png;base64,AA" });
  const { bySlide, unmatched } = matchReportImages(slides, [img("3D 效果图"), img("彩平图"), img("平面布置图"), img("原始户型图"), img("别的图")]);
  assert.deepEqual(Object.fromEntries([...bySlide].map(([id, items]) => [id, items.map((i) => i.label)])), {
    d: ["3D 效果图"],
    c: ["彩平图", "平面布置图"],
    b: ["原始户型图"],
  });
  assert.deepEqual(unmatched.map((i) => i.label), ["别的图"]);
});

test("a report takes the default texts and the quote table, not the drawings or pictures", () => {
  const items = [
    { id: "a", kind: "text", label: "户型概况", text: "x", defaultOn: true },
    { id: "b", kind: "text", label: "家具清单", text: "x", defaultOn: false },
    { id: "c", kind: "file", label: "报价单", dataUrl: "data:text/csv,a", fileName: "家-报价单.csv", defaultOn: true },
    { id: "d", kind: "file", label: "平面图 DXF", dataUrl: "data:,a", fileName: "家.dxf", defaultOn: false },
    { id: "e", kind: "image", label: "彩平图", dataUrl: "data:image/png;base64,", defaultOn: true },
  ] as const;
  assert.deepEqual(reportSourceItems([...items]).map((i) => i.id), ["a", "c"]);
});
test("a canvas references only the canvases it has a use for, never itself", async () => {
  const { referenceSourcesFor } = await import("../client/shared/references/sources");
  for (const ws of ["ppt", "canvas", "diagram", "cad"] as const) assert.ok(!referenceSourcesFor(ws).includes(ws));
  assert.ok(!referenceSourcesFor("diagram").includes("cad"));
  assert.ok(!referenceSourcesFor("canvas").includes("cad"), "the free canvas does not take interior designs");
  assert.deepEqual([...referenceSourcesFor("cad")], []);
  assert.ok(referenceSourcesFor("ppt").includes("cad"));
});
