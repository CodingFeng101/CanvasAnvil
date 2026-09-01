import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoFixXml,
  convertToLegalXml,
  formatXML,
  validateMxCellStructure,
  wrapWithMxFile,
} from "../client/workspaces/flow/lib/drawio-xml";
import { isMxCellXmlComplete } from "../client/workspaces/flow/lib/diagram-operations";

/**
 * The repair layer between what the model emits and what draw.io will accept.
 * A mistake here is visible as a broken or silently emptied canvas.
 *
 * Only the DOM-free paths are covered: validateMxCellStructure's later checks,
 * replaceNodes and replaceXMLParts all need a DOMParser, so they are exercised
 * in the browser rather than here.
 */

const ROOT_CELLS = '<mxCell id="0"/><mxCell id="1" parent="0"/>';
const CELL = '<mxCell id="2" value="Start" vertex="1" parent="1"><mxGeometry x="10" y="10" as="geometry"/></mxCell>';

test("wrapWithMxFile builds an empty document from nothing", () => {
  const wrapped = wrapWithMxFile("");
  assert.ok(wrapped.startsWith("<mxfile>"));
  assert.ok(wrapped.includes(ROOT_CELLS), "the two root cells draw.io requires");
});

test("wrapWithMxFile leaves an already-complete document alone", () => {
  const complete = `<mxfile><diagram><mxGraphModel><root>${ROOT_CELLS}</root></mxGraphModel></diagram></mxfile>`;
  assert.equal(wrapWithMxFile(complete), complete);
});

test("wrapWithMxFile wraps a bare mxGraphModel", () => {
  const model = `<mxGraphModel><root>${ROOT_CELLS}</root></mxGraphModel>`;
  const wrapped = wrapWithMxFile(model);
  assert.ok(wrapped.startsWith("<mxfile><diagram"));
  assert.ok(wrapped.includes(model), "the model is kept verbatim");
});

test("wrapWithMxFile supplies the root cells for loose mxCells", () => {
  const wrapped = wrapWithMxFile(CELL);
  assert.ok(wrapped.includes(ROOT_CELLS));
  assert.ok(wrapped.includes('id="2"'));
});

test("wrapWithMxFile does not duplicate root cells the model already sent", () => {
  // The prompt tells the model not to emit id 0 and 1, but it sometimes does;
  // emitting them twice makes draw.io reject the whole diagram.
  const wrapped = wrapWithMxFile(`${ROOT_CELLS}${CELL}`);
  assert.equal(wrapped.match(/id="0"/g)?.length, 1, "exactly one root cell 0");
  assert.equal(wrapped.match(/id="1"/g)?.length, 1, "exactly one root cell 1");
  assert.ok(wrapped.includes('id="2"'), "and the real content survives");
});

test("wrapWithMxFile does not repair a truncated stream, and does not need to", () => {
  // Truncation is caught upstream: the chat panel checks isMxCellXmlComplete
  // and asks the model to continue with append_diagram before wrapping. This
  // pins the division of responsibility — wrapWithMxFile only trims a trailing
  // run of closing tags, not a half-written one.
  const wrapped = wrapWithMxFile(`${CELL}<mxCell id="3" value="cut off`);
  assert.ok(wrapped.includes("cut off"), "the partial cell is passed through as-is");
});

test("isMxCellXmlComplete is what actually catches a truncated stream", () => {
  assert.equal(isMxCellXmlComplete(CELL), true);
  assert.equal(isMxCellXmlComplete(`<root>${CELL}</root>`), true, "trailing closers are fine");
  assert.equal(isMxCellXmlComplete(`${CELL}<mxCell id="3" value="cut off`), false);
  assert.equal(isMxCellXmlComplete(""), false);
  assert.equal(isMxCellXmlComplete("<mxCell id=\"2\""), false, "nothing has closed yet");
});

test("convertToLegalXml keeps only complete cells", () => {
  const converted = convertToLegalXml(
    `${CELL}<mxCell id="3" value="unterminated" vertex="1" parent="1"`,
  );
  assert.ok(converted.startsWith("<root>"));
  assert.ok(converted.trimEnd().endsWith("</root>"));
  assert.ok(converted.includes('id="2"'));
  assert.ok(!converted.includes("unterminated"), "a half-written cell is left out");
});

