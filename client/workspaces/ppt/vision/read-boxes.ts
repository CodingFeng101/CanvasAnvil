/**
 * The results the reader throws away.
 *
 * Three classes of OCR output do damage rather than nothing, and each one
 * costs more than the text it would have contributed:
 *
 *   * A short, low-confidence string is usually an icon read as a glyph. Left
 *     in, it writes nonsense into the deck *and* lets the ink mask eat the
 *     icon, because the icon's own pixels become "text" to be measured.
 *   * A lone latin character is an icon far more often than it is text.
 *   * Slanted text rebuilt in an upright box lands wrong, so it is better
 *     left painted into the background than placed badly.
 */

import type { Quad } from "@/workspaces/ppt/vision/geometry";
import type { OcrBox } from "@/workspaces/ppt/vision/types";

const MIN_CONFIDENCE = 0.5;
const SHORT_STRING_CONFIDENCE = 0.75;
const SHORT_STRING_LENGTH = 2;
const LONE_GLYPH_CONFIDENCE = 0.9;
const MAX_SKEW = 0.45;

const CJK_PATTERN = /[㐀-鿿豈-﫿　-〿]/;

export interface RecognisedQuad {
  quad: Quad;
  text: string;
  confidence: number;
}

/** True when this reading is worth keeping. */
export function isUsableReading(reading: RecognisedQuad): boolean {
  const text = String(reading.text || "").trim();
  const confidence = Number(reading.confidence);

  if (!text || !Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return false;
  if (confidence < SHORT_STRING_CONFIDENCE && text.length <= SHORT_STRING_LENGTH) return false;
  // "01" and "02" style markers are two characters and survive this.
  if (text.length === 1 && !CJK_PATTERN.test(text) && confidence < LONE_GLYPH_CONFIDENCE) return false;

  const xs = reading.quad.map((point) => point.x);
  const ys = reading.quad.map((point) => point.y);
  const height = Math.max(...ys) - Math.min(...ys);
  if (Math.max(...xs) - Math.min(...xs) <= 1 || height <= 1) return false;

  // The tilt of the top edge, which is where a slanted line shows itself.
  return Math.abs(ys[0] - ys[1]) <= height * MAX_SKEW;
}

/** Readings the measurement chain should see, as upright boxes. */
export function toOcrBoxes(readings: RecognisedQuad[]): OcrBox[] {
  return readings.filter(isUsableReading).map((reading) => {
    const xs = reading.quad.map((point) => point.x);
    const ys = reading.quad.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);

    return {
      text: String(reading.text).trim(),
      confidence: reading.confidence,
      x: Math.trunc(x),
      y: Math.trunc(y),
      w: Math.round(Math.max(...xs) - x),
      h: Math.round(Math.max(...ys) - y),
    };
  });
}
