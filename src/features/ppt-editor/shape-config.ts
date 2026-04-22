export const EDITOR_SHAPE_TYPES = [
  "rect",
  "roundRect",
  "triangle",
  "parallelogram",
  "trapezoid",
  "hexagon",
  "chevron",
  "message",
  "line",
] as const;

export type EditorShapeType = (typeof EDITOR_SHAPE_TYPES)[number];

export const EDITOR_SHAPE_PRESETS: Array<{
  type: Exclude<EditorShapeType, "line">;
  label: string;
}> = [
  { type: "rect", label: "Rectangle" },
  { type: "roundRect", label: "Round Rect" },
  { type: "triangle", label: "Triangle" },
  { type: "parallelogram", label: "Parallelogram" },
  { type: "trapezoid", label: "Trapezoid" },
  { type: "hexagon", label: "Hexagon" },
  { type: "chevron", label: "Chevron" },
  { type: "message", label: "Callout" },
];

export const buildEditorShapePath = (shape: EditorShapeType, width: number, height: number) => {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = Math.min(w, h) * 0.16;
  switch (shape) {
    case "roundRect":
      return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    case "triangle":
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case "parallelogram": {
      const dx = w * 0.18;
      return `M ${dx} 0 L ${w} 0 L ${w - dx} ${h} L 0 ${h} Z`;
    }
    case "trapezoid": {
      const inset = w * 0.16;
      return `M ${inset} 0 L ${w - inset} 0 L ${w} ${h} L 0 ${h} Z`;
    }
    case "hexagon": {
      const inset = w * 0.18;
      return `M ${inset} 0 L ${w - inset} 0 L ${w} ${h / 2} L ${w - inset} ${h} L ${inset} ${h} L 0 ${h / 2} Z`;
    }
    case "chevron": {
      const inset = w * 0.22;
      return `M 0 0 L ${w - inset} 0 L ${w} ${h / 2} L ${w - inset} ${h} L 0 ${h} L ${inset} ${h / 2} Z`;
    }
    case "message": {
      const tailW = w * 0.18;
      const tailH = h * 0.18;
      return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - tailH - r} Q ${w} ${h - tailH} ${w - r} ${h - tailH} L ${w * 0.52} ${h - tailH} L ${w * 0.38} ${h} L ${w * 0.36} ${h - tailH} L ${r} ${h - tailH} Q 0 ${h - tailH} 0 ${h - tailH - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    }
    case "rect":
    default:
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  }
};
