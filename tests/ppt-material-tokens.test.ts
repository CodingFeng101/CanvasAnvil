import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSlideMaterialsFromAutoLabels,
  ensureDescriptionHasMaterialTokens,
  materialLabel,
  materialToken,
  removeMaterialToken,
} from "../client/workspaces/ppt/canvas/lib/material-tokens";
import type { PptPage } from "../client/workspaces/ppt/lib/ppt-service";
import type {
  ReferenceVisualAsset,
  SlideData,
} from "../client/workspaces/ppt/canvas/types";

/**
 * Reference images reach the image model only through the `{{image:Name}}`
 * token in a slide's description. A token that goes missing, or one that
 * survives after its image was deleted, both end up as a wrong slide.
 */

test("labels and tokens follow the UI language", () => {
  assert.equal(materialLabel(2, "zh"), "第2张");
  assert.equal(materialLabel(2, "en"), "Image 2");
  assert.equal(materialToken("第1张"), "{{image:第1张}}");
});

test("removing a material takes its token with it", () => {
  const before = "标题页。{{image:第1张}}放在左侧。";
  const after = removeMaterialToken(before, "第1张");
  assert.ok(!after.includes("{{image:"), after);
  assert.ok(after.includes("标题页。"), "the rest of the description survives");
});

test("removal takes every occurrence and tidies the gap", () => {
  const after = removeMaterialToken("a {{image:Image 1}}  b {{image:Image 1}} c", "Image 1");
  assert.ok(!after.includes("{{image:"));
  assert.ok(!/ {2,}/.test(after), `double spaces left behind: ${JSON.stringify(after)}`);
});

test("removal leaves other materials alone", () => {
  const after = removeMaterialToken("{{image:Image 1}} and {{image:Image 2}}", "Image 1");
  assert.ok(after.includes("{{image:Image 2}}"));
  assert.ok(!after.includes("{{image:Image 1}}"));
});

test("a name with regex characters is removed literally", () => {
  // Material names come from user filenames, so they can contain anything.
  const after = removeMaterialToken("x {{image:a.b(c)}} y", "a.b(c)");
  assert.ok(!after.includes("{{image:"), after);
});

test("a material with no mention gets a placement sentence", () => {
  const out = ensureDescriptionHasMaterialTokens("封面页。", [{ name: "第1张" }], "zh");
  assert.ok(out.startsWith("封面页。"), "the original text is kept");
  assert.ok(out.includes("{{image:第1张}}"), out);
  assert.ok(out.includes("放在左侧主视觉区域"), out);
});

test("a caption is folded into the placement sentence", () => {
  const out = ensureDescriptionHasMaterialTokens(
    "",
    [{ name: "Image 1", caption: "quarterly revenue" }],
    "en",
  );
  assert.match(out, /focus: quarterly revenue/);
});

test("a material already placed is left as it is", () => {
  const already = "{{image:第1张}}放在右上角，不要改。";
  assert.equal(ensureDescriptionHasMaterialTokens(already, [{ name: "第1张" }], "zh"), already);
});

test("a token mentioned but never placed still gets its sentence", () => {
  const out = ensureDescriptionHasMaterialTokens("see {{image:Image 1}}", [{ name: "Image 1" }], "en");
  assert.match(out, /place it in the left primary visual area/);
});

test("a placement left over from the other language is replaced", () => {
  // Switching UI language mid-deck used to leave both wordings in the prompt.
  const out = ensureDescriptionHasMaterialTokens(
    "{{image:第1张}} place it in the left primary visual area",
    [{ name: "第1张" }],
    "zh",
  );
  assert.ok(!/place it in the left/i.test(out), out);
  assert.ok(out.includes("放在左侧主视觉区域"), out);
});

test("each of the first three materials gets its own placement", () => {
  const out = ensureDescriptionHasMaterialTokens(
    "",
    [{ name: "Image 1" }, { name: "Image 2" }, { name: "Image 3" }],
    "en",
  );
  assert.match(out, /left primary visual area/);
  assert.match(out, /upper-right area/);
  assert.match(out, /bottom horizontal area/);
});

const asset = (label: string, page = 1): ReferenceVisualAsset =>
  ({
    label,
    dataUrl: `data:image/png;base64,${label}`,
    caption: `${label} caption`,
    sourceFileName: "deck.pdf",
    sourcePage: page,
  }) as ReferenceVisualAsset;

const slide = (n: number): SlideData => ({
  id: `slide-${n}`,
  title: `Slide ${n}`,
  content: [],
  description: "",
});

test("labelled assets attach to the slides that asked for them", () => {
  const slides = [slide(1), slide(2)];
  const pages = [
    { id: "slide-1", materialLabels: ["FIG-1"] },
    { id: "slide-2", materialLabels: ["FIG-2"] },
  ] as unknown as PptPage[];

  const { nextSlides, nextMaterials } = buildSlideMaterialsFromAutoLabels(
    pages,
    slides,
    [asset("FIG-1"), asset("FIG-2")],
    "en",
  );

  assert.equal(nextMaterials["slide-1"][0].refLabel, "FIG-1");
  assert.equal(nextMaterials["slide-2"][0].refLabel, "FIG-2");
  assert.match(nextSlides[0].description!, /\{\{image:Image 1\}\}/);
});

test("a label nothing matches leaves the slide untouched", () => {
  const slides = [slide(1)];
  const pages = [{ id: "slide-1", materialLabels: ["MISSING"] }] as unknown as PptPage[];
  const { nextSlides, nextMaterials } = buildSlideMaterialsFromAutoLabels(
    pages,
    slides,
    [asset("FIG-1")],
    "en",
  );
  assert.equal(nextMaterials["slide-1"], undefined);
  assert.equal(nextSlides[0], slides[0], "the same object comes back");
});

test("no labels at all spreads a few assets rather than showing none", () => {
  // Without this the user uploads a PDF, gets an empty materials list, and
  // reasonably concludes the upload failed.
  const slides = [slide(1), slide(2), slide(3), slide(4)];
  const pages = [{}, {}, {}, {}] as unknown as PptPage[];
  const { nextMaterials } = buildSlideMaterialsFromAutoLabels(
    pages,
    slides,
    [asset("A"), asset("B")],
    "en",
  );
  const touched = Object.keys(nextMaterials);
  assert.equal(touched.length, 2, `expected two slides to get one each, got ${touched}`);
});

test("the fallback does nothing when there is nothing to spread", () => {
  const { nextMaterials } = buildSlideMaterialsFromAutoLabels(
    [{}] as unknown as PptPage[],
    [slide(1)],
    [],
    "en",
  );
  assert.deepEqual(nextMaterials, {});
});

test("a slide takes at most three materials", () => {
  const pages = [
    { id: "slide-1", materialLabels: ["A", "B", "C", "D", "E"] },
  ] as unknown as PptPage[];
  const { nextMaterials } = buildSlideMaterialsFromAutoLabels(
    pages,
    [slide(1)],
    ["A", "B", "C", "D", "E"].map((l) => asset(l)),
    "en",
  );
  assert.equal(nextMaterials["slide-1"].length, 3);
});

test("attached materials are numbered from one on each slide", () => {
  const pages = [{ id: "slide-1", materialLabels: ["A", "B"] }] as unknown as PptPage[];
  const { nextMaterials } = buildSlideMaterialsFromAutoLabels(
    pages,
    [slide(1)],
    [asset("A"), asset("B")],
    "zh",
  );
  assert.deepEqual(
    nextMaterials["slide-1"].map((m) => m.name),
    ["第1张", "第2张"],
  );
});
