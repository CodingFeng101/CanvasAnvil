/*
 * The AI's pen while it draws: a queue of outlines for the pen to trace
 * (shared/canvas-pen draws them). Whoever draws hands over each new shape,
 * stroke or wall as an outline in the window's coordinates; the pen traces
 * it, and only then is the real thing put on the canvas (`done`), so the
 * drawing appears under the pen.
 */

export type PenPoint = { x: number; y: number };

export interface PenStroke {
  /** Runs before the stroke is measured: bring it into view, say. */
  prepare?: () => Promise<void> | void;
  /** The outline to trace, in the window's coordinates, measured when its turn comes; null skips it. */
  points: () => PenPoint[] | null;
  /** The pen has traced it (or skipped it): put the real thing on the canvas. */
  done?: () => void;
}

export interface PenStore {
  trace(stroke: PenStroke): void;
  /** Drop everything still to trace and lift the pen (nothing queued is put on the canvas). */
  clear(): void;
  take(): PenStroke | undefined;
  pending(): number;
  /** Goes up on every clear, so a stroke under way can tell it was dropped. */
  epoch(): number;
  subscribe(listener: () => void): () => void;
}

export function createPenStore(): PenStore {
  let queue: PenStroke[] = [];
  let epoch = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    trace(stroke) {
      queue.push(stroke);
      notify();
    },
    clear() {
      queue = [];
      epoch += 1;
      notify();
    },
    take: () => queue.shift(),
    pending: () => queue.length,
    epoch: () => epoch,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
