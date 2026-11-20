import { getPreferences } from "@/shared/preferences";
import { useSyncExternalStore } from "react";
import { STORAGE_GLOBAL_CONSTRAINTS_KEY } from "@/shared/chat/global-constraints-dialog";

/**
 * Standing instructions added to every request (Settings → Constraints):
 * one set for all four canvases and one per canvas, each switchable.
 *
 * The per-canvas texts keep the keys the workspaces shipped with, so nobody's
 * saved constraints disappear: the diagram's own key, and the shared
 * `CanvasAnvil-global-constraints-<workspace>` for CAD and PPT.
 */

export type ConstraintScope = "all" | "diagram" | "cad" | "ppt" | "canvas";

export const CONSTRAINT_KEYS: Record<ConstraintScope, string> = {
  all: `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-all`,
  diagram: "next-ai-draw-io-global-constraints",
  cad: `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-cad`,
  ppt: `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-ppt`,
  canvas: `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-canvas`,
};

const ENABLED_KEY = "CanvasAnvil-constraints-enabled-v1";
const listeners = new Set<() => void>();
let version = 0;

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function readEnabled(): Partial<Record<ConstraintScope, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(ENABLED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getConstraint(scope: ConstraintScope): { text: string; enabled: boolean } {
  return { text: read(CONSTRAINT_KEYS[scope]), enabled: readEnabled()[scope] !== false };
}

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export function setConstraintText(scope: ConstraintScope, text: string) {
  try {
    localStorage.setItem(CONSTRAINT_KEYS[scope], text);
  } catch {
    /* private mode */
  }
  notify();
}

export function setConstraintEnabled(scope: ConstraintScope, enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify({ ...readEnabled(), [scope]: enabled }));
  } catch {
    /* private mode */
  }
  notify();
}

/** What a canvas adds to its requests: the all-canvas set, then its own, each only while switched on. */
export function constraintsFor(workspace: Exclude<ConstraintScope, "all">): string {
  const parts = (["all", workspace] as const)
    .map((scope) => getConstraint(scope))
    .filter((c) => c.enabled && c.text.trim())
    .map((c) => c.text.trim());
  // Settings → General → reply language.
  const language = getPreferences().replyLanguage;
  if (language === "zh") parts.push("请始终用简体中文回复。");
  if (language === "en") parts.push("Always reply in English.");
  return parts.join("\n\n");
}

/** Re-render when constraints change (the settings page). */
export function useConstraintsVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => version,
  );
}
