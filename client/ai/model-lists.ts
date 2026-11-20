import { useSyncExternalStore } from "react";
import type { AIConfig } from "@contracts/ai";
import { getAIConfig, saveAIConfig } from "@/ai/storage";

/**
 * The models the user can pick from, per channel. Each channel (text, image)
 * is set up once with its base URL and key; under it any number of model
 * names, one of them in use. The one in use is still the config's
 * `textModel` / `imageModel`, so everything that reads the config keeps
 * working; this only adds the list beside it.
 */

export type ModelChannel = "text" | "image";

const KEY = "CanvasAnvil-model-lists-v1";
const listeners = new Set<() => void>();
let version = 0;

function readLists(): Record<ModelChannel, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    const clean = (v: unknown) => (Array.isArray(v) ? v.filter((m): m is string => typeof m === "string" && !!m.trim()) : []);
    return { text: clean(parsed.text), image: clean(parsed.image) };
  } catch {
    return { text: [], image: [] };
  }
}

function writeLists(lists: Record<ModelChannel, string[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
  } catch {
    /* private mode */
  }
}

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

const field = (channel: ModelChannel): keyof AIConfig => (channel === "text" ? "textModel" : "imageModel");

/** The channel's models, the one in use always among them. */
export function getModels(channel: ModelChannel): { models: string[]; current: string } {
  const current = String(getAIConfig()[field(channel)] || "").trim();
  const list = readLists()[channel];
  const models = current && !list.includes(current) ? [current, ...list] : list;
  return { models, current };
}

export function addModel(channel: ModelChannel, name: string) {
  const model = name.trim();
  if (!model) return;
  const lists = readLists();
  const { models, current } = getModels(channel);
  if (!models.includes(model)) lists[channel] = [...models, model];
  else lists[channel] = models;
  writeLists(lists);
  if (!current) selectModel(channel, model);
  else notify();
}

export function removeModel(channel: ModelChannel, name: string) {
  const lists = readLists();
  const { models, current } = getModels(channel);
  lists[channel] = models.filter((m) => m !== name);
  writeLists(lists);
  if (current === name) selectModel(channel, lists[channel][0] ?? "");
  else notify();
}

export function selectModel(channel: ModelChannel, name: string) {
  const lists = readLists();
  const { models } = getModels(channel);
  lists[channel] = name && !models.includes(name) ? [...models, name] : models;
  writeLists(lists);
  saveAIConfig({ ...getAIConfig(), [field(channel)]: name });
  notify();
}

/** Re-render on any change to the lists or the model in use. */
export function useModels(channel: ModelChannel): { models: string[]; current: string } {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => version,
  );
  return getModels(channel);
}

/** Settings saved the config by hand (base URL, key): let pickers re-read it. */
export function modelsChanged() {
  notify();
}
