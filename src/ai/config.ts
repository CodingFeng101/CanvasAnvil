import type { AIChannel, AIConfig } from "./types";

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export const DEFAULT_AI_CONFIG: AIConfig = {
  textApiKey: "",
  textBaseUrl: DEFAULT_BASE_URL,
  textModel: "gpt-4o-mini",
  imageApiKey: "",
  imageBaseUrl: DEFAULT_BASE_URL,
  imageModel: "gpt-image-1",
  fileParserApiToken: "",
  systemPrompt: "",
};

const STORAGE_KEY = "unified_ai_workspace_config";

const str = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

/**
 * Coerce anything that claims to be an AIConfig into a complete one.
 *
 * Also migrates configs written by the pre-OpenAI-only settings dialog, which
 * stored a single shared `apiKey`/`baseUrl` alongside per-channel overrides
 * and named the models `chatModel` / `imageModelLegacy`.
 */
export function normalizeAIConfig(raw: unknown): AIConfig {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sharedApiKey = str(input.apiKey);
  const sharedBaseUrl = str(input.baseUrl);

  return {
    textApiKey: str(input.textApiKey, sharedApiKey),
    textBaseUrl: str(input.textBaseUrl, sharedBaseUrl || DEFAULT_BASE_URL),
    textModel: str(input.textModel, str(input.chatModel)),
    imageApiKey: str(input.imageApiKey, sharedApiKey),
    imageBaseUrl: str(input.imageBaseUrl, sharedBaseUrl || DEFAULT_BASE_URL),
    imageModel: str(input.imageModel, str(input.imageModelLegacy)),
    fileParserApiToken: str(input.fileParserApiToken),
    systemPrompt: String(input.systemPrompt ?? "").trim(),
  };
}

export function getTextChannel(config: AIConfig): AIChannel {
  return {
    apiKey: config.textApiKey,
    baseUrl: config.textBaseUrl || DEFAULT_BASE_URL,
    model: config.textModel,
  };
}

export function getImageChannel(config: AIConfig): AIChannel {
  return {
    apiKey: config.imageApiKey,
    baseUrl: config.imageBaseUrl || DEFAULT_BASE_URL,
    model: config.imageModel,
  };
}

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
