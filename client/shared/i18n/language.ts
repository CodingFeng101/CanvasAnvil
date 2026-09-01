import { useEffect, useState } from "react";

/**
 * The interface language, stored once and broadcast on change so every
 * component -- context-wrapped or not -- can react without prop drilling.
 */

export type UiLanguage = "zh" | "en";

const UI_LANG_STORAGE_KEY = "CanvasAnvil-ui-lang-v1";

export function getUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return "zh";
  const raw = String(localStorage.getItem(UI_LANG_STORAGE_KEY) || "").trim().toLowerCase();
  if (raw === "en") return "en";
  if (raw === "zh") return "zh";
  return "zh";
}

export function setUiLanguage(lang: UiLanguage) {
  if (typeof window === "undefined") return;
  localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  try {
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
  } catch {
    // A blocked localStorage only means the old history lingers.
  }
  try {
    window.dispatchEvent(new Event("ui-language-changed"));
  } catch {
    // No window to notify (server render, or a detached document).
  }
}

export function detectLanguageFromText(text: string): UiLanguage | null {
  const raw = String(text || "");
  if (/[\u4E00-\u9FFF]/.test(raw)) return "zh";
  if (/[A-Za-z]/.test(raw)) return "en";
  return null;
}

export function resolveResponseLanguage(args: { userText: string; uiLang: UiLanguage }): UiLanguage {
  return detectLanguageFromText(args.userText) || args.uiLang;
}

/** Subscribes to the change event above; use inside components. */
export function useUiLanguage() {
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());

  useEffect(() => {
    const onLang = () => setUiLang(getUiLanguage());
    window.addEventListener("ui-language-changed", onLang as any);
    return () => window.removeEventListener("ui-language-changed", onLang as any);
  }, []);

  return uiLang;
}
