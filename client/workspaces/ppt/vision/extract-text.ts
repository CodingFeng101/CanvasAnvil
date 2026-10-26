/**
 * A rendered slide in, editable text boxes out.
 *
 * This is the whole of the reading side in one call: decode the image, find
 * and read the lines, measure each one off the pixels, join the lines that
 * form a paragraph, and hand back blocks in the shape the deck already
 * speaks.
 */

import { getOcrReader, type OcrReaderOptions } from "@/workspaces/ppt/vision/ocr-engine";
import { measureTextBlocks } from "@/workspaces/ppt/vision/text-measure";
import { mergeLines } from "@/workspaces/ppt/vision/line-merge";
import { loadRgbaImage } from "@/workspaces/ppt/vision/raster";
import { toOcrBoxes } from "@/workspaces/ppt/vision/read-boxes";
import type { BoldMode, MeasuredTextBlock, RgbaImage } from "@/workspaces/ppt/vision/types";
import type { PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

export { loadRgbaImage };

/**
 * `VITE_OCR_BOLD_MODE` overrides how weight is decided.
 *
 * Bold is not absolutely decidable from one image: it is relative to the
 * regular weight of the same family, and a slide may contain no regular
 * sample to compare against. The automatic call regresses stroke ratio
 * against font size and flags the outliers, which works until a page carries
 * something far heavier than its own headings -- a white digit on a solid
 * badge, say -- whose ratio pulls the fitted line up and leaves genuine bold
 * headings sitting under the cutoff.
 *
 * When that happens, pin a threshold instead: `ratio:0.098` calls anything at
 * or above that ratio bold. The raw measurements stay on every block, so one
 * calibration serves a whole batch of art from the same template.
 */
const configuredBoldMode =
  typeof import.meta !== "undefined" && import.meta.env
    ? (String(import.meta.env.VITE_OCR_BOLD_MODE || "").trim() as BoldMode)
    : ("" as BoldMode);

export interface SlideTextOptions extends OcrReaderOptions {
  slideId?: string;
  boldMode?: BoldMode;
  /** The deck's own copy of the text, used to correct near-miss readings. */
  expected?: string[];
  /** Join consecutive lines of one paragraph into a single box. */
  mergeParagraphs?: boolean;
}

/** Every text block on one slide, with style measured rather than guessed. */
export async function readSlideText(
  image: RgbaImage,
  options: SlideTextOptions = {},
): Promise<MeasuredTextBlock[]> {
  const reader = await getOcrReader(options);
  const readings = await reader.read(image);

  const measured = measureTextBlocks(image, toOcrBoxes(readings), {
    slideId: options.slideId || "slide",
    boldMode: options.boldMode || configuredBoldMode || "auto",
    expected: options.expected,
  });

  return options.mergeParagraphs === false ? measured : mergeLines(measured);
}

/**
 * A default face for text that was measured rather than declared.
 *
 * The export's own default is a latin face, which renders Chinese as boxes on
 * a machine without a fallback. Script and stroke variation are both measured,
 * so they can choose something closer than that.
 */
const faceFor = (block: MeasuredTextBlock) => {
  if (block.script === "cjk") return "Microsoft YaHei";
  return block.serif ? "Times New Roman" : "Arial";
};

/**
 * Assign each block one of the deck's roles.
 *
 * The role only carries meaning here: every style value the renderer would
 * otherwise derive from it is written out explicitly below, precisely because
 * a measured value beats a value inferred from a label.
 */
function roleOf(block: MeasuredTextBlock, largestSize: number): PptTextBlock["role"] {
  if (block.bullet) return "bullet";
  if (block.fontSizePt >= largestSize) return "title";
  return "summary";
}

/** Measured blocks as the deck's own text blocks. */
export function toPptTextBlocks(blocks: MeasuredTextBlock[]): PptTextBlock[] {
  const largestSize = blocks.reduce((largest, block) => Math.max(largest, block.fontSizePt), 0);

  return blocks.map((block) => ({
    id: block.id,
    role: roleOf(block, largestSize),
    text: block.text,
    x: block.x,
    y: block.y,
    w: block.w,
    h: block.h,
    style: {
      fontFamily: faceFor(block),
      // Points against a 960pt-wide slide, which is the basis the PPTX export
      // already assumes.
      fontSize: block.fontSizePt,
      fontWeight: block.bold ? 700 : 400,
      fontStyle: block.italic ? ("italic" as const) : ("normal" as const),
      color: block.color,
      align: block.align,
    },
  }));
}

/** The reading side end to end, from a slide image URL. */
export async function extractSlideTextBlocks(
  slideImageUrl: string,
  options: SlideTextOptions = {},
): Promise<PptTextBlock[]> {
  const image = await loadRgbaImage(slideImageUrl);
  return toPptTextBlocks(await readSlideText(image, options));
}
