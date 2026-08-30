import { DEFAULT_AI_CONFIG, normalizeAIConfig, type AIConfig } from "@contracts/ai";

/**
 * Where the browser keeps the user's model settings.
 *
 * The shape and its normalisation are shared with the server (see
 * @contracts/ai); only the storage is browser-specific, which is why it lives
 * here rather than in the contract.
 */

const STORAGE_KEY = "unified_ai_workspace_config";

export function getAIConfig(): AIConfig {
  if (typeof window === "undefined") return DEFAULT_AI_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_AI_CONFIG;
  try {
    return normalizeAIConfig({ ...DEFAULT_AI_CONFIG, ...JSON.parse(stored) });
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A storage that cannot be written to cannot be repaired; fall through.
    }
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAIConfig(config: AIConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAIConfig(config)));
}
