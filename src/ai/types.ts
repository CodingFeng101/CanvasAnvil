/**
 * Every model call in CanvasAnvil speaks the OpenAI HTTP protocol:
 * `POST {baseUrl}/chat/completions`, `POST {baseUrl}/images/generations`
 * and `POST {baseUrl}/images/edits`. Any vendor that exposes an
 * OpenAI-compatible endpoint is configured by pointing `baseUrl` at it —
 * there is no per-vendor branching anywhere in this module.
 */

/** One configured endpoint: where to send requests, with what credentials. */
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
