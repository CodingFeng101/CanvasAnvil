/** The endpoint shape an image request takes. */
export type ImageProtocol = "openai-images" | "openai-chat-image";

export interface ImageRoute {
  protocol: ImageProtocol;
}

/** Where image requests go when the config leaves `baseUrl` blank. */
export declare const OPENAI_DEFAULT_BASE_URL: "https://api.openai.com/v1";

/**
 * Picks the endpoint from the model's name. Takes no vendor: every model is
 * reached over an OpenAI-compatible endpoint.
 */
export declare function resolveImageRoute(
  /** The config object as read from disk; any leftover keys are ignored. */
  channel?: { model?: unknown; [key: string]: unknown } | null,
): ImageRoute;
