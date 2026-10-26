/**
 * The editable shape vocabulary: names, aliases, and the corner tables.
 *
 * One list, read by all three sides -- what the detector is allowed to answer
 * with, what the preview draws, and what the export writes. Kept together
 * because a vocabulary spread across those three drifts: a shape the detector
 * was invited to use but the exporter had never heard of comes out of the
 * pipeline as a rectangle, and looks like a measurement failure rather than a
 * missing table entry.
 *
 * Names are camelCase to match the shapes the deck already stores. The alias
 * table absorbs the snake_case spellings, so a detector trained to answer
 * `round_rect` needs no translation layer of its own.
 */

/** Traced rather than preset: carries its own points. */
export const FREEFORM = "polygon";

/** Shapes with a hole, whose inner radius is measured rather than assumed. */
export const RING_SHAPES = ["donut", "frame"] as const;

export const SHAPE_NAMES = [
  "rect", "roundRect", "oval", "donut", "line", "frame",
  "triangle", "rightTriangle", "diamond", "pentagon", "hexagon", "octagon",
  "trapezoid", "parallelogram", "plus", "tag",
  "star4", "star5", "star6",
  "arrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "chevron",
  // A callout with a tail. The deck offered this before the vocabulary grew,
  // and decks in the wild still carry it.
  "message",
  FREEFORM,
] as const;

export type ShapeName = (typeof SHAPE_NAMES)[number];

const ALIASES: Record<string, ShapeName> = {
  roundrect: "roundRect", roundedrect: "roundRect", roundedrectangle: "roundRect",
  ellipse: "oval", circle: "oval", square: "rect", rectangle: "rect",
  ring: "donut", annulus: "donut", border: "frame",
  cross: "plus", rhombus: "diamond", star: "star5",
  polyline: FREEFORM, path: FREEFORM, freeform: FREEFORM, curve: FREEFORM, wave: FREEFORM,
  righttriangle: "rightTriangle", leftarrow: "leftArrow",
  uparrow: "upArrow", downarrow: "downArrow",
  rightarrow: "arrow", leftrightarrow: "leftRightArrow",
  star4point: "star4", star5point: "star5", star6point: "star6",
  callout: "message", speechbubble: "message",
};

/** Whatever was written, as one of `SHAPE_NAMES`. Unknown becomes a rectangle. */
export function normalizeShapeName(value: unknown): ShapeName {
  const text = String(value ?? "").trim().toLowerCase().replace(/[-\s]/g, "_");
  const squashed = text.replace(/_/g, "");

  const direct = SHAPE_NAMES.find((name) => name.toLowerCase() === squashed);
  if (direct) return direct;

  return ALIASES[squashed] || ALIASES[text] || "rect";
}

export type UnitPoint = readonly [number, number];

const regular = (sides: number, turn = -Math.PI / 2): UnitPoint[] =>
  Array.from({ length: sides }, (_, i) => {
    const angle = turn + (i * 2 * Math.PI) / sides;
    return [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)] as UnitPoint;
  });

const star = (points: number, inner: number): UnitPoint[] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)] as UnitPoint;
  });

const arrow = (head = 0.6, waist = 0.3): UnitPoint[] => [
  [0, waist], [head, waist], [head, 0],
  [1, 0.5], [head, 1], [head, 1 - waist], [0, 1 - waist],
];

const flipX = (points: UnitPoint[]): UnitPoint[] => points.map(([x, y]) => [1 - x, y]);
const swap = (points: UnitPoint[]): UnitPoint[] => points.map(([x, y]) => [y, x]);

/**
 * Corners in fractions of the shape's own box.
 *
 * Anything absent is drawn by its own rule: rectangles, ovals, rings, the
 * callout's tail, and traced paths.
 */
