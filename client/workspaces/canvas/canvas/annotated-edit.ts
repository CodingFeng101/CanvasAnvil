import { CaptureUpdateAction, exportToBlob, getCommonBounds, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";
import type { ImageQuality, ImageSize } from "@/ai/client";
import { generateImage, generateVisionChatMessage } from "@/ai/client";
import type { UiLanguage } from "@/shared/i18n";
import {
  elementBounds,
  getAnnotationSearchBounds,
  boundsOverlap,
  resolveTargetImage,
  unionBounds,
} from "@/workspaces/canvas/canvas/bounds";
import { insertGeneratedImage } from "@/workspaces/canvas/canvas/insert-image";
import { getImageLineage, makeLineageId, withImageLineage } from "@/workspaces/canvas/canvas/lineage";

export interface AnnotatedEditResult {
  ok: boolean;
  url?: string;
  lineageId?: string;
  /** The canvas element the result was placed as -- lets the chat reference it instead of embedding a second copy of the image. */
  elementId?: string;
  error?: string;
  /** What the vision step read off the annotation, in plain words -- surfaced so a wrong reading of the markup is visible, not just a wrong picture. */
  describedChange?: string;
}

export interface AnnotatedEditOptions {
  size?: ImageSize;
  quality?: ImageQuality;
  /** Checked once the model answers; true means the canvas was cleared meanwhile and the result must not be placed. */
  isCancelled?: () => boolean;
}

export interface AnnotatedEditPreview {
  ok: boolean;
  /** The picture the edit will target -- with its markup burned in, if there was any. */
  previewUrl?: string;
  error?: string;
}

/**
 * Every non-deleted, non-image element sitting on or near the given image --
 * arrows, circles, freehand strokes, text -- whether or not the user actually
 * selected them.
 *
 * Requiring the user to drag-select the picture together with its markup was
 * an easy step to miss: clicking just the image (the more natural gesture)
 * silently dropped the annotations from the request. Nearby elements are
 * picked up by geometry instead.
 */
function findNearbyAnnotations(
  api: ExcalidrawImperativeAPI,
  image: ExcalidrawImageElement,
  alsoInclude: readonly { id: string }[],
) {
  const searchBounds = getAnnotationSearchBounds(image);
  const alsoIncludeIds = new Set(alsoInclude.map((el) => el.id));
  const found = api
    .getSceneElements()
    .filter((el) => el.id !== image.id && el.type !== "image")
    .filter((el) => alsoIncludeIds.has(el.id) || boundsOverlap(elementBounds(el), searchBounds));

  // De-duplicate: an explicitly selected element may already satisfy the
  // geometry check.
  const byId = new Map(found.map((el) => [el.id, el]));
  return Array.from(byId.values());
}

/** Excalidraw hands back a Blob from exportToBlob; canvas compositing wants an Image element. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for compositing."));
    img.src = src;
  });
}

/**
 * Renders the image plus its nearby annotations onto a single canvas.
 *
 * The frame starts at `getAnnotationSearchBounds` -- proportional to the
 * picture, not blown out by one long arrow -- but `findNearbyAnnotations`
 * only requires an annotation to *overlap* that box, not sit inside it, so a
 * label a bit further out still counts as "nearby" while poking past the
 * margin. Clipping the canvas to the margin alone would silently crop that
 * label out of the very picture being sent, so the frame is widened to the
 * union with the annotations' own bounds first -- guaranteed to hold
 * whatever was actually gathered.
 */
/** Longest side of the composite. The model client downscales past 1536 anyway; this only bounds the canvas. */
const MAX_COMPOSITE_DIMENSION = 2048;

async function buildAnnotatedComposite(
  imageElement: ExcalidrawImageElement,
  originalDataUrl: string,
  annotationElements: readonly ExcalidrawElement[],
  appState: ReturnType<ExcalidrawImperativeAPI["getAppState"]>,
  files: ReturnType<ExcalidrawImperativeAPI["getFiles"]>,
): Promise<string> {
  const [minX, minY, maxX, maxY] = getCommonBounds(annotationElements);
  const annotationBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const frame = unionBounds(getAnnotationSearchBounds(imageElement), annotationBounds);
  const baseImg = await loadImage(originalDataUrl);

  // Rendered at the picture's own resolution, not its size on the board.
  // Pictures are placed at most 480 units wide (insert-image.ts), so drawing
  // in scene units shrank a 1536px slide threefold: the vision model reading
  // the markup got a picture whose body text -- and the handwritten note
  // itself -- had blurred past reading, and guessed.
  const nativeScale = (baseImg.naturalWidth || imageElement.width) / Math.max(1, imageElement.width);
  const scale = Math.max(1, Math.min(nativeScale, MAX_COMPOSITE_DIMENSION / Math.max(frame.width, frame.height)));

  const annotationBlob = await exportToBlob({
    elements: annotationElements,
    // `exportBackground` defaults to true, which paints the whole export
    // canvas with `viewBackgroundColor` (opaque white) before drawing the
    // strokes -- fine for a normal export, but this layer gets drawn on top
    // of the picture underneath, so a solid background there blanks out
    // exactly the area the annotation is supposed to be pointing at.
    // `exportScale` matches the composite so the strokes stay sharp at it.
    appState: { ...appState, exportBackground: false, exportScale: scale },
    files,
    mimeType: "image/png",
    exportPadding: 0,
  });

  const annotationObjectUrl = URL.createObjectURL(annotationBlob);
  try {
    const annotationImg = await loadImage(annotationObjectUrl);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    // Everything below is placed in scene units; the transform does the rest.
    ctx.scale(scale, scale);
    ctx.imageSmoothingQuality = "high";
    // The margin around the picture is where notes like "change X to Y" get
    // written. Left transparent, it turns black wherever the composite is
    // re-encoded as JPEG on its way to the model (images.ts does that past
    // its size cap) -- and dark handwriting on black is simply gone.
    ctx.fillStyle = appState.viewBackgroundColor || "#ffffff";
    ctx.fillRect(0, 0, frame.width, frame.height);

    ctx.drawImage(baseImg, imageElement.x - frame.x, imageElement.y - frame.y, imageElement.width, imageElement.height);
    // `annotationImg`'s own pixel size is not the same as its footprint in
    // scene units: exportToBlob renders at `appState.exportScale`, which
    // defaults to the browser's devicePixelRatio (2 on most laptop and phone
    // screens today). Drawing at the image's native pixel size on a 2x
    // display would place the markup at twice its real size, anchored at the
    // same top-left corner -- so it visually balloons off whatever it was
    // actually circling. The known scene-unit bounds are the size that agrees
    // with where the annotation was actually drawn.
    ctx.drawImage(annotationImg, minX - frame.x, minY - frame.y, annotationBounds.width, annotationBounds.height);

    return canvas.toDataURL("image/png");
  } finally {
    // Each edit builds a fresh blob: URL for the annotation layer -- left
    // unrevoked, it pins that blob in memory for the rest of the tab's life.
    URL.revokeObjectURL(annotationObjectUrl);
  }
}

function buildPrompt(uiLang: UiLanguage, instruction: string, hasAnnotation: boolean, annotationTexts: string[]): string {
  const trimmed = instruction.trim();
  if (uiLang === "zh") {
    if (!hasAnnotation) return trimmed || "请基于这张图片进行修改。";
    return [
      "图1是原图。图2是图1加上了手绘标注（箭头/圆圈/文字等），标注只是用来指出改哪里、怎么改，标注本身不是图片内容的一部分。",
      "第一步，定位图2里标注圈住或指向的具体区域，以及标注附近文字写的修改要求。",
      quotedAnnotationTexts(annotationTexts, uiLang),
      "第二步，只在图1对应的那个区域内做出这个改动，图1里没有被标注涉及的每一处（颜色、文字、布局、间距）都必须保持像素级不变，禁止重新排版或重绘整张图。",
      "输出一张干净的结果图，不包含任何箭头、圆圈或标注文字的痕迹。",
      trimmed ? `补充说明：${trimmed}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (!hasAnnotation) return trimmed || "Edit this image.";
  return [
    "Image 1 is the original. Image 2 is image 1 with hand-drawn annotations on top (arrows, circles, text) that only mark what to change and how -- the markup itself is not part of the picture's content.",
    "Step 1: locate the exact area image 2's markup circles or points at, and read the change it describes.",
    quotedAnnotationTexts(annotationTexts, uiLang),
    "Step 2: apply that change only within that area of image 1. Every other part of image 1 -- color, text, layout, spacing -- must stay pixel-identical. Do not re-layout or redraw the picture as a whole.",
    "Output a clean result with no arrows, circles, or annotation text visible.",
    trimmed ? `Additional instructions: ${trimmed}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Reads the annotation off the composite and translates it into one plain
 * instruction, using the text/chat model rather than the image model.
 *
 * Image-edit models are trained to match a prompt, not to reason precisely
 * about hand-drawn markup layered on a second image -- asking one to both
 * interpret an annotation *and* execute a pixel-precise edit in a single call
 * is exactly where they tend to just redraw something similar-looking instead
 * of truly editing. A general vision-capable chat model is far better at the
 * "read the markup, say what it means" half, so that gets split out as its
 * own step; the image model then only has to do the part it's actually good
 * at, editing from a clear instruction plus the clean original.
 *
 * Returns null (never throws) on any failure -- e.g. no text-model key
 * configured -- so the caller can fall back to sending the annotated image
 * straight to the image model instead of failing the edit outright.
 */
/**
 * What the user typed into the markup, exactly.
 *
 * Excalidraw draws annotation text in a handwriting face (and CJK in a
 * handwritten fallback), which a vision model has to read back off pixels --
 * "RAG换成检索增强" came back as "RAG模块". The words are sitting right there
 * on the text elements, so they are handed over verbatim instead.
 */
function annotationTextsOf(elements: readonly ExcalidrawElement[]): string[] {
  return elements
    .filter((el): el is ExcalidrawTextElement => el.type === "text")
    .map((el) => el.text.trim())
    .filter(Boolean);
}

function quotedAnnotationTexts(texts: string[], uiLang: UiLanguage): string {
  if (texts.length === 0) return "";
  const list = texts.map((text) => `“${text}”`).join(uiLang === "zh" ? "、" : ", ");
  return uiLang === "zh"
    ? `标注里写的文字原文是（以此为准，不要按图里的手写体去猜）：${list}`
    : `The annotation's written text, verbatim (trust this over reading the handwriting in the image): ${list}`;
}

async function describeAnnotationInWords(
  originalDataUrl: string,
  annotatedDataUrl: string,
  annotationTexts: string[],
  instruction: string,
  uiLang: UiLanguage,
): Promise<string | null> {
  const trimmed = instruction.trim();
  // The clean original goes along with the marked-up one: on the composite
  // alone the markup sits on top of the very text it is about, and the model
  // has nothing exact to quote -- it wrote "change the title to four
  // characters" where the edit needed the title's actual words.
  const systemPrompt =
    uiLang === "zh"
      ? [
          "你负责把图片上的手绘标注（箭头、圆圈、文字等）翻译成一句清晰具体的修改指令，供另一个图像编辑模型执行。",
          "图1是干净的原图，图2是同一张图加上了标注。用图2判断要改哪里、怎么改，用图1读出那里原本的内容。",
          "指令要说明位置（如“顶部标题”“第3个卡片的标题”），并且只描述最终效果，不要提及标注符号本身。",
          "凡是涉及文字的修改，必须用引号逐字写出原文和改后的完整文字，例如：把顶部标题“RAG 流程图”改为“检索增强流程图”。标注里写的修改要求要严格照做，不要自行发挥或改写其它字。",
          "只输出这一句指令，不要输出解释或前后缀。",
        ].join("\n")
      : [
          "You translate hand-drawn annotations (arrows, circles, text) into one clear, specific instruction for a separate image-editing model to execute.",
          "Image 1 is the clean original; image 2 is the same picture with the markup. Use image 2 to see what to change and how, and image 1 to read what is there now.",
          "Say where (e.g. \"the top title\", \"the third card's heading\") and describe only the end result, never the markup itself.",
          "For any text change, quote the exact current text and the exact full new text, e.g.: change the top title \"RAG Flow\" to \"Retrieval-Augmented Flow\". Follow what the markup asks literally; do not improvise or reword anything else.",
          "Output only that instruction: no explanation or prefix.",
        ].join("\n");

  const userPrompt = [
    uiLang === "zh"
      ? "图2上的手绘标注指出了需要修改的位置和方式，请写出这条修改指令。"
      : "The hand-drawn markup on image 2 marks a change to make. Write that instruction.",
    quotedAnnotationTexts(annotationTexts, uiLang),
    trimmed ? (uiLang === "zh" ? `用户还补充说：${trimmed}` : `The user also added: ${trimmed}`) : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const described = await generateVisionChatMessage(systemPrompt, userPrompt, [originalDataUrl, annotatedDataUrl]);
    const cleaned = described.trim();
    return cleaned || null;
  } catch (error) {
    console.error("Describing the annotation via the text model failed; falling back to the marked-up image.", error);
    return null;
  }
}

function buildDescribedEditPrompt(uiLang: UiLanguage, describedChange: string): string {
  return uiLang === "zh"
    ? `请编辑这张图片：${describedChange}\n只修改这一处，图片其它部分（颜色、文字、布局、间距）保持不变，不要重新排版或重绘整张图。引号里的新文字必须逐字照写，不要增删或替换任何字。`
    : `Edit this picture: ${describedChange}\nChange only that. Keep every other part of the picture (color, text, layout, spacing) unchanged -- do not re-layout or redraw the whole picture. Render any quoted new text exactly, character for character.`;
}

interface ResolvedAnnotatedEdit {
  imageElement: ExcalidrawImageElement;
  originalDataUrl: string;
  annotationElements: ExcalidrawElement[];
  annotatedDataUrl: string;
  hasAnnotation: boolean;
}

/**
 * The part of an annotated edit that only depends on the current canvas
 * selection -- which picture, which markup, and (once composited) what it
 * looks like -- shared by the preview shown in chat and the actual edit
 * request, so the two never disagree about what "the annotated image" is.
 */
async function resolveAnnotatedEdit(
  api: ExcalidrawImperativeAPI,
  uiLang: UiLanguage,
): Promise<{ ok: true; resolved: ResolvedAnnotatedEdit } | { ok: false; error: string }> {
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds;
  const selectedElements = api.getSceneElements().filter((el) => selectedIds[el.id]);

  const imageElement = resolveTargetImage(api.getSceneElements(), selectedElements);
  if (!imageElement) {
    return {
      ok: false,
      error:
        uiLang === "zh"
          ? "请先选中一张图片，或选中它附近的标注。"
          : "Select a picture, or the annotation drawn near it, first.",
    };
  }

  const files = api.getFiles();
  const originalDataUrl = imageElement.fileId ? files[imageElement.fileId]?.dataURL : undefined;
  if (!originalDataUrl) {
    return {
      ok: false,
      error: uiLang === "zh" ? "找不到该图片的原始数据，无法编辑。" : "Could not find the original image data to edit.",
    };
  }

  const explicitlySelected = selectedElements.filter((el) => el.id !== imageElement.id && el.type !== "image");
  const annotationElements = findNearbyAnnotations(api, imageElement, explicitlySelected);
  const hasAnnotation = annotationElements.length > 0;

  const annotatedDataUrl = hasAnnotation
    ? await buildAnnotatedComposite(imageElement, originalDataUrl, annotationElements, appState, files)
    : "";

  return {
    ok: true,
    resolved: { imageElement, originalDataUrl, annotationElements, annotatedDataUrl, hasAnnotation },
  };
}

/**
 * What the edit is about to send, rendered as one picture -- so the chat
 * message the click produces can show it back to the user instead of a bare
 * placeholder line.
 */
export async function previewAnnotatedEdit(api: ExcalidrawImperativeAPI, uiLang: UiLanguage): Promise<AnnotatedEditPreview> {
  const result = await resolveAnnotatedEdit(api, uiLang);
  if (!result.ok) return { ok: false, error: result.error };
  const { originalDataUrl, annotatedDataUrl, hasAnnotation } = result.resolved;
  return { ok: true, previewUrl: hasAnnotation ? annotatedDataUrl : originalDataUrl };
}

/**
 * Exports the image the current selection resolves to (see resolveTargetImage
 * -- selecting the picture or just its nearby markup both work) together with
 * whatever annotations were drawn near it (found by geometry -- see
 * findNearbyAnnotations).
 *
 * The annotation is read by a vision-capable text model first (see
 * describeAnnotationInWords) and turned into a plain-language instruction --
 * the image model then edits from that instruction plus the clean original,
 * rather than having to interpret hand-drawn markup and execute a precise
 * edit in the same call. If that reading step fails for any reason (no
 * text-model key, model error), this falls back to sending the annotated
 * composite straight to the image model with an explicit two-image prompt.
 *
 * Either way, the result lands on the board next to the original (never
 * overwriting it), and the annotation strokes used are archived
 * (soft-deleted, so undo still brings them back).
 */
export async function runAnnotatedEdit(
  api: ExcalidrawImperativeAPI,
  instruction: string,
  uiLang: UiLanguage,
  options?: AnnotatedEditOptions,
): Promise<AnnotatedEditResult> {
  const resolved = await resolveAnnotatedEdit(api, uiLang);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { imageElement, originalDataUrl, annotationElements, annotatedDataUrl, hasAnnotation } = resolved.resolved;

  const annotationTexts = annotationTextsOf(annotationElements);
  const describedChange = hasAnnotation
    ? await describeAnnotationInWords(originalDataUrl, annotatedDataUrl, annotationTexts, instruction, uiLang)
    : null;
  const prompt = describedChange
    ? buildDescribedEditPrompt(uiLang, describedChange)
    : buildPrompt(uiLang, instruction, hasAnnotation, annotationTexts);
  // The source image may be the very first version of its picture and not
  // carry a lineage yet -- it gets tagged retroactively so it joins the
  // history alongside the version this edit is about to create.
  const lineage = getImageLineage(imageElement) ?? { lineageId: makeLineageId(), createdAt: Date.now() };

  try {
    const url = await generateImage({
      prompt,
      referenceImageUrl: originalDataUrl,
      // The annotation's meaning already made it into the prompt above; only
      // fall back to also sending the marked-up picture when that reading
      // step didn't happen.
      additionalReferenceImageUrls: !describedChange && hasAnnotation ? [annotatedDataUrl] : [],
      size: options?.size,
      quality: options?.quality,
    });
    if (!url) throw new Error("empty result");
    if (options?.isCancelled?.()) return { ok: false, error: "cancelled" };

    const consumedIds = new Set(annotationElements.map((el) => el.id));
    const nextElements = api.getSceneElements().map((el) => {
      if (el.id === imageElement.id) {
        return newElementWith(el, { customData: withImageLineage(el.customData, lineage) });
      }
      if (consumedIds.has(el.id)) return newElementWith(el, { isDeleted: true });
      return el;
    });
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });

    const note =
      describedChange ||
      instruction.trim() ||
      annotationTexts.join(" ") ||
      (uiLang === "zh" ? "按标注修改" : "Edited from annotation");
    const { elementId } = await insertGeneratedImage(api, url, { lineageId: lineage.lineageId, note });

    return { ok: true, url, lineageId: lineage.lineageId, elementId, describedChange: describedChange || undefined };
  } catch (error) {
    console.error("Annotated edit failed", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
