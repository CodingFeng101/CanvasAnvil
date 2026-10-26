/**
 * Asking one model, once, what is on the page.
 *
 * Three local methods were tried for this upstream and each failed in its own
 * way. Colour flooding finds flat containers perfectly and shatters every
 * multi-colour drawing. Regrouping the shards is wrong in both directions at
 * once: loose enough to reunite an icon also swallows the badge beside it. A
 * segmentation model finds objects but has no idea which of them a
 * presentation tool could draw natively.
 *
 * The judgement being asked for is semantic -- *is this a card or a picture of
 * a database* -- and that is what a vision model is for. So it is asked
 * plainly, once per page, for a list with a kind and a rough box.
 *
 * What it is *not* asked for is precision. Every box it returns is snapped to
 * the pixels afterwards and every colour is measured, because that part it is
 * bad at and pixel statistics are good at. The model says what; the pixels say
 * where.
 */

import { normalizeShapeName, FREEFORM, isRingShape, type ShapeName } from "@/workspaces/ppt/lib/shapes";
import { refinePanel } from "@/workspaces/ppt/vision/panels";
import { ringRatio, tracePolygon } from "@/workspaces/ppt/vision/outline";
import { maskForBox as maskForPixelBox } from "@/workspaces/ppt/vision/elements";
import type { Mask } from "@/workspaces/ppt/vision/morphology";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";
import type { PptShapeElement } from "@/workspaces/ppt/lib/ppt-service";

/**
 * Boxes closer than this are the same thing reported twice -- but only when
 * they are the same kind. A disc and the glyph drawn on it overlap almost
 * perfectly and are two entries on purpose, so a cross-kind pair has to be
 * near-identical before either is dropped.
 */
const SAME_KIND_IOU = 0.85;
const CROSS_KIND_IOU = 0.97;

/** A page has tens of elements, not hundreds. More means it started listing texture. */
const MAX_ELEMENTS = 120;

export type ElementKind = "native" | "icon" | "complex";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One place something is drawn, as the model reported it. */
export interface ReportedElement {
  kind: ElementKind;
  shape: ShapeName;
  desc: string;
  box: Box;
  /** Positions of one repeated drawing share this, so one cleaned asset serves all. */
  iconKey: string;
}

const clampBox = (x: number, y: number, w: number, h: number): Box => {
  const left = Math.min(1, Math.max(0, x));
  const top = Math.min(1, Math.max(0, y));
  return {
    x: left,
    y: top,
    w: Math.min(1 - left, Math.max(0, w)),
    h: Math.min(1 - top, Math.max(0, h)),
  };
};

/**
 * A box as the model wrote it, or null.
 *
 * Nothing that names a real region is filtered here. A two-pixel rule is
 * `w = 0.001` on a wide page and a bullet dot is smaller still; both are
 * elements. Only a box with no extent at all is refused.
 */
export function toBox(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length < 4) return null;

  const numbers = value.slice(0, 4).map((item) => Number(item));
  if (numbers.some((item) => !Number.isFinite(item))) return null;

  let [x, y, w, h] = numbers;
  // Answered in percent rather than fractions.
  if (Math.max(x, y, w, h) > 1.5) {
    x /= 100;
    y /= 100;
    w /= 100;
    h /= 100;
  }
  if (w <= 0 || h <= 0) return null;

  return clampBox(x, y, w, h);
}

export function iou(a: Box, b: Box): number {
  const wide = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const tall = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlap = wide * tall;
  const union = a.w * a.h + b.w * b.h - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Is `inner` mostly inside `outer`, and meaningfully smaller than it? */
export function contains(outer: Box, inner: Box, share = 0.75): boolean {
  const wide = Math.max(0, Math.min(outer.x + outer.w, inner.x + inner.w) - Math.max(outer.x, inner.x));
  const tall = Math.max(0, Math.min(outer.y + outer.h, inner.y + inner.h) - Math.max(outer.y, inner.y));
  const area = inner.w * inner.h;
  return wide * tall >= share * Math.max(1e-9, area) && area < 0.92 * outer.w * outer.h;
}

/**
 * The model's answer as one entry per place something is drawn.
 *
 * `notes` records everything that did not survive, so a disappearance is
 * never silent -- an element quietly dropped here is erased from the rebuilt
 * slide and nobody sees it again.
 */
export function readElements(
  answer: unknown,
  keyPrefix: string,
  notes: string[] = [],
): ReportedElement[] {
  const items = Array.isArray((answer as { elements?: unknown })?.elements)
    ? ((answer as { elements: unknown[] }).elements)
    : [];

  const reported: ReportedElement[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== "object") {
      notes.push(`#${index + 1} is not an object; skipped`);
      continue;
    }

    const entry = item as Record<string, unknown>;
    const box = toBox(entry.bbox);
    if (!box) {
      notes.push(`#${index + 1} has no usable bbox; skipped`);
      continue;
    }

    const rawKind = String(entry.kind || "").trim().toLowerCase();
    const kind: ElementKind =
      rawKind === "native" || rawKind === "icon" || rawKind === "complex"
        ? (rawKind as ElementKind)
        : "icon";

    // One drawing repeated across the page is one entry with several
    // positions. Each position becomes its own element -- they are drawn in
    // different places -- but they share a key, so one cleaned asset can
    // later serve all of them.
    const iconKey = kind === "native" ? "" : `${keyPrefix}_g${index + 1}`;
    const boxes = [box];
    for (const extra of Array.isArray(entry.also_at) ? entry.also_at : []) {
      const more = toBox(extra);
      if (more) boxes.push(more);
      else notes.push(`#${index + 1} has an unusable repeat position; skipped that one`);
    }

    for (const each of boxes) {
      reported.push({
        kind,
        shape: normalizeShapeName(entry.shape),
        desc: String(entry.desc || "").trim(),
        box: each,
        iconKey,
      });
    }

    if (reported.length >= MAX_ELEMENTS) {
      if (items.length > index + 1) {
        notes.push(`capped at ${MAX_ELEMENTS}; ${items.length - index - 1} entries not processed`);
      }
      break;
    }
  }

  // The same card reported twice, or a box repeated with a nudge, would be
  // drawn twice. Largest first, so a container survives and its near-copy
  // does not.
  const bySize = [...reported].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const unique: ReportedElement[] = [];

  for (const entry of bySize) {
    const twin = unique.find(
      (kept) => iou(entry.box, kept.box) >= (entry.kind === kept.kind ? SAME_KIND_IOU : CROSS_KIND_IOU),
    );
    if (twin) {
      notes.push(
        `${entry.kind} "${entry.desc.slice(0, 24) || "?"}" overlaps ` +
          `${twin.kind} "${twin.desc.slice(0, 24) || "?"}" at ${iou(entry.box, twin.box).toFixed(2)}; merged`,
      );
      continue;
    }
    unique.push(entry);
  }

  return unique;
}

