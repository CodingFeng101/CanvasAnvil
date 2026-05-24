import assert from "node:assert/strict";
import {
  IMAGE_PROVIDER_OPTIONS,
  TEXT_PROVIDER_OPTIONS,
  getDefaultBaseUrl,
  normalizeAIConfig,
  resolveImageCapabilities,
  resolveTextRoute,
} from "../src/lib/ai/provider-registry";

const imageProviderIds = IMAGE_PROVIDER_OPTIONS.map((option) => option.id);

assert.deepEqual(imageProviderIds, [
  "openai",
  "aliyun",
  "tencent",
  "bytedance",
  "google",
]);

assert.equal(normalizeAIConfig({ imageProvider: "zhipu" }).imageProvider, "openai");
assert.equal(normalizeAIConfig({ imageProvider: "bfl" }).imageProvider, "openai");

assert.ok(TEXT_PROVIDER_OPTIONS.length > 0, "text providers should remain available");

assert.equal(resolveTextRoute({
  provider: "google",
  apiKey: "test",
  baseUrl: getDefaultBaseUrl("google", "text"),
  model: "gemini-2.5-flash",
}).protocol, "google-gemini");

assert.equal(resolveTextRoute({
  provider: "anthropic",
  apiKey: "test",
  baseUrl: getDefaultBaseUrl("anthropic", "text"),
  model: "claude-sonnet-4-5",
}).protocol, "anthropic-messages");

for (const provider of imageProviderIds) {
  const capabilities = resolveImageCapabilities({
    provider,
    apiKey: "test",
    baseUrl: "https://example.com",
    model:
      provider === "openai"
        ? "gpt-image-1"
        : provider === "aliyun"
          ? "wan2.7-image"
          : provider === "tencent"
            ? "hunyuan-image"
            : provider === "bytedance"
              ? "doubao-seedream-4.0"
              : "imagen-4.0-generate-001",
  });

  assert.equal(capabilities.supportsGeneration, true, `${provider} should support generation`);
  assert.equal(capabilities.supportsEdits, true, `${provider} should expose an edit branch`);
}

console.log("ai-provider-registry tests passed");
