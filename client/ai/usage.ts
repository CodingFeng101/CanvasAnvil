/**
 * Token usage as the model provider reported it, passed from the model calls
 * to the chat that shows it. Nothing here estimates: a provider that sends no
 * usage reports nothing, and nothing is shown.
 */
export type TokenUsage = { input?: number; output?: number };

type Listener = (usage: TokenUsage) => void;
const listeners = new Set<Listener>();

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** Read the `usage` our server forwards; undefined when it has no numbers. */
export function toTokenUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = count((raw as TokenUsage).input);
  const output = count((raw as TokenUsage).output);
  return input === undefined && output === undefined ? undefined : { input, output };
}

export function reportUsage(raw: unknown) {
  const usage = toTokenUsage(raw);
  if (usage) for (const listener of listeners) listener(usage);
}

export function onUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const imageListeners = new Set<() => void>();

/** A picture came back from the image model. */
export function reportImageMade() {
  for (const listener of imageListeners) listener();
}

export function onImageMade(listener: () => void): () => void {
  imageListeners.add(listener);
  return () => {
    imageListeners.delete(listener);
  };
}

/** Two reports added up; a side neither reported stays absent. */
export function addUsage(a: TokenUsage | null, b: TokenUsage): TokenUsage {
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  return { input: sum(a?.input, b.input), output: sum(a?.output, b.output) };
}

const modelListeners = new Set<(model: string) => void>();

/** A model answered a call (chat or image): Settings → Usage counts calls per model. */
export function reportModelCall(model: unknown) {
  if (typeof model !== "string" || !model.trim()) return;
  for (const listener of modelListeners) listener(model.trim());
}

export function onModelCall(listener: (model: string) => void): () => void {
  modelListeners.add(listener);
  return () => {
    modelListeners.delete(listener);
  };
}
