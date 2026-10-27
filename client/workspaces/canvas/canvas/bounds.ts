import { getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";

/**
 * The geometry behind "which picture is this annotation for" -- shared by the
 * live selection tracking (CanvasBoard, for the boundary overlay and the
 * annotate-edit button's enabled state) and the actual edit (annotated-edit,
 * for gathering + cropping the composite). Both sides must agree on the same
 * box, or the guide drawn on screen would lie about what actually gets sent.
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * The smallest box containing both boxes.
 *
 * `boundsOverlap` only asks whether two boxes touch at all -- an annotation
 * can poke well past the image's search margin and still count as "nearby"
 * as long as some sliver of it overlaps. Anything that composites the picture
 * for editing needs the fuller answer this gives: a frame guaranteed to hold
 * the whole annotation, not just the part inside the original margin.
 */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * How far apart two boxes are; 0 when they overlap or touch.
 *
 * Used to pick a winner when an annotation's search box catches more than
 * one picture -- edits are placed right beside their source (see
 * insert-image.ts's grid), close enough that neighbouring pictures'
 * annotation margins routinely overlap each other. Distance to each
 * candidate's own footprint (not its margin) is what a person actually means
 * by "closer to this picture".
 */
export function boxDistance(a: Bounds, b: Bounds): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
}

/**
 * An element's true axis-aligned box.
 *
 * `x`/`y`/`width`/`height` alone are not safe to read as `[x, x+width]`: for
 * an arrow, line or freehand stroke, Excalidraw keeps `x`/`y` at wherever the
 * stroke started and always stores a non-negative width/height, so a stroke
 * drawn from bottom-right to top-left extends *before* `x`, not after it. An
 * annotation drawn that direction into a picture -- an entirely ordinary
 * gesture -- would silently fail to overlap the image's search box. Routing
 * every element through `getCommonBounds` (which already normalises this for
 * every element type) is what keeps the geometry honest.
 */
export function elementBounds(element: ExcalidrawElement): Bounds {
  const [minX, minY, maxX, maxY] = getCommonBounds([element]);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const ANNOTATION_MARGIN_MIN = 48;
const ANNOTATION_MARGIN_RATIO = 0.2;

/** How far an annotation's search box reaches past an edge of that length. */
export function annotationMargin(edgeLength: number): number {
  return Math.max(ANNOTATION_MARGIN_MIN, edgeLength * ANNOTATION_MARGIN_RATIO);
}

/**
 * The image's own bounds expanded by a margin -- generous enough to catch a
 * text note sitting just outside the picture's edge, but proportional to the
 * image itself rather than to how far any one annotation happens to reach.
 * This is also the box drawn on screen so the user knows where annotations
 * still count.
 */
export function getAnnotationSearchBounds(image: ExcalidrawImageElement): Bounds {
  const marginX = annotationMargin(image.width);
  const marginY = annotationMargin(image.height);
  return {
    x: image.x - marginX,
    y: image.y - marginY,
    width: image.width + marginX * 2,
    height: image.height + marginY * 2,
  };
}

/**
 * Which image the current selection is "about", without requiring the user
 * to select the picture itself.
 *
 * Selecting the image directly always wins. Otherwise, every image whose
 * annotation box the selection overlaps is a candidate. insert-image.ts
 * spaces pictures so their boxes do not overlap, but a picture the user
 * dragged in or moved by hand obeys no such spacing, so two candidates is
 * still an ordinary case.
 * Picking whichever candidate's own footprint the selection sits closest to
 * resolves that the way a person would -- "closer to this one" -- rather
 * than refusing to guess and silently doing nothing.
 */
export function resolveTargetImage(
  allElements: readonly ExcalidrawElement[],
  selectedElements: readonly ExcalidrawElement[],
): ExcalidrawImageElement | null {
  const directImage = selectedElements.find((el) => el.type === "image");
  if (directImage) return directImage as unknown as ExcalidrawImageElement;

  if (selectedElements.length === 0) return null;

  const selectionBounds = selectedElements.map(elementBounds).reduce(unionBounds);

  const allImages = allElements.filter((el) => el.type === "image") as unknown as ExcalidrawImageElement[];
  const candidates = allImages.filter((img) => {
    const box = getAnnotationSearchBounds(img);
    return selectedElements.some((el) => boundsOverlap(elementBounds(el), box));
  });

  const uniqueCandidates = Array.from(new Map(candidates.map((img) => [img.id, img])).values());
  if (uniqueCandidates.length === 0) return null;
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];

  return uniqueCandidates.reduce((closest, img) =>
    boxDistance(selectionBounds, img) < boxDistance(selectionBounds, closest) ? img : closest,
  );
}
