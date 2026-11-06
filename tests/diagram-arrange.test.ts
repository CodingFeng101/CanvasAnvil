import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { arrangeDiagramXml, parseLayout, tidyIfBetter } from "../client/workspaces/diagram/lib/arrange";
import { elkLayoutXml } from "../client/workspaces/diagram/lib/elk-layout";
import { alignmentKept, lintDiagramXml, orderKept } from "../client/workspaces/diagram/lib/layout-lint";
import { readDiagramModel } from "../client/workspaces/diagram/lib/tidy-layout";

/**
 * Choosing a layout: as drawn, tidied, or laid out by ELK. Whatever is
 * chosen never scores below the drawing, and a full layout is only used
 * when it keeps the drawing's arrangement.
 */

const wrap = (cells: string) =>
  `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
const shape = (id: string, x: number, y: number, w = 120, h = 60, parent = "1", extra = "") =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;whiteSpace=wrap;html=1;${extra}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, source: string, target: string) =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

// A top-down flow drawn a little crooked, with one shape crowding another.
const crooked = wrap(
  shape("a", 100, 40) +
    shape("b", 108, 150) +
    shape("c", 30, 260) +
    shape("d", 190, 262) +
    shape("e", 112, 330) +
    edge("e1", "a", "b") +
    edge("e2", "b", "c") +
    edge("e3", "b", "d") +
    edge("e4", "c", "e") +
    edge("e5", "d", "e"),
);

test("parseLayout treats unknown values as auto", () => {
  assert.equal(parseLayout("flow-down"), "flow-down");
  assert.equal(parseLayout("diagonal"), "auto");
  assert.equal(parseLayout(undefined), "auto");
});

test("the arranged diagram never scores below the drawing", async () => {
  for (const xml of [crooked, fixture("diagram-ecommerce.drawio"), fixture("diagram-rag.drawio")]) {
    for (const layout of ["auto", "flow-down", "flow-right", "swimlane"] as const) {
      const r = await arrangeDiagramXml(xml, layout);
      assert.ok(lintDiagramXml(r.xml).score >= lintDiagramXml(xml).score, `${layout}: ${r.chosen}`);
    }
  }
});

test("kinds whose geometry means something only get the tidy pass", async () => {
  for (const layout of ["swimlane", "sequence", "timeline", "free"] as const) {
    const r = await arrangeDiagramXml(crooked, layout);
    assert.ok(r.chosen === "tidy" || r.chosen === "original", `${layout} chose ${r.chosen}`);
  }
});

test("a declared direction is the only one ELK tries", async () => {
  const r = await arrangeDiagramXml(crooked, "flow-right");
  assert.ok(["tidy", "original", "layered-right"].includes(r.chosen), r.chosen);
});

test("ELK lays out a flow without overlaps, keeping every cell", async () => {
  const r = await elkLayoutXml(crooked, "layered-down");
  assert.equal(r.report.applied, true, r.report.reason);
  const lint = lintDiagramXml(r.xml);
  assert.equal(lint.errors, 0, JSON.stringify(lint.issues));
  assert.deepEqual([...readDiagramModel(r.xml).shapes.keys()].sort(), ["a", "b", "c", "d", "e"]);
  assert.ok(orderKept(crooked, r.xml) >= 0.85);
});

test("ELK keeps shapes inside their containers, below the container's title", async () => {
  const xml = wrap(
    shape("g", 40, 40, 400, 220, "1", "container=1;") +
      `<mxCell id="gt" value="Group" style="text;html=1;" vertex="1" parent="g"><mxGeometry x="150" y="5" width="100" height="20" as="geometry"/></mxCell>` +
      shape("a", 20, 50, 120, 60, "g") +
      shape("b", 220, 140, 120, 60, "g") +
      shape("c", 520, 100) +
      edge("e1", "a", "b") +
      edge("e2", "b", "c"),
  );
  const r = await elkLayoutXml(xml, "layered-right");
  assert.equal(r.report.applied, true, r.report.reason);
  const shapes = readDiagramModel(r.xml).shapes;
  const g = shapes.get("g")!.box;
  const title = shapes.get("gt")!.box;
  for (const id of ["a", "b"]) {
    const b = shapes.get(id)!.box;
    assert.ok(b.x >= g.x && b.x + b.w <= g.x + g.w && b.y >= g.y && b.y + b.h <= g.y + g.h, `${id} escaped`);
    assert.ok(b.y >= title.y + title.h, `${id} under the title`);
  }
  assert.equal(lintDiagramXml(r.xml).errors, 0);
});

test("tidyIfBetter keeps the drawing when tidying would score lower", () => {
  for (const xml of [crooked, fixture("diagram-ecommerce.drawio")]) {
    const r = tidyIfBetter(xml);
    assert.ok(lintDiagramXml(r.xml).score >= lintDiagramXml(xml).score);
  }
});

test("alignmentKept and orderKept are 1 for an unchanged diagram and drop when broken", () => {
  assert.equal(alignmentKept(crooked, crooked), 1);
  assert.equal(orderKept(crooked, crooked), 1);
  const row = wrap(shape("a", 0, 0) + shape("b", 200, 0) + shape("c", 400, 0));
  const broken = wrap(shape("a", 400, 0) + shape("b", 200, 90) + shape("c", 0, 0));
  assert.ok(alignmentKept(row, broken) < 0.5);
  assert.ok(orderKept(row, broken) < 0.5);
});
