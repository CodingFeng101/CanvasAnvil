/**
 * The whole rebuild, page by page.
 *
 * The order is load-bearing and so is the isolation. Backgrounds are grouped
 * and drawn first because everything else has to sit on one; reading the text
 * costs nothing and runs while those are being drawn; elements are identified
 * per page once a clean background exists to compare against.
 *
 * A page that fails at any step keeps whatever it had and says so. It is
 * never given the original page as its background: that would paint every
 * card, icon and line twice -- once into the "background" and once on top of
 * it -- and the result reads as a rendering bug rather than as a page that
 * could not be rebuilt.
 */

import { runInParallel } from "@/workspaces/ppt/canvas/lib/concurrency";
import { reasonOf, retryOnce } from "@/workspaces/ppt/vision/retry";
import { generateVisionChatMessage } from "@/ai/client";
import { parseJsonLoose } from "@/workspaces/ppt/canvas/lib/parse-json";
import identifyPrompt from "@prompts/ppt/identify.md?raw";
import { groupBases, type BaseGroup } from "@/workspaces/ppt/vision/base-groups";
import { cleanIconSheet, generateCleanBackground } from "@/workspaces/ppt/vision/backgrounds";
import { checkGaps } from "@/workspaces/ppt/vision/gap-check";
import {
  maskForBox,
  measureShapes,
  readElements,
  toPixelBox,
  type Box,
  type ReportedElement,
} from "@/workspaces/ppt/vision/identify";
import { buildElement, keyLocal } from "@/workspaces/ppt/vision/elements";
import {
  buildIconSheets,
  cropForIcon,
  cutCleanedSheet,
  inkAlignedBox,
  DEFAULT_KEY_COLOUR,
  type IconRequest,
} from "@/workspaces/ppt/vision/icon-assets";
import { loadRgbaImage, toDataUrl } from "@/workspaces/ppt/vision/raster";
import { readSlideText } from "@/workspaces/ppt/vision/extract-text";
import { toPptTextBlocks } from "@/workspaces/ppt/vision/extract-text";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";
import type { PptElement, PptImageElement, PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

const PAIR_NOTE = `You are given two images of the same page, at the same size.

Image 1 is the finished slide.
Image 2 is the same page with all of its content taken away: it is the bare
background, keeping only the gradient, the texture, edge ornaments, corner
motifs and any scenic artwork that lives behind the content.

So everything present in image 1 and absent from image 2 is content, and every
piece of that content is either text -- which you ignore -- or an element you
must report. Work through the page region by region with image 2 beside you,
and let it tell you where the background stops and the content starts. It is a
guide to what counts as background, not a pixel reference: it was redrawn, so
expect small differences in colour and edge placement, and never report one of
those as an element.`;

export interface PipelineSlide {
  id: string;
  imageUrl: string;
  /** The deck's own copy of this page's text, used to correct near misses. */
  expected?: string[];
}

export interface RebuiltSlide {
  slideId: string;
  status: "ready" | "failed";
  /** Empty when the page could not be rebuilt; never the original page. */
  backgroundImageUrl: string;
  textBlocks: PptTextBlock[];
  elements: PptElement[];
  notes: string[];
  error?: string;
}

/**
 * What the rebuild is doing, as it does it.
 *
 * Structured rather than pre-worded, so the wording -- and its language --
 * belongs to the screen showing it rather than to this module. Every step
 * that can fail reports its reason: a rebuild that quietly produced nothing
 * is indistinguishable from one that was never asked for.
 */
export type RebuildEvent =
  | { kind: "grouping"; slides: number }
  | { kind: "grouped"; groups: number }
  | { kind: "backgroundDone"; groupId: string; slides: number }
  | { kind: "backgroundRetrying"; groupId: string; reason: string; delayMs: number }
  | { kind: "backgroundFailed"; groupId: string; reason: string; retried: boolean }
  | { kind: "slideStarted"; slideId: string; index: number; total: number }
  | { kind: "textRead"; slideId: string; blocks: number }
  | { kind: "elementsFound"; slideId: string; native: number; drawings: number }
  | { kind: "shapesMeasured"; slideId: string; count: number }
  | { kind: "iconsLifted"; slideId: string; count: number; keyedLocally: number; sheets: number }
  | { kind: "gapsChecked"; slideId: string; added: number }
  | { kind: "slideDone"; slideId: string; textBlocks: number; elements: number }
  | { kind: "slideRetrying"; slideId: string; reason: string; delayMs: number }
  | { kind: "slideFailed"; slideId: string; reason: string; retried: boolean }
  | { kind: "note"; slideId: string; text: string }
  | { kind: "writing" };

export interface PipelineOptions {
  /** Parallel model calls. Providers reject large bursts. */
  concurrency?: number;
  /** Skip the icon stage, which is where most of the cost is. */
  skipIcons?: boolean;
  /**
   * Key an icon's background out locally when the field behind it is flat,
   * instead of paying for an image call. Cheaper, slightly noisier than a
   * model pass, and only ever used where the ring test says it will work.
   */
  thriftyIcons?: boolean;
  /** Skip the final look for anything the first pass missed. */
  skipGapCheck?: boolean;
  keyColour?: string;
  onEvent?: (event: RebuildEvent) => void;
  signal?: AbortSignal;
}

const abortIfAsked = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("The rebuild was cancelled.");
};