test("convertToLegalXml removes orphaned mxPoints", () => {
  // An mxPoint without an `as` attribute makes draw.io log
  // "Could not add object mxPoint" and skip the edge.
  const converted = convertToLegalXml(
    '<mxCell id="4" edge="1" parent="1"><mxGeometry as="geometry">' +
      '<mxPoint x="1" y="1"/><mxPoint x="2" y="2" as="sourcePoint"/>' +
      "</mxGeometry></mxCell>",
  );
  assert.ok(converted.includes('as="sourcePoint"'), "a labelled point is kept");
  assert.ok(!/<mxPoint x="1" y="1"\/>/.test(converted), "the orphan is dropped");
});

test("convertToLegalXml keeps every point inside an Array as=points", () => {
  const waypoints =
    '<mxCell id="5" edge="1" parent="1"><mxGeometry as="geometry">' +
    '<Array as="points"><mxPoint x="1" y="1"/><mxPoint x="2" y="2"/></Array>' +
    "</mxGeometry></mxCell>";
  const converted = convertToLegalXml(waypoints);
  assert.equal(converted.match(/<mxPoint/g)?.length, 2, "waypoints are not orphans");
});

test("formatXML indents nested tags", () => {
  const formatted = formatXML("<root><mxCell id=\"2\"/></root>");
  const lines = formatted.split("\n").filter(Boolean);
  assert.ok(lines.length > 1, "output is broken across lines");
  assert.ok(lines[1].startsWith("  "), "children are indented");
});

test("autoFixXml unescapes XML that arrived JSON-encoded", () => {
  const { fixed, fixes } = autoFixXml('<mxCell id=\\"2\\" value=\\"A\\"/>');
  assert.ok(fixed.includes('id="2"'));
  assert.ok(fixes.some((f) => f.includes("JSON-escaped")), fixes.join(", "));
});

test("autoFixXml strips a CDATA wrapper", () => {
  const { fixed, fixes } = autoFixXml(`<![CDATA[${CELL}]]>`);
  assert.ok(fixed.startsWith("<mxCell"));
  assert.ok(fixes.some((f) => f.includes("CDATA")), fixes.join(", "));
});

test("autoFixXml escapes a bare ampersand but leaves real entities", () => {
  const { fixed } = autoFixXml('<mxCell id="2" value="Tom & Jerry &amp; Co &#65;"/>');
  assert.ok(fixed.includes("Tom &amp; Jerry"), fixed);
  assert.ok(fixed.includes("&amp; Co"), "an already-escaped entity is not double-escaped");
  assert.ok(fixed.includes("&#65;"), "a numeric entity is left alone");
});

test("autoFixXml corrects the tag name models get wrong", () => {
  const { fixed } = autoFixXml('<Cell id="2" vertex="1" parent="1"></Cell>');
  assert.ok(fixed.includes("<mxCell"), fixed);
  assert.ok(fixed.includes("</mxCell>"), fixed);
  assert.ok(!fixed.includes("<Cell"), fixed);
});

test("autoFixXml reports no fixes for XML that was already fine", () => {
  const { fixed, fixes } = autoFixXml(CELL);
  assert.equal(fixes.length, 0);
  assert.equal(fixed, CELL);
});

test("validation rejects a duplicated structural attribute", () => {
  // Two `parent` attributes: the browser silently keeps one, so the diagram
  // comes out attached to the wrong node.
  const error = validateMxCellStructure('<mxCell id="2" parent="1" parent="0" vertex="1"/>');
  assert.ok(error, "expected an error");
  assert.ok(/parent/.test(error!), error!);
});

test("validation rejects mismatched tags", () => {
  const error = validateMxCellStructure("<root><mxCell id=\"2\"></mxGeometry></root>");
  assert.ok(error, "expected an error");
});

test("validation rejects an unescaped ampersand", () => {
  const error = validateMxCellStructure('<mxCell id="2" value="A & B"/>');
  assert.ok(error, "expected an error");
  assert.ok(/&amp;/.test(error!), error!);
});

test("an unknown entity is reported as an unescaped ampersand", () => {
  // &nbsp; trips the unescaped-& check first, because that check only whitelists
  // lt/gt/amp/quot/apos and numeric forms. The dedicated "invalid entity"
  // message is therefore only reachable for something like &ltx;. The advice
  // it gives is still right; pinned so the wording is a deliberate choice.
  const error = validateMxCellStructure('<mxCell id="2" value="A&nbsp;B"/>');
  assert.ok(error, "expected an error");
  assert.ok(/&amp;/.test(error!), error!);
});
