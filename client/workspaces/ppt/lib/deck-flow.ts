/**
 * Making a deck, as one message in the chat: a chain of steps that follows the work on the canvas.
 *
 *   读参考资料 → 写大纲 → 确认大纲（挑风格，点生成）→ 生成幻灯片
 *
 * The message's text is a marker plus the steps' state, so the chain survives a refresh:
 *
 *   [[PPT_FLOW]]{"outline":{"state":"done","titles":[…]},"confirm":{"state":"waiting"},…}
 *
 * The canvas reports what it is doing as a `DeckActivity` (live, not saved); the chat folds that
 * into the latest flow message while a step is under way.
 */

export const FLOW_MARKER = "[[PPT_FLOW]]";

export type FlowStepState = "pending" | "running" | "done" | "error" | "waiting";

export interface DeckFlowSnapshot {
  reading?: { state: FlowStepState; files: number };
  outline: { state: FlowStepState; titles: string[]; error?: string };
  confirm: { state: FlowStepState; style?: string };
  slides: { state: FlowStepState; done: number; total: number; failed?: number };
}

/** What the canvas is doing right now, reported up to the chat. */
export interface DeckActivity {
  phase: "idle" | "reading" | "outlining" | "review" | "drawing" | "done" | "working";
  /** The outline's titles: as they stream in, then as edited on the canvas. */
  titles: string[];
  /** Pages drawn so far, while drawing. */
  drawn: number;
  total: number;
}

export const IDLE_ACTIVITY: DeckActivity = { phase: "idle", titles: [], drawn: 0, total: 0 };

export function newFlow(files: number): DeckFlowSnapshot {
  return {
    ...(files > 0 ? { reading: { state: "running" as const, files } } : {}),
    outline: { state: files > 0 ? "pending" : "running", titles: [] },
    confirm: { state: "pending" },
    slides: { state: "pending", done: 0, total: 0 },
  };
}

export function flowText(flow: DeckFlowSnapshot): string {
  return `${FLOW_MARKER}${JSON.stringify(flow)}`;
}

export function readFlow(text: unknown): DeckFlowSnapshot | null {
  if (typeof text !== "string" || !text.startsWith(FLOW_MARKER)) return null;
  try {
    const value = JSON.parse(text.slice(FLOW_MARKER.length));
    if (!value || typeof value !== "object" || !value.outline || !value.confirm || !value.slides) return null;
    return value as DeckFlowSnapshot;
  } catch {
    return null;
  }
}

/** A flow saved mid-step (the page was closed or refreshed): what was under way did not finish. */
export function closeInterrupted(flow: DeckFlowSnapshot): DeckFlowSnapshot {
  const stop = <T extends { state: FlowStepState }>(step: T): T => (step.state === "running" ? { ...step, state: "error" } : step);
  return {
    ...flow,
    ...(flow.reading ? { reading: stop(flow.reading) } : {}),
    outline: stop(flow.outline),
    slides: stop(flow.slides),
  };
}

/** Folds the canvas's live activity into the flow's running steps. */
export function applyActivity(flow: DeckFlowSnapshot, activity: DeckActivity): DeckFlowSnapshot {
  let next = flow;
  if (next.reading?.state === "running" && (activity.phase === "outlining" || activity.phase === "review")) {
    next = { ...next, reading: { ...next.reading, state: "done" }, outline: { ...next.outline, state: "running" } };
  }
  if (next.outline.state === "running" && activity.titles.length > 0) {
    next = { ...next, outline: { ...next.outline, titles: activity.titles } };
  }
  if (next.slides.state === "running") {
    if (activity.phase === "done") {
      const failed = Math.max(0, activity.total - activity.drawn);
      next = { ...next, slides: { state: failed === activity.total && activity.total > 0 ? "error" : "done", done: activity.drawn, total: activity.total, failed } };
    } else if (activity.phase === "drawing") {
      next = { ...next, slides: { ...next.slides, done: activity.drawn, total: activity.total } };
    }
  }
  return next;
}

/** The index of the flow message the live activity belongs to: the latest one. */
export function latestFlowIndex(messages: Array<{ role: string; content: unknown }>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && readFlow(messages[i].content)) return i;
  }
  return -1;
}

/** What the chat asks the canvas to do. */
export interface DeckCommand {
  id: string;
  kind: "generate" | "pick-style";
}