export const UNIT_POINTS: Partial<Record<ShapeName, UnitPoint[]>> = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  rightTriangle: [[0, 0], [0, 1], [1, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regular(5),
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  octagon: [
    [0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71],
    [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29],
  ],
  trapezoid: [[0.22, 0], [0.78, 0], [1, 1], [0, 1]],
  parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  plus: [
    [0.34, 0], [0.66, 0], [0.66, 0.34], [1, 0.34], [1, 0.66],
    [0.66, 0.66], [0.66, 1], [0.34, 1], [0.34, 0.66], [0, 0.66],
    [0, 0.34], [0.34, 0.34],
  ],
  tag: [[0, 0], [0.72, 0], [1, 0.5], [0.72, 1], [0, 1]],
  star4: star(4, 0.35),
  star5: star(5, 0.38),
  star6: star(6, 0.45),
  arrow: arrow(),
  leftArrow: flipX(arrow()),
  upArrow: swap(flipX(arrow())),
  downArrow: swap(arrow()),
  chevron: [[0, 0], [0.72, 0], [1, 0.5], [0.72, 1], [0, 1], [0.28, 0.5]],
  leftRightArrow: [
    [0, 0.5], [0.25, 0], [0.25, 0.3], [0.75, 0.3], [0.75, 0],
    [1, 0.5], [0.75, 1], [0.75, 0.7], [0.25, 0.7], [0.25, 1],
  ],
};

export const isRingShape = (shape: ShapeName) =>
  (RING_SHAPES as readonly string[]).includes(shape);

/** The shape's corners inside a box, or null when it is not a polygon. */
export function shapeCorners(
  shape: ShapeName,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<[number, number]> | null {
  const unit = UNIT_POINTS[shape];
  if (!unit) return null;
  const width = x1 - x0;
  const height = y1 - y0;
  return unit.map(([px, py]) => [x0 + px * width, y0 + py * height]);
}

const polygonPath = (points: Array<readonly [number, number]>) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`).join(" ") + " Z";

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;

export interface ShapePathOptions {
  /** For a ring: how much of the radius is hole. 0 draws it solid. */
  innerRatio?: number;
  /** For `polygon`: the traced outline, in fractions of the shape's box. */
  points?: Array<readonly [number, number]>;
  /** Corner radius for `roundRect`, as a fraction of the short side. */
  cornerRatio?: number;
}

/**
 * An SVG path for a shape drawn in a `width` by `height` box.
 *
 * Rings come back as two subpaths and need `fill-rule: evenodd` to show their
 * hole; every other shape is a single closed path.
 */
export function buildShapePath(
  shape: ShapeName,
  width: number,
  height: number,
  options: ShapePathOptions = {},
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  if (shape === FREEFORM) {
    const points = options.points || [];
    // A traced path with nothing in it would vanish; a box is the honest
    // fallback, and says "something is here" rather than nothing.
    if (points.length < 3) return polygonPath([[0, 0], [w, 0], [w, h], [0, h]]);
    return polygonPath(points.map(([x, y]) => [x * w, y * h] as const));
  }

  if (shape === "oval") return ellipsePath(w / 2, h / 2, w / 2, h / 2);

  if (shape === "donut") {
    const inner = Math.min(0.95, Math.max(0, options.innerRatio ?? 0));
    const outer = ellipsePath(w / 2, h / 2, w / 2, h / 2);
    if (inner <= 0) return outer;
    return `${outer} ${ellipsePath(w / 2, h / 2, (w / 2) * inner, (h / 2) * inner)}`;
  }

  if (shape === "frame") {
    const inner = Math.min(0.95, Math.max(0, options.innerRatio ?? 0));
    const outer = polygonPath([[0, 0], [w, 0], [w, h], [0, h]]);
    if (inner <= 0) return outer;
    const insetX = (w * (1 - inner)) / 2;
    const insetY = (h * (1 - inner)) / 2;
    return `${outer} ${polygonPath([
      [insetX, insetY], [w - insetX, insetY], [w - insetX, h - insetY], [insetX, h - insetY],
    ])}`;
  }

  if (shape === "roundRect") {
    const r = Math.min(w, h) * (options.cornerRatio ?? 0.16);
    return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
  }

  if (shape === "message") {
    const r = Math.min(w, h) * 0.16;
    const tail = h * 0.18;
    return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - tail - r} Q ${w} ${h - tail} ${w - r} ${h - tail} L ${w * 0.52} ${h - tail} L ${w * 0.38} ${h} L ${w * 0.36} ${h - tail} L ${r} ${h - tail} Q 0 ${h - tail} 0 ${h - tail - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
  }

  const corners = shapeCorners(shape, 0, 0, w, h);
  if (corners) return polygonPath(corners);

  // rect, line, and anything unrecognised.
  return polygonPath([[0, 0], [w, 0], [w, h], [0, h]]);
}

/**
 * The OOXML preset each shape exports as.
 *
 * `polygon` has no preset; it is written as custom geometry from its own
 * points, which the exporter handles separately.
 */
export const PPTX_SHAPE: Record<Exclude<ShapeName, "polygon">, string> = {
  rect: "rect",
  roundRect: "roundRect",
  oval: "ellipse",
  donut: "donut",
  line: "line",
  frame: "frame",
  triangle: "triangle",
  rightTriangle: "rtTriangle",
  diamond: "diamond",
  pentagon: "pentagon",
  hexagon: "hexagon",
  octagon: "octagon",
  trapezoid: "trapezoid",
  parallelogram: "parallelogram",
  plus: "plus",
  tag: "homePlate",
  star4: "star4",
  star5: "star5",
  star6: "star6",
  arrow: "rightArrow",
  leftArrow: "leftArrow",
  upArrow: "upArrow",
  downArrow: "downArrow",
  leftRightArrow: "leftRightArrow",
  chevron: "chevron",
  message: "wedgeRoundRectCallout",
};
