import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStringEdits,
  decodeBasicHtmlEntities,
  extractCadPatchFullSvg,
  extractLatestSvgFromText,
  extractRawSvg,
  extractSvgFence,
  hasCadPatchPayload,
  jsonCandidates,
  normalizeSvgMarkup,
} from "../client/workspaces/cad/lib/svg-markup";

/**
 * Getting usable SVG out of a CAD reply. The workspace, the canvas and the
 * chat panel all read the same reply, so any disagreement here shows up as a
 * drawing that appears in one place and not another.
 */

const SVG = '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>';

test("prose around an SVG is trimmed away", () => {
  assert.equal(normalizeSvgMarkup(`Here you go:\n${SVG}\nHope that helps.`), SVG);
});

test("a reply with no SVG gives back nothing", () => {
  assert.equal(normalizeSvgMarkup("just some text"), "");
  assert.equal(normalizeSvgMarkup(""), "");
});

test("an HTML-escaped SVG is decoded rather than discarded", () => {
  // This is the divergence that used to exist between the three copies: the
  // canvas's version had no decoding and returned "" for this input.
  const escaped = "&lt;svg viewBox=&quot;0 0 10 10&quot;&gt;&lt;rect/&gt;&lt;/svg&gt;";
  const out = normalizeSvgMarkup(escaped);
  assert.ok(out.startsWith("<svg"), out);
  assert.ok(out.endsWith("</svg>"), out);
  assert.ok(out.includes('viewBox="0 0 10 10"'), out);
});

test("markup that is already unescaped is left alone", () => {
  assert.equal(normalizeSvgMarkup(SVG), SVG);
});

test("the ampersand is decoded last so other entities survive", () => {
  // Decoding & first would turn "&amp;lt;" into "<" rather than "&lt;".
  assert.equal(decodeBasicHtmlEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeBasicHtmlEntities("&lt;a&gt; &quot;b&quot; &#39;c&#39;"), `<a> "b" 'c'`);
});

test("a stream cut off mid-document returns what arrived", () => {
  const partial = '<svg viewBox="0 0 10 10"><rect x="1"';
  assert.equal(normalizeSvgMarkup(partial), partial);
});

test("trailing content after the last close tag is dropped", () => {
  assert.equal(normalizeSvgMarkup(`${SVG}\n\nAnything else?`), SVG);
});

test("the last svg fence wins", () => {
  const reply = ["```svg", "<svg><rect/></svg>", "```", "actually:", "```svg", SVG, "```"].join("\n");
  assert.equal(extractSvgFence(reply), SVG);
});

test("a fence with nothing usable in it is skipped", () => {
  assert.equal(extractSvgFence("```svg\nnot markup\n```"), "");
});

test("bare markup is found when there is no fence", () => {
  assert.equal(extractRawSvg(`before ${SVG} after`), SVG);
  assert.equal(extractRawSvg("no svg here"), "");
});

test("a whole-document patch yields its full svg", () => {
  const payload = JSON.stringify({ type: "cad_patch", target: "2d_svg", mode: "replace", full: SVG });
  assert.equal(extractCadPatchFullSvg("```json\n" + payload + "\n```"), SVG);
  assert.equal(extractCadPatchFullSvg(payload), SVG, "unfenced works too");
});

test("a patch that only edits parts of the drawing has no full svg", () => {
  const payload = JSON.stringify({
    type: "cad_patch",
    target: "2d_svg",
    mode: "patch",
    edits: [{ search: "a", replace: "b" }],
  });
  assert.equal(extractCadPatchFullSvg(payload), "", "mode must be replace");
});

test("another tool's payload is not mistaken for a patch", () => {
  const payload = JSON.stringify({ type: "cad_plan", plan: {} });
  assert.equal(extractCadPatchFullSvg(payload), "");
  assert.equal(hasCadPatchPayload(payload), false);
});

test("a patch is recognised in any of its shapes", () => {
  const payload = JSON.stringify({ type: "cad_patch", target: "2d_svg", mode: "patch", edits: [] });
  assert.equal(hasCadPatchPayload("```json\n" + payload + "\n```"), true, "fenced");
  assert.equal(hasCadPatchPayload(payload), true, "bare");
  assert.equal(hasCadPatchPayload(`text ${payload} more`), true, "embedded");
});

test("a truncated patch still names itself", () => {
  // The stream stopped before the closing brace, so nothing parses; the
  // caller still needs to know a patch was on its way.
  assert.equal(hasCadPatchPayload('{"type": "cad_patch", "target": "2d_svg", "edits": [{"sea'), true);
});

test("an empty reply carries no patch", () => {
  assert.equal(hasCadPatchPayload(""), false);
  assert.equal(hasCadPatchPayload("   "), false);
});

test("json candidates are offered fence-first", () => {
  const found = jsonCandidates('```json\n{"a":1}\n```\nand {"b":2}');
  assert.deepEqual(found[0], { a: 1 }, "the fence is tried before the loose braces");
  assert.ok(found.length >= 1);
});

test("a reply with no json yields no candidates", () => {
  assert.deepEqual(jsonCandidates("plain prose"), []);
});

test("the most explicit form of the drawing wins", () => {
  const patch = JSON.stringify({ type: "cad_patch", target: "2d_svg", mode: "replace", full: "<svg><circle/></svg>" });
  const reply = ["```svg", SVG, "```", "```json", patch, "```"].join("\n");
  assert.equal(extractLatestSvgFromText(reply), SVG, "a fence beats a patch payload");
});

test("the patch payload is used when nothing else is offered", () => {
  const patch = JSON.stringify({ type: "cad_patch", target: "2d_svg", mode: "replace", full: SVG });
  assert.equal(extractLatestSvgFromText("```json\n" + patch + "\n```"), SVG);
});

test("edits apply in order", () => {
  const out = applyStringEdits("one two three", [
    { search: "one", replace: "1" },
    { search: "three", replace: "3" },
  ]);
  assert.equal(out, "1 two 3");
});

test("an edit that does not match refuses rather than half-applying", () => {
  // A drawing patched halfway is one neither the user nor the model can
  // reason about, so the whole patch fails.
  assert.throws(
    () => applyStringEdits("abc", [{ search: "a", replace: "x" }, { search: "zzz", replace: "y" }]),
    /Search pattern not found/,
  );
});

test("a malformed patch is refused", () => {
  assert.throws(() => applyStringEdits("abc", []), /Empty patch edits/);
  assert.throws(() => applyStringEdits("abc", [{ search: "", replace: "x" }]), /Empty search pattern/);
  assert.throws(
    () => applyStringEdits("abc", [{ search: "a" } as { search: string; replace: string }]),
    /Invalid patch edit item/,
  );
});

test("only the first occurrence of a search is replaced", () => {
  assert.equal(applyStringEdits("a a a", [{ search: "a", replace: "b" }]), "b a a");
});
