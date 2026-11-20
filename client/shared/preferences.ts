import { useSyncExternalStore } from "react";

/**
 * The user's app preferences (the Settings page), kept in localStorage and
 * applied the moment they change, as Claude's settings are: no Save button.
 *
 * Appearance switches that the whole page reads (reply font, paper grain,
 * reduced motion) are mirrored onto <html> as data attributes, so plain CSS
 * can follow them without every component subscribing.
 */

export interface Preferences {
  /** Enter sends (Shift+Enter breaks a line), or Ctrl/Cmd+Enter sends (Enter breaks a line). */
  sendKey: "enter" | "mod-enter";
  /** Ask before clearing a conversation. */
  confirmClear: boolean;
  /** What a fresh visit opens on. */
  startOn: "last" | "home" | "workspace";
  /** The AI's replies in the serif voice, or the interface's sans. */
  replyFont: "serif" | "sans";
  /** How wide the chat column grows while it has the room to itself. */
  chatWidth: "narrow" | "standard" | "wide";
  /** The faint paper texture on the ground. */
  paperGrain: boolean;
  /** Cut slides, fades and glides to a minimum. */
  reduceMotion: boolean;
  /** Open the canvas by itself once the AI has drawn something. */
  autoOpenCanvas: boolean;
  /** How much of the room the canvas takes when it opens. */
  canvasShare: "half" | "most";
  /** The thin outline of the conversation on the chat's left edge. */
  showMinimap: boolean;
  /** A desktop notification when a generation finishes while the page is in the background. */
  notifyDone: boolean;
  /** A soft chime when a generation finishes. */
  soundDone: boolean;
  /** Which chime. */
  chime: ChimeKind;
  /** How loud the chime is. */
  chimeVolume: "quiet" | "normal" | "loud";
  /** The working line shows a rough count of tokens produced. */
  showTokens: boolean;
  /** The thinking block stays open after the model has finished thinking. */
  thinkingOpen: boolean;
  /** Overall text size of the interface. */
  fontSize: "small" | "medium" | "large";
  /** Room between messages. */
  density: "comfortable" | "compact";
  /** The language the AI is asked to reply in. */
  replyLanguage: "auto" | "zh" | "en";
}

export type ChimeKind = "soft" | "bell" | "marimba" | "chord" | "pop" | "drop";

export const DEFAULT_PREFERENCES: Preferences = {
  sendKey: "enter",
  confirmClear: true,
  startOn: "last",
  replyFont: "serif",
  chatWidth: "standard",
  paperGrain: true,
  reduceMotion: false,
  autoOpenCanvas: true,
  canvasShare: "most",
  showMinimap: true,
  notifyDone: false,
  soundDone: false,
  chime: "soft",
  chimeVolume: "normal",
  showTokens: true,
  thinkingOpen: false,
  fontSize: "medium",
  density: "comfortable",
  replyLanguage: "auto",
};

const KEY = "CanvasAnvil-preferences-v1";
const listeners = new Set<() => void>();

function read(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Preferences>) : {};
    const merged = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
      const value = parsed[key];
      if (value !== undefined && typeof value === typeof DEFAULT_PREFERENCES[key]) (merged as Record<string, unknown>)[key] = value;
    }
    return merged;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let current: Preferences = typeof window === "undefined" ? { ...DEFAULT_PREFERENCES } : read();

function applyToDocument(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.replyFont = prefs.replyFont;
  root.dataset.grain = prefs.paperGrain ? "on" : "off";
  root.dataset.fontSize = prefs.fontSize;
  root.dataset.density = prefs.density;
  if (prefs.reduceMotion) root.dataset.reduceMotion = "";
  else delete root.dataset.reduceMotion;
}
applyToDocument(current);

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: kept for this visit only */
  }
  applyToDocument(current);
  for (const listener of listeners) listener();
}

export function resetPreferences() {
  current = { ...DEFAULT_PREFERENCES };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  applyToDocument(current);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences, getPreferences);
}

/** Whether this key press sends the message, by the user's choice of send key. */
export function isSendKey(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; nativeEvent?: { isComposing?: boolean } }): boolean {
  if (e.key !== "Enter" || e.nativeEvent?.isComposing) return false;
  if (current.sendKey === "mod-enter") return e.ctrlKey || e.metaKey;
  return !e.shiftKey && !e.ctrlKey && !e.metaKey;
}

/** The user asked for less motion, here or in the system settings. */
export function prefersReducedMotion(): boolean {
  if (current.reduceMotion) return true;
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
