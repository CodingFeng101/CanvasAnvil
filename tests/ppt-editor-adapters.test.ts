import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canvasAnvilSlidesToEditorSlides,
  canvasAnvilToEditorSlide,
  extractEditorTextBlocks,
  extractEditorTextElements,
} from "../client/features/ppt-editor/adapters/fromCanvasAnvil";
import { editorSlideToExportPayload } from "../client/features/ppt-editor/adapters/toCanvasAnvil";
import type { PptTextBlock } from "../client/workspaces/ppt/lib/ppt-service";

/**
 * The conversion behind "Export editable PPTX": a workspace slide becomes an
 * editor slide, and the editor slide becomes the page pptxgenjs writes. Losing
 * a text block here means losing text from the user's deck.
 */

const slide = {
  id: "slide-1",
  title: "Quarterly Review",
  content: ["Revenue up", "Costs flat"],
  description: "a description",
  note: "speaker note",
  layout: "title-content",
};

let nextBlockId = 0;
const textBlock = (text: string, y: number, role: PptTextBlock["role"] = "bullet"): PptTextBlock => ({
  id: `block-${(nextBlockId += 1)}`,
  text,
  x: 0.1,
  y,
  w: 0.8,
  h: 0.1,
  role,
  style: { fontSize: 24, color: "#111111" },
});

const renderLayer = {
  backgroundImageUrl: "data:image/png;base64,bg",
  textBlocks: [textBlock("Quarterly Review", 0.1, "title"), textBlock("Revenue up", 0.3)],
  elements: [],
  status: "ready" as const,
};

test("a slide with no render layer still converts", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide);
  assert.equal(editorSlide.id, "slide-1");
  assert.equal(editorSlide.title, "Quarterly Review");
  assert.deepEqual(editorSlide.content, ["Revenue up", "Costs flat"]);
  assert.deepEqual(editorSlide.elements, [], "nothing to place without a layer");
  assert.equal(editorSlide.backgroundImageUrl, undefined);
});

test("a render layer's text blocks become editor elements", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, { renderLayer });
  assert.equal(editorSlide.backgroundImageUrl, "data:image/png;base64,bg");
  assert.equal(editorSlide.elements.length, 2);
  assert.deepEqual(
    extractEditorTextElements(editorSlide).map((e) => e.text),
    ["Quarterly Review", "Revenue up"],
  );
});

test("the layer's background wins over the fallback", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, {
    renderLayer,
    backgroundImageUrl: "fallback.png",
  });
  assert.equal(editorSlide.backgroundImageUrl, "data:image/png;base64,bg");
});

test("the fallback background is used when the layer has none", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, {
    renderLayer: { ...renderLayer, backgroundImageUrl: "" },
    backgroundImageUrl: "fallback.png",
  });
  assert.equal(editorSlide.backgroundImageUrl, "fallback.png");
});

test("text survives the round trip to an export page", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, { renderLayer });
  const { page, textBlocks, elements } = editorSlideToExportPayload(editorSlide);

  assert.equal(page.id, "slide-1");
  assert.equal(page.status, "completed");
  assert.equal(page.backgroundImageUrl, "data:image/png;base64,bg");
  assert.deepEqual(
    textBlocks.map((b) => b.text),
    ["Quarterly Review", "Revenue up"],
    "no text is lost on the way out",
  );
  assert.equal(page.textBlocks, textBlocks, "the page carries the same blocks");
  assert.equal(page.elements, elements);
});

test("styling survives the round trip", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, { renderLayer });
  const { textBlocks } = editorSlideToExportPayload(editorSlide);
  assert.equal(textBlocks[0].style?.fontSize, 24);
  assert.equal(textBlocks[0].style?.color, "#111111");
});

test("positions survive the round trip", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, { renderLayer });
  const { textBlocks } = editorSlideToExportPayload(editorSlide);
  assert.equal(textBlocks[0].x, 0.1);
  assert.equal(textBlocks[1].y, 0.3);
  assert.equal(textBlocks[0].w, 0.8);
});

test("an empty deck exports an empty page rather than throwing", () => {
  const { page, textBlocks } = editorSlideToExportPayload(canvasAnvilToEditorSlide(slide));
  assert.deepEqual(textBlocks, []);
  assert.equal(page.title, "Quarterly Review", "the outline text is still there");
});

test("extractEditorTextBlocks reads back what the editor holds", () => {
  const editorSlide = canvasAnvilToEditorSlide(slide, { renderLayer });
  assert.deepEqual(
    extractEditorTextBlocks(editorSlide).map((b) => b.text),
    ["Quarterly Review", "Revenue up"],
  );
});

test("a deck converts slide by slide, each with its own layer", () => {
  const slides = [slide, { ...slide, id: "slide-2", title: "Outlook" }];
  const layers: Record<string, typeof renderLayer> = {
    "slide-1": renderLayer,
    "slide-2": { ...renderLayer, textBlocks: [textBlock("Outlook", 0.1)] },
  };

  const editorSlides = canvasAnvilSlidesToEditorSlides(
    slides,
    (id) => layers[id],
    (id) => `${id}-fallback.png`,
  );

  assert.equal(editorSlides.length, 2);
  assert.equal(editorSlides[0].elements.length, 2);
  assert.equal(editorSlides[1].elements.length, 1);
  assert.equal(extractEditorTextElements(editorSlides[1])[0].text, "Outlook");
});

test("a slide the lookup does not know still converts, on its fallback background", () => {
  const editorSlides = canvasAnvilSlidesToEditorSlides(
    [slide],
    () => undefined,
    () => "only-fallback.png",
  );
  assert.equal(editorSlides[0].backgroundImageUrl, "only-fallback.png");
  assert.deepEqual(editorSlides[0].elements, []);
});