/** Long enough for a rate limit to lift; short enough not to feel like a hang. */
const RETRY_DELAY_MS = 3000;

/** One page's non-text elements, as the model reports them. */
async function identifyElements(
  slideId: string,
  slideImageUrl: string,
  backgroundImageUrl: string | null,
  notes: string[],
): Promise<ReportedElement[]> {
  let question = `Identify the non-text elements on page ${slideId}.`;
  if (backgroundImageUrl) question += `\n\n${PAIR_NOTE}`;

  const images = backgroundImageUrl ? [slideImageUrl, backgroundImageUrl] : [slideImageUrl];
  const response = await generateVisionChatMessage(identifyPrompt, question, images);
  return readElements(parseJsonLoose(response), slideId, notes);
}

/**
 * The icons on one page, lifted out as pictures.
 *
 * One entry can be several positions -- the same drawing repeated -- and they
 * share a cleaned picture, so a page with six copies of one tick pays for one
 * of them.
 */
async function liftIcons(
  slideId: string,
  slideImageUrl: string,
  reported: ReportedElement[],
  keyColour: string,
  thrifty: boolean,
  notes: string[],
): Promise<{ elements: PptImageElement[]; keyedLocally: number; sheets: number }> {
  const drawings = reported.filter((entry) => entry.kind !== "native");
  if (drawings.length === 0) return { elements: [], keyedLocally: 0, sheets: 0 };

  // One request per distinct drawing; every position of it reuses the result.
  const byKey = new Map<string, ReportedElement[]>();
  for (const entry of drawings) {
    const key = entry.iconKey || `${slideId}_solo_${byKey.size}`;
    const existing = byKey.get(key);
    if (existing) existing.push(entry);
    else byKey.set(key, [entry]);
  }

  const requests: IconRequest[] = Array.from(byKey.entries()).map(([key, entries]) => ({
    id: key,
    box: entries[0].box,
    desc: entries[0].desc,
    alsoAt: entries.slice(1).map((entry) => entry.box),
  }));

  const page = await loadRgbaImage(slideImageUrl);
  const elements: PptImageElement[] = [];

  const place = (id: string, asset: RgbaImage, src: string, places: Box[]) => {
    places.forEach((spot, index) => {
      elements.push({
        id: index === 0 ? id : `${id}_${index + 1}`,
        type: "image",
        src,
        fit: "contain",
        ...inkAlignedBox(asset, spot),
      });
    });
  };

  // An icon sitting on a flat field can have its background removed here, for
  // nothing. Only the ones on a gradient or over other content need the model,
  // and on a typical page that is a minority of them.
  const needsCleaning: IconRequest[] = [];
  let keyedLocally = 0;
  for (const request of requests) {
    const measured = thrifty
      ? buildElement(page, maskForBox(page, request.box), toPixelBox(page, request.box))
      : null;

    if (!measured?.keyable) {
      needsCleaning.push(request);
      continue;
    }

    const crop = cropForIcon(
      page,
      request.box,
      requests.filter((other) => other !== request).map((other) => other.box),
    );
    const asset = keyLocal(crop, measured.ringColour);
    place(request.id, asset, await toDataUrl(asset), [request.box, ...(request.alsoAt || [])]);
    keyedLocally += 1;
  }

  const sheets = buildIconSheets(page, needsCleaning, keyColour);

  for (const sheet of sheets) {
    try {
      const montageUrl = await toDataUrl(sheet.montage);
      const cleanedUrl = await cleanIconSheet(montageUrl, sheet.requests, keyColour);
      const cut = cutCleanedSheet(await loadRgbaImage(cleanedUrl), sheet, keyColour, notes);

      for (const { request, asset } of cut) {
        // Every place this drawing appears, from one cleaned picture.
        place(request.id, asset.image, await toDataUrl(asset.image), [
          request.box,
          ...(request.alsoAt || []),
        ]);
      }
    } catch (error) {
      // One sheet that will not clean costs its own icons, not the page: the
      // shapes and the text are already measured and still worth having.
      notes.push(`一张素材表清理失败，这批图标留在底图里：${reasonOf(error)}`);
    }
  }

  return { elements, keyedLocally, sheets: sheets.length };
}

