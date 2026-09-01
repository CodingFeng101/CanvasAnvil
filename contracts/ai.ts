/**
 * The contract between the browser and the API.
 *
 * The client sends its AI settings with every request and the server
 * interprets them, so both sides need the same shape and the same
 * normalisation. Nothing here touches a browser or a Node API, which is what
 * lets it sit outside both.
 */

export interface AIChannel {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Persisted settings. Text and image are separate channels because the two
 * are commonly served by different endpoints; each is still plain OpenAI.
 */
export interface AIConfig {
  textApiKey: string;
  textBaseUrl: string;
  textModel: string;
  imageApiKey: string;
  imageBaseUrl: string;
  imageModel: string;
  fileParserApiToken: string;
  systemPrompt: string;
}

export type ChatRole = "system" | "user" | "assistant";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** The common case: a text-only turn. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A turn that may also carry images, using OpenAI's content-part array. */
export interface MultimodalMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface TextRequest {
  channel: AIChannel;
  messages: MultimodalMessage[];
  signal?: AbortSignal;
}

export interface ImageRequest {
  channel: AIChannel;
  prompt: string;
  /** Primary reference image. Its presence selects the `/images/edits` route. */
  referenceImageUrl?: string;
  additionalReferenceImageUrls?: string[];
  maskImageUrl?: string;
  signal?: AbortSignal;
}

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
