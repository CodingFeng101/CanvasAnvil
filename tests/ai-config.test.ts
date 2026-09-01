import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_BASE_URL,
  getImageChannel,
  getTextChannel,
  normalizeAIConfig,
} from "../contracts/ai";

test("fills both channels from an empty config", () => {
  const config = normalizeAIConfig({});
  assert.equal(config.textBaseUrl, DEFAULT_BASE_URL);
  assert.equal(config.imageBaseUrl, DEFAULT_BASE_URL);
  assert.equal(config.textApiKey, "");
  assert.equal(config.textModel, "");
});

test("tolerates null and non-object input", () => {
  assert.equal(normalizeAIConfig(null).textBaseUrl, DEFAULT_BASE_URL);
  assert.equal(normalizeAIConfig(undefined).imageBaseUrl, DEFAULT_BASE_URL);
  assert.equal(normalizeAIConfig("nonsense" as unknown).textModel, "");
});

test("migrates the legacy shared-credential config", () => {
  // Settings written before the OpenAI-only rewrite stored one shared key and
  // base URL, and named the models chatModel / imageModelLegacy.
  const config = normalizeAIConfig({
    apiKey: "sk-shared",
    baseUrl: "https://legacy.test/v1",
    chatModel: "gpt-4o",
    imageModelLegacy: "dall-e-3",
  });

  assert.equal(config.textApiKey, "sk-shared");
  assert.equal(config.imageApiKey, "sk-shared");
  assert.equal(config.textBaseUrl, "https://legacy.test/v1");
  assert.equal(config.imageBaseUrl, "https://legacy.test/v1");
  assert.equal(config.textModel, "gpt-4o");
  assert.equal(config.imageModel, "dall-e-3");
});

test("per-channel values win over the shared legacy ones", () => {
  const config = normalizeAIConfig({
    apiKey: "sk-shared",
    baseUrl: "https://legacy.test/v1",
    imageApiKey: "sk-image",
    imageBaseUrl: "https://images.test/v1",
  });

  assert.equal(config.textApiKey, "sk-shared");
  assert.equal(config.imageApiKey, "sk-image");
  assert.equal(config.imageBaseUrl, "https://images.test/v1");
});

test("drops the provider field the old config carried", () => {
  const config = normalizeAIConfig({ textProvider: "anthropic", imageProvider: "aliyun" });
  assert.equal("textProvider" in config, false);
  assert.equal("imageProvider" in config, false);
});

test("channels fall back to the default base URL when one is blank", () => {
  const config = normalizeAIConfig({ textBaseUrl: "   ", imageBaseUrl: "" });
  assert.equal(getTextChannel(config).baseUrl, DEFAULT_BASE_URL);
  assert.equal(getImageChannel(config).baseUrl, DEFAULT_BASE_URL);
});

test("channels expose exactly the three fields a request needs", () => {
  const config = normalizeAIConfig({
    textApiKey: "sk-text",
    textBaseUrl: "https://text.test/v1",
    textModel: "gpt-4o-mini",
  });
  assert.deepEqual(getTextChannel(config), {
    apiKey: "sk-text",
    baseUrl: "https://text.test/v1",
    model: "gpt-4o-mini",
  });
});