/** One page, rebuilt from its own pixels. */
async function rebuildSlide(
  slide: PipelineSlide,
  backgroundImageUrl: string | null,
  options: PipelineOptions,
): Promise<RebuiltSlide> {
  const notes: string[] = [];
  const keyColour = options.keyColour || DEFAULT_KEY_COLOUR;

  if (!backgroundImageUrl) {
    return {
      slideId: slide.id,
      status: "failed",
      backgroundImageUrl: "",
      textBlocks: [],
      elements: [],
      notes,
      // A code rather than a sentence: the screen showing this decides the
      // wording, and its language.
      error: "no-background",
    };
  }

  const emit = options.onEvent || (() => {});
  const page = await loadRgbaImage(slide.imageUrl);
  abortIfAsked(options.signal);

  const measured = await readSlideText(page, { slideId: slide.id, expected: slide.expected });
  const textBlocks = toPptTextBlocks(measured);
  emit({ kind: "textRead", slideId: slide.id, blocks: textBlocks.length });
  abortIfAsked(options.signal);

  const reported = await identifyElements(slide.id, slide.imageUrl, backgroundImageUrl, notes);
  emit({
    kind: "elementsFound",
    slideId: slide.id,
    native: reported.filter((entry) => entry.kind === "native").length,
    drawings: reported.filter((entry) => entry.kind !== "native").length,
  });
  abortIfAsked(options.signal);

  const shapes = measureShapes(page, reported, slide.id, notes);
  emit({ kind: "shapesMeasured", slideId: slide.id, count: shapes.length });

  const icons = options.skipIcons
    ? { elements: [], keyedLocally: 0, sheets: 0 }
    : await liftIcons(
        slide.id,
        slide.imageUrl,
        reported,
        keyColour,
        options.thriftyIcons ?? true,
        notes,
      );
  emit({
    kind: "iconsLifted",
    slideId: slide.id,
    count: icons.elements.length,
    keyedLocally: icons.keyedLocally,
    sheets: icons.sheets,
  });

  // Shapes first, then pictures, then text: the layer order the deck renders
  // in, and the one thing that cannot be recovered by editing afterwards.
  const elements: PptElement[] = [...shapes, ...icons.elements];

  if (!options.skipGapCheck) {
    abortIfAsked(options.signal);
    const taken: Box[] = elements.map((element) => ({
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
    }));
    // Compared against the original page. A rebuilt preview would be a
    // stronger comparison, but rendering one here would mean drawing the deck
    // twice; the page's own elements are enough to rule out what is present.
    const gaps = await checkGaps(slide.id, slide.imageUrl, backgroundImageUrl, taken, notes);
    const patched = measureShapes(page, gaps, `${slide.id}gap`, notes);
    elements.push(...patched);
    emit({ kind: "gapsChecked", slideId: slide.id, added: patched.length });
  }

  for (const note of notes) emit({ kind: "note", slideId: slide.id, text: note });

  return {
    slideId: slide.id,
    status: "ready",
    backgroundImageUrl,
    textBlocks,
    elements,
    notes,
  };
}

