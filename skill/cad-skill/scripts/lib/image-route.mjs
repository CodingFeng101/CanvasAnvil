/**
 * Which endpoint an image model is reached through.
 *
 * Every model goes through an OpenAI-compatible endpoint, but two shapes
 * exist: `gpt-image-*` and `dall-e-*` are served by the dedicated images
 * endpoint, while every other model returns its image through chat
 * completions. That is a difference in the model's own API, not in who
 * hosts it -- pointing `baseUrl` at a compatible gateway changes neither.
 */

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

const IMAGES_ENDPOINT_MODELS = [/gpt-image/i, /dall-e/i];

export function resolveImageRoute(channel) {
  const model = String(channel?.model || "");
  return {
    protocol: IMAGES_ENDPOINT_MODELS.some((pattern) => pattern.test(model))
      ? "openai-images"
      : "openai-chat-image",
  };
}
