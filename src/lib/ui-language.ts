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
  }
  try {
    window.dispatchEvent(new Event("ui-language-changed"));
  } catch {
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

