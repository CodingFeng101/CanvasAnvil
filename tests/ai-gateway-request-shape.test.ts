import assert from "node:assert/strict";
import { generateImageThroughGateway, generateTextThroughGateway } from "../src/lib/ai/gateway";

type CapturedRequest = {
  url: string;
  init: RequestInit;
  body: any;
};

const captured: CapturedRequest[] = [];
const originalFetch = globalThis.fetch;

function mockJsonResponse(payload: any, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

globalThis.fetch = (async (url: any, init?: RequestInit) => {
  const bodyText = typeof init?.body === "string" ? init.body : "";
  const body = bodyText ? JSON.parse(bodyText) : null;
  captured.push({ url: String(url), init: init || {}, body });

  if (String(url).includes(":generateContent")) {
    return mockJsonResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  }
  if (String(url).endsWith("/messages")) {
    return mockJsonResponse({ content: [{ type: "text", text: "ok" }] });
  }
  if (String(url).includes(":predict")) {
    return mockJsonResponse({ predictions: [{ bytesBase64Encoded: "aGVsbG8=" }] });
  }
  if (String(url).includes("/services/aigc/multimodal-generation/generation")) {
    return mockJsonResponse({
      output: {
        choices: [
          {
            message: {
              content: [{ image: "data:image/png;base64,aGVsbG8=" }],
            },
          },
        ],
      },
    });
  }
  return mockJsonResponse({ data: [{ b64_json: "aGVsbG8=" }] });
}) as typeof fetch;

function lastRequest() {
  const request = captured[captured.length - 1];
  assert.ok(request, "expected a captured request");
  return request;
}

async function assertImageRequest(provider: string, expectedPath: string, referenceImageUrl?: string) {
  const model =
    provider === "openai"
      ? "gpt-image-1"
      : provider === "aliyun"
        ? "wan2.2-image"
        : provider === "tencent"
          ? "hunyuan-image"
          : provider === "bytedance"
            ? "doubao-seedream-4-0"
            : "imagen-4.0-generate-001";

  captured.length = 0;
  await generateImageThroughGateway({
    channel: {
      provider,
      apiKey: "test-key",
      baseUrl: provider === "google" ? "https://generativelanguage.googleapis.com/v1beta/models" : "https://example.test/v1",
      model,
    },
    prompt: "draw a square",
    referenceImageUrl,
  });

  const request = lastRequest();
  assert.ok(request.url.includes(expectedPath), `${provider} should call ${expectedPath}, got ${request.url}`);
  if (provider === "google") {
    assert.equal((request.init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  } else {
    assert.equal((request.init.headers as Record<string, string>).Authorization, "Bearer test-key");
  }
}

await assertImageRequest("openai", "/images/generations");
await assertImageRequest("openai", "/images/edits", "data:image/png;base64,aGVsbG8=");
await assertImageRequest("aliyun", "/services/aigc/multimodal-generation/generation");
await assertImageRequest("aliyun", "/services/aigc/multimodal-generation/generation", "data:image/png;base64,aGVsbG8=");
await assertImageRequest("tencent", "/images/generations");
await assertImageRequest("tencent", "/images/edits", "data:image/png;base64,aGVsbG8=");
await assertImageRequest("bytedance", "/images/generations");
await assertImageRequest("bytedance", "/images/generations", "data:image/png;base64,aGVsbG8=");
await assertImageRequest("google", ":predict");
await assertImageRequest("google", ":predict", "data:image/png;base64,aGVsbG8=");

captured.length = 0;
await generateTextThroughGateway({
  channel: {
    provider: "google",
    apiKey: "google-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
  },
  messages: [{ role: "user", content: "hello" }],
});
assert.ok(lastRequest().url.endsWith("/models/gemini-2.5-flash:generateContent"));
assert.equal((lastRequest().init.headers as Record<string, string>)["x-goog-api-key"], "google-key");

captured.length = 0;
await generateTextThroughGateway({
  channel: {
    provider: "anthropic",
    apiKey: "anthropic-key",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
  messages: [{ role: "user", content: "hello" }],
});
assert.ok(lastRequest().url.endsWith("/messages"));
assert.equal((lastRequest().init.headers as Record<string, string>)["x-api-key"], "anthropic-key");

globalThis.fetch = originalFetch;

console.log("ai-gateway request-shape tests passed");
