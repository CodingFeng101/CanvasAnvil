import { getUiLanguage } from "@/shared/i18n";
import type { ChatMessage } from "@contracts/ai";

/**
 * Agents in this app emit code, XML, and JSON as often as prose, so the output
 * language is pinned by an injected system message rather than left to the
 * model's guess. The prefix lets a re-send replace the previous policy instead
 * of stacking a second one.
 */
const POLICY_PREFIX = "UI_LANG_POLICY:";

const POLICIES: Record<"zh" | "en", string> = {
  en:
    `${POLICY_PREFIX} uiLang=en\n` +
    "All assistant outputs must be in English.\n" +
    "- Do not output Chinese characters.\n" +
    "- If an agent must output code/JSON/XML only, keep the required format and keep any fixed identifiers/schema keys; write any human-readable strings in English unless the schema mandates otherwise.",
  zh:
    `${POLICY_PREFIX} uiLang=zh\n` +
    "All assistant outputs must be in Simplified Chinese.\n" +
    "- Do not output English unless required for code, identifiers, proper nouns, or file paths.\n" +
    "- If an agent must output code/JSON/XML only, keep the required format and keep any fixed identifiers/schema keys; write any human-readable strings in Chinese unless the schema mandates otherwise.",
};

export function applyUiLanguagePolicy(messages: ChatMessage[]): ChatMessage[] {
  const withoutPrevious = (messages || []).filter(
    (message) => !(message.role === "system" && String(message.content || "").startsWith(POLICY_PREFIX)),
  );
  const policy: ChatMessage = { role: "system", content: POLICIES[getUiLanguage() === "en" ? "en" : "zh"] };
  return [policy, ...withoutPrevious];
}
