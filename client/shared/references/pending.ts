import type { ReferenceWorkspace, WorkReference } from "./types";

/**
 * A reference carried to another canvas by a shortcut button ("生成汇报 PPT",
 * "到自由画布修改"), waiting for that canvas to take it.
 *
 * Like pending-prompt.ts it lives only in memory: the button sets it right
 * before switching canvas, the target takes it once when it is ready. `intent`
 * says what the target should do with it.
 */

export type PendingReferenceIntent =
  /** Start a new deck from it (interior design → PPT report). */
  | { kind: "deck-source"; prompt?: string }
  /** Put the picture on the board, remembering where to send it back (PPT slide → free canvas). */
  | { kind: "board-edit"; returnTo: BoardReturnTo };

/** Where a picture taken to the free canvas goes back to: a slide of a deck. */
export interface BoardReturnTo {
  workId: string;
  slideId: string;
  /** "第 3 页" / "slide 3", for the button. */
  slideLabel: string;
  deckName: string;
}

export interface PendingReference {
  to: ReferenceWorkspace;
  reference: WorkReference;
  intent: PendingReferenceIntent;
}

let pending: PendingReference | null = null;

export function setPendingReference(value: PendingReference) {
  pending = value;
}

/** The waiting reference for this canvas, removed as it is read. */
export function takePendingReference(to: ReferenceWorkspace): PendingReference | null {
  if (!pending || pending.to !== to) return null;
  const value = pending;
  pending = null;
  return value;
}

export function peekPendingReference(to: ReferenceWorkspace): PendingReference | null {
  return pending?.to === to ? pending : null;
}