/** A fractional box as whole pixels on the page, never degenerate. */
export function toPixelBox(image: RgbaImage, box: Box) {
  const x = Math.max(0, Math.min(Math.floor(box.x * image.width), Math.max(0, image.width - 4)));
  const y = Math.max(0, Math.min(Math.floor(box.y * image.height), Math.max(0, image.height - 4)));
  return {
    x,
    y,
    w: Math.max(4, Math.min(Math.round(box.w * image.width), image.width - x)),
    h: Math.max(4, Math.min(Math.round(box.h * image.height), image.height - y)),
  };
}

/** The element's own pixels inside the box it was reported in. */
export function maskForBox(image: RgbaImage, box: Box): Mask {
  return maskForPixelBox(image, toPixelBox(image, box));
}

export interface MeasuredShape {
  element: PptShapeElement;
  /** A header bar the panel turned out to have, as its own shape. */
  header: PptShapeElement | null;
}

/**
 * Measure one reported `native` element into an editable shape.
 *
 * Returns null when the measurement refuses it -- a traced outline that does
 * not agree with its own mask -- which is the signal to leave this element in
 * the background rather than draw it wrongly.
 */
export function measureShape(
  image: RgbaImage,
  reported: ReportedElement,
  id: string,
): MeasuredShape | null {
  const panel = refinePanel(image, reported.box, reported.shape);

  // A box that the corner test found open is a rounded rectangle, whatever
  // the model called it.
  let shape: ShapeName =
    (reported.shape === "rect" || reported.shape === "roundRect") && panel.rounded
      ? "roundRect"
      : reported.shape;

  const element: PptShapeElement = {
    id,
    type: "shape",
    shape,
    x: panel.x,
    y: panel.y,
    w: panel.w,
    h: panel.h,
    fill: panel.fill,
    stroke: panel.stroke || undefined,
  };

  if (shape === FREEFORM) {
    const blob = maskForBox(image, { x: panel.x, y: panel.y, w: panel.w, h: panel.h });
    const traced = tracePolygon(blob);
    // Refused: a wrong outline in the deck's own colours reads as a design
    // decision, where the element left in the background reads as nothing at
    // all. The second is recoverable; the first is not.
    if (!traced) return null;
    element.points = traced;
  } else if (isRingShape(shape)) {
    const blob = maskForBox(image, { x: panel.x, y: panel.y, w: panel.w, h: panel.h });
    const ratio = ringRatio(blob);
    element.innerRatio = ratio;
    // A ring whose hole could not be measured is a disc, and says so.
    if (shape === "donut" && !ratio) {
      shape = "oval";
      element.shape = "oval";
      delete element.innerRatio;
    }
  }

  const header = panel.header
    ? ({
        id: `${id}_header`,
        type: "shape",
        shape: panel.rounded ? "roundRect" : "rect",
        x: panel.header.x,
        y: panel.header.y,
        w: panel.header.w,
        h: panel.header.h,
        fill: panel.header.fill,
      } as PptShapeElement)
    : null;

  return { element, header };
}

/**
 * Every reported element measured into shapes, largest first.
 *
 * Only `native` entries become shapes. An `icon` is a drawing that has to be
 * cleaned and lifted out as its own picture, which is a separate stage; until
 * that exists an icon is left where it is, in the background.
 */
export function measureShapes(
  image: RgbaImage,
  reported: ReportedElement[],
  slideId: string,
  notes: string[] = [],
): PptShapeElement[] {
  const shapes: PptShapeElement[] = [];

  reported.forEach((entry, index) => {
    if (entry.kind !== "native") return;

    const measured = measureShape(image, entry, `${slideId}_s${index + 1}`);
    if (!measured) {
      notes.push(`"${entry.desc.slice(0, 24) || entry.shape}" could not be traced; left in the background`);
      return;
    }
    shapes.push(measured.element);
    if (measured.header) shapes.push(measured.header);
  });

  // Larger containers first, so a card cannot cover the badge sitting on it.
  return shapes.sort((a, b) => b.w * b.h - a.w * a.h);
}
