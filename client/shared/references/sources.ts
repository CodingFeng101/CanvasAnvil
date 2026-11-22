import type { ReferenceItem, ReferenceWorkspace } from "./types";

/**
 * Which canvases a canvas can take things from. Only pairs that have a use are listed; the
 * picker offers works of these canvases alone, and a canvas with none shows no entry.
 *
 * - PPT: diagrams and free-canvas pictures as slide materials, interior design for the report deck.
 * - Free canvas: anything with a picture, to mark up on the board.
 * - Diagram: a deck's outline, or a sketch on the free canvas, to draw from.
 *   Not interior design: a floorplan is not something a diagram is drawn from.
 * - Interior design: takes nothing; it is referenced, not referencing.
 * Never a canvas's own works: within one canvas, a work is copied instead.
 */
export const REFERENCE_SOURCES: Record<ReferenceWorkspace, readonly ReferenceWorkspace[]> = {
  ppt: ["diagram", "canvas", "cad"],
  canvas: ["ppt", "diagram", "cad"],
  diagram: ["ppt", "canvas"],
  cad: [],
};

/**
 * What of a source's works a canvas takes, beyond the item kinds it accepts. A diagram is drawn
 * from a deck's outline alone: the slide pictures and speaker notes are no use to it.
 */
const ITEM_FILTERS: Partial<Record<ReferenceWorkspace, Partial<Record<ReferenceWorkspace, (item: ReferenceItem) => boolean>>>> = {
  diagram: { ppt: (item) => item.id === "ppt:outline" },
};

export function acceptsReferenceItem(to: ReferenceWorkspace, from: ReferenceWorkspace, item: ReferenceItem): boolean {
  return ITEM_FILTERS[to]?.[from]?.(item) ?? true;
}

export function referenceSourcesFor(workspace: ReferenceWorkspace): readonly ReferenceWorkspace[] {
  return REFERENCE_SOURCES[workspace] ?? [];
}
