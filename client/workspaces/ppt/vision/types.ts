/** The vocabulary shared by the OCR reader and the measurement chain. */

/** An RGBA raster, the shape a canvas `ImageData` already has. */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** One line as the OCR model reported it, reduced to an upright box. */
export interface OcrBox {
  text: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The raw measurements behind a block's weight decision.
 *
 * Kept on the block rather than discarded because bold is not absolutely
 * decidable from one image: when the automatic call is wrong, a threshold can
 * be pinned instead and these values re-used, so one calibration serves a
 * whole batch of art from the same template.
 */
export interface TextMetrics {
  strokePx: number;
  strokeRatio: number;
  strokeCv: number;
  slant: number;
}

/** One text block, with every style value measured off the pixels. */
export interface MeasuredTextBlock {
  id: string;
  text: string;
  /** Slide fractions: x, y, w, h in 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Points against a 960pt-wide slide, which is what PPTX wants. */
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  serif: boolean;
  script: "cjk" | "latin";
  align: "left" | "center" | "right";
  bullet: boolean;
  confidence: number;
  metrics: TextMetrics;
}

/**
 * How to decide weight.
 *
 * `auto` regresses stroke ratio against font size and calls the outliers
 * bold; `ratio:<n>` pins a threshold when that guess is wrong for a
 * particular template.
 */
export type BoldMode = "auto" | "off" | "on" | `ratio:${string}`;
