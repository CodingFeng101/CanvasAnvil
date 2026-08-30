import type { CreationStep } from "@/workspaces/ppt/canvas/types";

export interface CreationProgress {
  current: number;
  total: number;
  message: string;
}

export interface CreationState {
  step: CreationStep;
  progress: CreationProgress;
}

/**
 * What happened, rather than which state to enter.
 *
 * Six flows drive the deck through the same shape -- prepare, write, render,
 * finish or fail -- and each used to set the step and the progress bar as two
 * separate calls. Pairing them here is what stops the two from drifting: a
 * finished deck cannot be left showing a progress message, which is what the
 * one flow missing a `finally` used to do.
 */
export type CreationEvent =
  /** A stored workspace was loaded; resume where the user left off. */
  | { type: "restored"; step: CreationStep }
  /** A flow started. The input form stays up, showing this message. */
  | { type: "preparing"; message: string }
  /** A plan is ready for the user to review before rendering. */
  | { type: "outlined" }
  /** Slide text is being written. */
  | { type: "writing"; message: string }
  /** Slide images are being generated; the tracker owns the message from here. */
  | { type: "rendering"; message?: string }
  /** The deck is ready to show -- including when some slides failed. */
  | { type: "finished" }
  /** The flow gave up; go back to the start screen. */
  | { type: "failed" }
  /** The user started over. */
  | { type: "cleared" }
  /** Progress within the current step. */
  | { type: "progress"; current: number; total: number; message: string };

const NO_PROGRESS: CreationProgress = { current: 0, total: 0, message: "" };

export const initialCreationState = (step: CreationStep = "idle"): CreationState => ({
  step,
  progress: NO_PROGRESS,
});

export function creationReducer(state: CreationState, event: CreationEvent): CreationState {
  switch (event.type) {
    case "restored":
      return { step: event.step, progress: NO_PROGRESS };

    case "preparing":
      return { step: "input", progress: { current: 0, total: 0, message: event.message } };

    case "outlined":
      return { step: "outline", progress: NO_PROGRESS };

    case "writing":
      return {
        step: "generating_content",
        progress: { current: 0, total: 0, message: event.message },
      };

    case "rendering":
      return {
        step: "generating_images",
        // Without a message of its own, whatever the caller's progress tracker
        // has already reported stays on screen.
        progress: event.message ? { current: 0, total: 0, message: event.message } : state.progress,
      };

    case "finished":
      return { step: "done", progress: NO_PROGRESS };

    case "failed":
    case "cleared":
      return { step: "idle", progress: NO_PROGRESS };

    case "progress":
      return {
        step: state.step,
        progress: { current: event.current, total: event.total, message: event.message },
      };

    default:
      return state;
  }
}

/** The steps that put the canvas into its full-screen progress view. */
export function isGenerating(step: CreationStep): boolean {
  return step === "generating_content" || step === "generating_images";
}