/**
 * Rebuild a deck.
 *
 * Returns one entry per page, in the order they were given. A page that fails
 * comes back marked failed rather than throwing, so one bad page never costs
 * the other nineteen.
 */
export async function rebuildDeck(
  slides: PipelineSlide[],
  options: PipelineOptions = {},
): Promise<RebuiltSlide[]> {
  if (slides.length === 0) return [];

  const concurrency = Math.max(1, options.concurrency ?? 3);
  const emit = options.onEvent || (() => {});

  emit({ kind: "grouping", slides: slides.length });
  const groups: BaseGroup[] = await groupBases(slides);
  emit({ kind: "grouped", groups: groups.length });

  // One edit per group, not per page: a twenty page deck that groups into
  // three pays for three.
  const backgrounds = new Map<string, string>();
  await runInParallel(
    groups.map((group) => async () => {
      const representative = slides.find((slide) => slide.id === group.representativeSlideId);
      if (!representative) {
        emit({ kind: "backgroundFailed", groupId: group.id, reason: "no representative page", retried: false });
        return;
      }
      // Worth the retry more than anything else here: a background that is not
      // drawn takes every page in its group down with it.
      let retried = false;
      try {
        const url = await retryOnce(() => generateCleanBackground(representative.imageUrl), {
          delayMs: RETRY_DELAY_MS,
          onRetry: (reason) => {
            retried = true;
            emit({ kind: "backgroundRetrying", groupId: group.id, reason, delayMs: RETRY_DELAY_MS });
          },
        });
        backgrounds.set(group.id, url);
        emit({ kind: "backgroundDone", groupId: group.id, slides: group.slideIds.length });
      } catch (error) {
        emit({ kind: "backgroundFailed", groupId: group.id, reason: reasonOf(error), retried });
      }
    }),
    concurrency,
  );

  const backgroundFor = (slideId: string) => {
    const group = groups.find((item) => item.slideIds.includes(slideId));
    return (group && backgrounds.get(group.id)) || null;
  };

  const rebuilt = new Map<string, RebuiltSlide>();
  let started = 0;
  await runInParallel(
    slides.map((slide) => async () => {
      started += 1;
      emit({ kind: "slideStarted", slideId: slide.id, index: started, total: slides.length });
      let retried = false;
      try {
        const result = await retryOnce(
          async () => {
            const attempt = await rebuildSlide(slide, backgroundFor(slide.id), options);
            // A page that comes back marked failed is a failure to retry, the
            // same as one that throws.
            if (attempt.status !== "ready") throw new Error(attempt.error || "unknown");
            return attempt;
          },
          {
            delayMs: RETRY_DELAY_MS,
            // The background stage already had its retry. Rebuilding the page
            // again cannot produce one, and would only re-run its model calls.
            shouldRetry: (reason) => reason !== "no-background",
            onRetry: (reason) => {
              retried = true;
              emit({ kind: "slideRetrying", slideId: slide.id, reason, delayMs: RETRY_DELAY_MS });
            },
          },
        );
        rebuilt.set(slide.id, result);
        emit({
          kind: "slideDone",
          slideId: slide.id,
          textBlocks: result.textBlocks.length,
          elements: result.elements.length,
        });
      } catch (error) {
        rebuilt.set(slide.id, {
          slideId: slide.id,
          status: "failed",
          backgroundImageUrl: "",
          textBlocks: [],
          elements: [],
          notes: [],
          error: reasonOf(error),
        });
        emit({ kind: "slideFailed", slideId: slide.id, reason: reasonOf(error), retried });
      }
    }),
    concurrency,
  );

  emit({ kind: "writing" });

  return slides.map(
    (slide) =>
      rebuilt.get(slide.id) || {
        slideId: slide.id,
        status: "failed" as const,
        backgroundImageUrl: "",
        textBlocks: [],
        elements: [],
        notes: [],
        error: "not rebuilt",
      },
  );
}
