import { mergeTextBlocksIntoElements } from "@/workspaces/ppt/canvas/slide-content";
import type { SlideRenderLayer } from "@/workspaces/ppt/canvas/types";
import type { PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

/**
 * The editable text layer sitting over a slide's rendered image, keyed by
 * slide and then by the version of the image it was extracted from.
 */
export type RenderLayerMap = Record<string, Record<string, SlideRenderLayer>>;

/**
 * Rewrites one layer's text blocks, keeping its rendered elements in step.
 *
 * Every mutation has to do both: `textBlocks` is what the review UI edits and
 * `elements` is what the exporter draws, so updating one without the other
 * silently ships a deck that does not match what the user saw. Routing them
 * all through here is what makes that impossible to forget.
 *
 * Returns the map unchanged when the slide or version has no layer yet.
 */
export function withTextBlocks(
  layers: RenderLayerMap,
  slideId: string,
  versionId: string,
  update: (blocks: PptTextBlock[]) => PptTextBlock[],
): RenderLayerMap {
  const layer = layers[slideId]?.[versionId];
  if (!layer) return layers;

  const textBlocks = update(layer.textBlocks || []);
  return {
    ...layers,
    [slideId]: {
      ...(layers[slideId] || {}),
      [versionId]: {
        ...layer,
        textBlocks,
        elements: mergeTextBlocksIntoElements(textBlocks, layer.elements),
      },
    },
  };
}

/** Smallest a block of each role may be dragged, as a fraction of the slide. */
const MIN_SIZE: Record<string, { w: number; h: number }> = {
  title: { w: 0.18, h: 0.08 },
  tag: { w: 0.07, h: 0.045 },
};
const DEFAULT_MIN = { w: 0.1, h: 0.06 };
const FLOOR = { w: 0.05, h: 0.04 };

/**
 * Applies a drag or resize, keeping the block on the slide and large enough
 * to still be grabbed. A title needs more room than a tag, so the floor
 * depends on the role.
 */
export function clampTextBlockRect(
  block: PptTextBlock,
  nextRect: Partial<Pick<PptTextBlock, "x" | "y" | "w" | "h">>,
): PptTextBlock {
  const role = MIN_SIZE[block.role] || DEFAULT_MIN;
  const minW = Math.max(FLOOR.w, role.w);
  const minH = Math.max(FLOOR.h, role.h);

  let x = typeof nextRect.x === "number" ? nextRect.x : block.x;
  let y = typeof nextRect.y === "number" ? nextRect.y : block.y;
  let w = typeof nextRect.w === "number" ? nextRect.w : block.w;
  let h = typeof nextRect.h === "number" ? nextRect.h : block.h;

  // Size is clamped first, because the position budget depends on it.
  w = Math.max(minW, Math.min(1, w));
  h = Math.max(minH, Math.min(1, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));

  return { ...block, x, y, w, h };
}

/** Which edges a resize handle moves, named by compass point. */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rectangle a drag on `handle` produces, given how far the pointer has
 * moved as a fraction of the slide.
 *
 * Dragging a west or north edge moves the origin as well as the size, so on
 * hitting the minimum the origin has to be pushed back by the shortfall --
 * without that the opposite edge creeps along with the pointer and the box
 * slides across the slide instead of stopping.
 */
export function resizeRectFromHandle(
  start: Rect,
  handle: ResizeHandle,
  dw: number,
  dh: number,
): Rect {
  let { x, y, w, h } = start;

  if (handle.includes("e")) w = start.w + dw;
  if (handle.includes("s")) h = start.h + dh;
  if (handle.includes("w")) {
    x = start.x + dw;
    w = start.w - dw;
  }
  if (handle.includes("n")) {
    y = start.y + dh;
    h = start.h - dh;
  }

  if (w < FLOOR.w) {
    if (handle.includes("w")) x -= FLOOR.w - w;
    w = FLOOR.w;
  }
  if (h < FLOOR.h) {
    if (handle.includes("n")) y -= FLOOR.h - h;
    h = FLOOR.h;
  }

  return { x, y, w, h };
}
