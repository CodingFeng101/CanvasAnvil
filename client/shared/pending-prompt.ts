import { useEffect, useRef } from "react";

/**
 * A sentence written on the portal, waiting for the canvas it opens.
 *
 * The portal sets it right before switching to a workspace; that workspace's
 * chat panel takes it once on mount and puts it in its input box. It is never
 * sent on its own, and it lives only in memory, so a reload drops it.
 */
let pending: { workspace: string; text: string } | null = null;

export function setPendingPrompt(workspace: string, text: string) {
  const trimmed = text.trim();
  pending = trimmed ? { workspace, text: trimmed } : null;
}

/** The waiting sentence for this workspace, removed as it is read. */
export function takePendingPrompt(workspace: string): string | null {
  if (!pending || pending.workspace !== workspace) return null;
  const { text } = pending;
  pending = null;
  return text;
}

/** How long a panel must stay mounted before the sentence counts as delivered. */
const SETTLE_MS = 1000;

/**
 * On mount, put a waiting sentence for `workspace` into the input via `apply`.
 *
 * It is applied one tick after mount, once every mount effect has run: an
 * input that resets itself on mount (the PPT rich input does) would otherwise
 * wipe it again. The sentence is dropped only after the panel has stayed
 * mounted for a moment: a workspace that rebuilds its layout right after
 * mounting (the diagram one does, keyed on its mobile check) mounts a second
 * panel, and that one fills itself in again.
 */
export function usePendingPrompt(workspace: string, apply: (text: string) => void) {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    const waiting = pending;
    if (waiting?.workspace !== workspace) return;
    const fill = window.setTimeout(() => applyRef.current(waiting.text), 0);
    const settle = window.setTimeout(() => {
      if (pending === waiting) pending = null;
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(fill);
      window.clearTimeout(settle);
    };
  }, [workspace]);
}
