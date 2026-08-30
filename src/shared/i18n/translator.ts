import { getUiLanguage, useUiLanguage, type UiLanguage } from "@/shared/i18n/language";

/**
 * One translation mechanism, many dictionaries.
 *
 * The app shell and each workspace own their own strings — the same key means
 * different things in different places ("history.title" is "Version History"
 * in the shell and "Diagram History" in Flow) — but they all look those
 * strings up the same way and follow the same language setting.
 */

export type Dict = Record<string, Record<UiLanguage, string>>;

/** Substitutes `{{name}}` placeholders; an unknown key falls back to itself. */
function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{{${name}}}`).join(String(value));
  }
  return out;
}

export function createTranslator<D extends Dict>(dict: D) {
  type Key = Extract<keyof D, string>;

  /** Explicit language — for code outside React, or where the language is already known. */
  const t = (lang: UiLanguage, key: Key, vars?: Record<string, string | number>) =>
    format(dict[key]?.[lang] ?? key, vars);

  /** Current language, read from storage. */
  const translate = (key: Key, vars?: Record<string, string | number>) => t(getUiLanguage(), key, vars);

  /** Current language, re-rendering when the user switches it. */
  const useT = () => {
    const lang = useUiLanguage();
    return (key: Key, vars?: Record<string, string | number>) => t(lang, key, vars);
  };

  return { t, translate, useT };
}
