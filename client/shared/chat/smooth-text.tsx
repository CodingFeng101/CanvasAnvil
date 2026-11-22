import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/shared/preferences";

/*
 * Streaming text, revealed at an even pace.
 *
 * Models send text in bursts: nothing for a moment, then a sentence at once.
 * Shown as it arrives, the reply jumps forward a line at a time. Here what has
 * arrived but is not on screen yet is let out a little every frame, faster the
 * more is waiting (it drains in about a quarter of a second), so the text runs
 * on smoothly however it comes in and never falls far behind. When the stream
 * ends the last of it runs out the same way instead of landing in one block.
 *
 * Text the page opened with, and text that was never streaming, shows at once.
 */

/** About how long a burst takes to come out. */
const DRAIN_MS = 260;
/** At most this often: each step re-renders (and re-parses) the reply. */
const STEP_MS = 32;

export function useSmoothText(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(text);
  const targetRef = useRef(text);
  targetRef.current = text;
  /** Streaming now, or finished but with text still to let out. */
  const [running, setRunning] = useState(streaming);
  if (streaming && !running) setRunning(true);

  useEffect(() => {
    const snap = () => {
      shownRef.current = text;
      setShown(text);
      setRunning(false);
    };
    if (!running) {
      shownRef.current = text;
      return;
    }
    // A replaced text (an edit, a retry), or less motion asked for: show it all.
    if (!text.startsWith(shownRef.current) || prefersReducedMotion()) return snap();
    if (shownRef.current.length >= text.length) {
      if (!streaming) setRunning(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const step = (now: number) => {
      const elapsed = now - last;
      if (elapsed >= STEP_MS) {
        last = now;
        const target = targetRef.current;
        const backlog = target.length - shownRef.current.length;
        carry += Math.max(1, (backlog * elapsed) / DRAIN_MS);
        const take = Math.floor(carry);
        carry -= take;
        let end = Math.min(target.length, shownRef.current.length + take);
        // Never stop in the middle of a surrogate pair (an emoji, a rare character).
        const code = target.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff && end < target.length) end += 1;
        shownRef.current = target.slice(0, end);
        setShown(shownRef.current);
        if (end >= target.length) {
          if (!streaming) setRunning(false);
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, streaming, running]);

  return running ? shown : text;
}

/** The same, for a spot inside a list where a hook cannot go. */
export function SmoothText({ text, streaming, children }: { text: string; streaming: boolean; children: (shown: string) => ReactNode }) {
  return <>{children(useSmoothText(text, streaming))}</>;
}
