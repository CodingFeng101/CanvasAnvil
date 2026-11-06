import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lintDiagramXml } from "../client/workspaces/diagram/lib/layout-lint";
import { tidyDiagramXml } from "../client/workspaces/diagram/lib/tidy-layout";

/**
 * The layout check scores any diagram on rules every readable diagram keeps.
 * Each rule is shown on a small diagram built for it, so the rules are not
 * tied to the kinds of diagram the fixtures happen to be.
 */

const wrap = (cells: string) =>
  `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;

const shape = (id: string, x: number, y: number, w = 120, h = 60, extra = "", value = id, parent = "1") =>
  `<mxCell id="${id}" value="${value}" style="rounded=1;whiteSpace=wrap;html=1;${extra}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

const ORTHO = "edgeStyle=orthogonalEdgeStyle;html=1;";
const edge = (id: string, source: string, target: string, style = ORTHO, points = "") =>
  `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${points ? `<Array as="points">${points}</Array>` : ""}</mxGeometry></mxCell>`;

const rules = (xml: string) => lintDiagramXml(xml).issues.map((i) => i.rule).sort();

test("a clean diagram scores 100", () => {
  const xml = wrap(shape("a", 0, 0) + shape("b", 0, 120) + shape("c", 200, 120) + edge("e1", "a", "b") + edge("e2", "b", "c"));
  const report = lintDiagramXml(xml);
  assert.deepEqual(report.issues, []);
  assert.equal(report.score, 100);
});

test("shapes on top of each other are an error", () => {
  const xml = wrap(shape("a", 0, 0) + shape("b", 60, 20));
  assert.deepEqual(rules(xml), ["overlap"]);
  assert.ok(lintDiagramXml(xml).score < 100);
});

test("a shape hanging out of its container is an error", () => {
  const xml = wrap(
    shape("lane", 0, 0, 300, 200, "container=1;") +
      shape("in", 20, 40, 120, 60, "", "in", "lane") +
      shape("out", 240, 40, 120, 60, "", "out", "lane"),
  );
  assert.deepEqual(lintDiagramXml(xml).issues.map((i) => i.ids), [["out", "lane"]]);
});

test("containers that overlap without nesting are an error", () => {
  const xml = wrap(
    shape("g1", 0, 0, 300, 200, "container=1;") +
      shape("g2", 0, 160, 300, 200, "container=1;") +
      shape("a", 20, 40, 120, 60, "", "a", "g1") +
      shape("b", 20, 80, 120, 60, "", "b", "g2"),
  );
  assert.ok(rules(xml).includes("container-overlap"));
  // Nested containers are fine.
  const nested = wrap(
    shape("outer", 0, 0, 400, 300, "container=1;") +
      shape("inner", 20, 40, 200, 150, "container=1;", "inner", "outer") +
      shape("a", 20, 40, 120, 60, "", "a", "inner"),
  );
  assert.deepEqual(rules(nested), []);
});

test("a line through a shape is an error, a line round it is not", () => {
  const through = wrap(shape("a", 0, 0) + shape("mid", 200, 0) + shape("b", 400, 0) + edge("e", "a", "b"));
  assert.deepEqual(rules(through), ["edge-through-shape"]);
  const around = wrap(
    shape("a", 0, 0) +
      shape("mid", 200, 0) +
      shape("b", 400, 0) +
      edge("e", "a", "b", `${ORTHO}exitX=0.5;exitY=0;entryX=0.5;entryY=0;`, '<mxPoint x="60" y="-40"/><mxPoint x="460" y="-40"/>'),
  );
  assert.deepEqual(rules(around), []);
});

test("text that cannot fit its shape is flagged", () => {
  const long = "这是一段很长很长的说明文字，放在一个很小的框里面肯定放不下";
  assert.deepEqual(rules(wrap(shape("a", 0, 0, 80, 30, "", long))), ["text-overflow"]);
  assert.deepEqual(rules(wrap(shape("a", 0, 0, 300, 120, "", long))), []);
  // Icons carry their label below the shape.
  const icon = shape("i", 0, 0, 48, 48, "verticalLabelPosition=bottom;", long);
  assert.deepEqual(rules(wrap(icon)), []);
});

test("an edge missing an end is flagged", () => {
  const xml = wrap(shape("a", 0, 0) + edge("e", "a", "ghost"));
  assert.deepEqual(rules(xml), ["dangling-edge"]);
});

test("connected shapes a few pixels off one line are a near-miss", () => {
  const xml = wrap(shape("a", 0, 0) + shape("b", 9, 120) + edge("e", "a", "b"));
  assert.deepEqual(rules(xml), ["near-miss"]);
  // Clearly offset shapes are a deliberate layout, not a slip.
  assert.deepEqual(rules(wrap(shape("a", 0, 0) + shape("b", 200, 120) + edge("e", "a", "b"))), []);
  // Curved edges have no line to miss.
  assert.deepEqual(rules(wrap(shape("a", 0, 0) + shape("b", 9, 120) + edge("e", "a", "b", "curved=1;"))), []);
});

test("crossing lines and bends lower the score without being errors", () => {
  const xml = wrap(
    shape("a", 0, 0) + shape("b", 300, 200) + shape("c", 300, 0) + shape("d", 0, 200) +
      edge("e1", "a", "b", "html=1;") + edge("e2", "c", "d", "html=1;"),
  );
  const report = lintDiagramXml(xml);
  assert.equal(report.metrics.crossings, 1);
  assert.equal(report.errors, 0);
  assert.ok(report.score < 100);
});

test("the tidy pass never lowers the score of the fixtures", () => {
  for (const name of ["diagram-ecommerce", "diagram-rag"]) {
    const xml = readFileSync(new URL(`./fixtures/${name}.drawio`, import.meta.url), "utf8");
    const before = lintDiagramXml(xml);
    const after = lintDiagramXml(tidyDiagramXml(xml).xml);
    assert.ok(after.score > before.score, `${name}: ${before.score} -> ${after.score}`);
    assert.equal(after.errors, 0, `${name} has no errors once tidied`);
  }
});

test("broken input scores without throwing", () => {
  for (const input of ["", "not xml", "<mxCell id="]) {
    assert.equal(lintDiagramXml(input).score, 100);
  }
});

test("lines drawn as shapes and anchor points are not boxes", () => {
  const lifeline = `<mxCell id="ll" value="" style="shape=line;direction=south;dashed=1;html=1;" vertex="1" parent="1"><mxGeometry x="100" y="0" width="1" height="400" as="geometry"/></mxCell>`;
  const anchor = `<mxCell id="pt" value="a long message label" style="ellipse;opacity=0;" vertex="1" parent="1"><mxGeometry x="100" y="150" width="1" height="1" as="geometry"/></mxCell>`;
  const xml = wrap(shape("frame", 20, 100, 300, 120, "container=1;") + lifeline + anchor);
  const lint = lintDiagramXml(xml);
  assert.deepEqual(lint.issues, []);
});
