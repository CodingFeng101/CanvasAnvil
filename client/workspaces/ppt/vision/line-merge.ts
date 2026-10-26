/**
 * Joining the OCR's lines back into paragraphs.
 *
 * OCR reports one box per line, so a four-line bullet arrives as four text
 * boxes and editing it in PowerPoint means editing four things.
 *
 * Lines are chained by looking downward for each block's own successor rather
 * than by scanning in reading order. Reading order interleaves side-by-side
 * columns, which severs every paragraph on a two-column page -- and a slide
 * laid out in cards, which is most of them, is a two-column page.
 */

import type { MeasuredTextBlock } from "@/workspaces/ppt/vision/types";

/**
 * Colours measured off small anti-aliased glyphs drift line to line, so the
 * merge test is loose. Geometry and size carry the decision; colour only has
 * to rule out a genuinely different run of text.
 */
const MERGE_COLOUR_TOLERANCE = 100;

function colorDistance(left: string, right: string): number {
  const channels = (value: string): [number, number, number] | null => {
    const hex = value.replace(/^#/, "");
    if (hex.length < 6) return null;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : [r, g, b];
  };

  const a = channels(left);
  const b = channels(right);
  if (!a || !b) return 255;
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** Is `block` the next line of the paragraph `previous` starts? */
export function continuesParagraph(previous: MeasuredTextBlock, block: MeasuredTextBlock): boolean {
  const lineHeight = previous.h;
  if (lineHeight <= 0) return false;

  const gap = block.y - (previous.y + previous.h);
  if (gap < -lineHeight * 0.25 || gap > lineHeight * 1.5) return false;
  // Left edges have to agree: a paragraph is a stack, not a staircase.
  if (Math.abs(block.x - previous.x) > Math.max(0.006, previous.w * 0.15)) return false;

  return (
    Math.abs(block.fontSizePt - previous.fontSizePt) <= Math.max(1, previous.fontSizePt * 0.12) &&
    colorDistance(block.color, previous.color) <= MERGE_COLOUR_TOLERANCE &&
    block.bold === previous.bold &&
    block.bullet === previous.bullet
  );
}

const byReadingOrder = (a: MeasuredTextBlock, b: MeasuredTextBlock) => a.y - b.y || a.x - b.x;

/** Join consecutive OCR lines that belong to one paragraph. */
export function mergeLines(blocks: MeasuredTextBlock[]): MeasuredTextBlock[] {
  if (blocks.length === 0) return blocks;

  const ordered = [...blocks].sort(byReadingOrder);
  const successor = new Map<number, number>();
  const claimed = new Set<number>();

  for (let i = 0; i < ordered.length; i += 1) {
    let best: number | null = null;
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (claimed.has(j) || !continuesParagraph(ordered[i], ordered[j])) continue;
      // The nearest candidate below wins, so a paragraph cannot reach past
      // its own next line to grab one further down.
      if (best === null || ordered[j].y < ordered[best].y) best = j;
    }
    if (best !== null) {
      successor.set(i, best);
      claimed.add(best);
    }
  }

  const merged: MeasuredTextBlock[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    if (claimed.has(i)) continue;

    const head = ordered[i];
    const chain = [head];
    let cursor = i;
    while (successor.has(cursor)) {
      cursor = successor.get(cursor)!;
      chain.push(ordered[cursor]);
    }

    if (chain.length === 1) {
      merged.push(head);
      continue;
    }

    const left = Math.min(...chain.map((item) => item.x));
    const top = Math.min(...chain.map((item) => item.y));
    const right = Math.max(...chain.map((item) => item.x + item.w));
    const bottom = Math.max(...chain.map((item) => item.y + item.h));

    merged.push({
      ...head,
      text: chain.map((item) => item.text).join("\n"),
      x: left,
      y: top,
      w: Math.min(1 - left, right - left),
      h: Math.min(1 - top, bottom - top),
      confidence: Math.min(...chain.map((item) => item.confidence)),
    });
  }

  return merged.sort(byReadingOrder);
}
