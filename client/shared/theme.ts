import { useEffect, useState } from "react";

/**
 * The colour theme, stored once and broadcast on change — same shape as the
 * UI-language store next door.
 *
 * This used to live inside the Flow workspace, which meant a control buried in
 * one canvas was mutating `documentElement` for the whole app: switching away
 * from Flow left its theme behind with nothing left on screen to undo it.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "CanvasAnvil-theme-v1";
/** Flow's old key, read once so an existing preference survives the move. */
const LEGACY_DARK_KEY = "next-ai-draw-io-dark-mode";

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";

  const raw = String(localStorage.getItem(THEME_STORAGE_KEY) || "").trim().toLowerCase();
  if (raw === "light" || raw === "dark" || raw === "system") return raw;

  const legacy = localStorage.getItem(LEGACY_DARK_KEY);
  if (legacy === "true") return "dark";
  if (legacy === "false") return "light";

  return "system";
}

export function resolveTheme(theme: Theme = getTheme()): ResolvedTheme {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

/** Writes the class the Tailwind `dark:` variant keys off. */
export function applyTheme(theme: Theme = getTheme()) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A blocked localStorage only costs us persistence across reloads.
  }
  applyTheme(theme);
  try {
    window.dispatchEvent(new Event("ui-theme-changed"));
  } catch {
    // No window to notify (server render, or a detached document).
  }
}

/**
 * Subscribes to the change event above, and to the OS setting while the theme
 * is "system" — so following the system means actually following it, not just
 * sampling it once at mount.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme());

  useEffect(() => {
    const sync = () => {
      const next = getTheme();
      setThemeState(next);
      setResolved(resolveTheme(next));
    };

    window.addEventListener("ui-theme-changed", sync);

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", sync);

    return () => {
      window.removeEventListener("ui-theme-changed", sync);
      media?.removeEventListener?.("change", sync);
    };
  }, []);

  return { theme, resolved, setTheme, isDark: resolved === "dark" };
}
