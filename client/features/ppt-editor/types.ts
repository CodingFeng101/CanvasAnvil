import type { PptElement, PptPage, PptTextBlock } from "@/lib/ppt-service";
import type { EditorShapeType } from "@/features/ppt-editor/shape-config";

export type EditorElementType = "text" | "image" | "shape" | "table" | "chart" | "formula" | "video" | "audio";
export const EDITOR_CHART_TYPES = ["bar", "column", "line", "area", "scatter", "pie", "ring", "radar"] as const;
export type EditorChartType = (typeof EDITOR_CHART_TYPES)[number];

export interface EditorElementBase {
  id: string;
  type: EditorElementType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorTextElement extends EditorElementBase {
  type: "text";
  text: string;
  role: PptTextBlock["role"];
  style?: PptTextBlock["style"];
}

export interface EditorImageElement extends EditorElementBase {
  type: "image";
  src: string;
  fit?: "cover" | "contain" | "stretch";
}

export interface EditorShapeElement extends EditorElementBase {
  type: "shape";
  shape: EditorShapeType;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface EditorTableElement extends EditorElementBase {
  type: "table";
  rows: string[][];
  headerRows?: number;
  fill?: string;
  stroke?: string;
  textColor?: string;
}

export interface EditorChartDatum {
  label: string;
  value: number;
}

export interface EditorChartElement extends EditorElementBase {
  type: "chart";
  chartType: EditorChartType;
  title?: string;
  data: EditorChartDatum[];
  color?: string;
}

export interface EditorFormulaElement extends EditorElementBase {
  type: "formula";
  latex: string;
  fontSize?: number;
  color?: string;
}

export interface EditorVideoElement extends EditorElementBase {
  type: "video";
  src: string;
  poster?: string;
  title?: string;
}

export interface EditorAudioElement extends EditorElementBase {
  type: "audio";
  src: string;
  title?: string;
}

export type EditorElement =
  | EditorTextElement
  | EditorImageElement
  | EditorShapeElement
  | EditorTableElement
  | EditorChartElement
  | EditorFormulaElement
  | EditorVideoElement
  | EditorAudioElement;

export interface EditorSlide {
  id: string;
  title: string;
  content: string[];
  description?: string;
  note?: string;
  layout?: string;
  backgroundImageUrl?: string;
  elements: EditorElement[];
}

export interface CanvasAnvilSlideLike {
  id: string;
  title: string;
  content: string[];
  description?: string;
  note?: string;
  layout?: string;
}

export interface CanvasAnvilRenderLayerLike {
  backgroundImageUrl?: string;
  textBlocks?: PptTextBlock[];
  elements?: PptElement[];
  status?: "pending" | "ready" | "failed";
  error?: string;
}

export interface EditorExportPayload {
  page: PptPage;
  textBlocks: PptTextBlock[];
  elements: PptElement[];
}
