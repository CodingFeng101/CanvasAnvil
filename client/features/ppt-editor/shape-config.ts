/**
 * The editor's shape palette, over the deck's shape vocabulary.
 *
 * The vocabulary itself lives with the deck, in `ppt-service`'s `shapes`
 * module, because the detector and the exporter read it too. Only the choice
 * of which shapes to offer in the toolbar belongs here.
 */

import {
  buildShapePath,
  SHAPE_NAMES,
  type ShapeName,
  type ShapePathOptions,
} from "@/workspaces/ppt/lib/shapes";

export const EDITOR_SHAPE_TYPES = SHAPE_NAMES;
export type EditorShapeType = ShapeName;

export const buildEditorShapePath = (
  shape: EditorShapeType,
  width: number,
  height: number,
  options?: ShapePathOptions,
) => buildShapePath(shape, width, height, options);

/**
 * What the toolbar offers, in the order it offers it.
 *
 * A subset of the vocabulary: `line` has its own tool, `polygon` is traced
 * rather than placed, and the arrows and stars are grouped after the
 * containers because that is the order people reach for them in.
 */
export const EDITOR_SHAPE_PRESETS: Array<{
  type: Exclude<EditorShapeType, "line" | "polygon">;
  label: string;
}> = [
  { type: "rect", label: "Rectangle" },
  { type: "roundRect", label: "Round Rect" },
  { type: "oval", label: "Oval" },
  { type: "donut", label: "Ring" },
  { type: "frame", label: "Frame" },
  { type: "triangle", label: "Triangle" },
  { type: "rightTriangle", label: "Right Triangle" },
  { type: "diamond", label: "Diamond" },
  { type: "pentagon", label: "Pentagon" },
  { type: "hexagon", label: "Hexagon" },
  { type: "octagon", label: "Octagon" },
  { type: "trapezoid", label: "Trapezoid" },
  { type: "parallelogram", label: "Parallelogram" },
  { type: "plus", label: "Cross" },
  { type: "tag", label: "Tag" },
  { type: "star4", label: "Star (4)" },
  { type: "star5", label: "Star (5)" },
  { type: "star6", label: "Star (6)" },
  { type: "arrow", label: "Arrow Right" },
  { type: "leftArrow", label: "Arrow Left" },
  { type: "upArrow", label: "Arrow Up" },
  { type: "downArrow", label: "Arrow Down" },
  { type: "leftRightArrow", label: "Arrow Both" },
  { type: "chevron", label: "Chevron" },
  { type: "message", label: "Callout" },
];
