import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateImage } from "../server/ai/image";
import { generateText } from "../server/ai/text";
import type { AIChannel } from "../contracts/ai";

/**
 * These lock in the wire format: every model call must be one of the three
 * OpenAI routes, authenticated with a bearer token, against the configured
 * base URL. They are the guard against per-vendor branching creeping back in.
 */

type Captured = { url: string; init: RequestInit; body: any };

const channel: AIChannel = {
  apiKey: "test-key",
  baseUrl: "https://example.test/v1",
  model: "test-model",
};

const PNG_DATA_URL = "data:image/png;base64,aGVsbG8=";

let captured: Captured[] = [];
let respond: (url: string) => any;
const originalFetch = globalThis.fetch;

function jsonResponse(payload: any, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

beforeEach(() => {
  captured = [];
  respond = () => ({ data: [{ b64_json: "aGVsbG8=" }] });
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    const bodyText = typeof init?.body === "string" ? init.body : "";
    captured.push({ url: String(url), init: init || {}, body: bodyText ? JSON.parse(bodyText) : null });
    return jsonResponse(respond(String(url)));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const last = () => {
  const request = captured[captured.length - 1];
  assert.ok(request, "expected a captured request");
  return request;
};

const authHeader = (request: Captured) => (request.init.headers as Record<string, string>).Authorization;

test("text goes to /chat/completions with a bearer token", async () => {
  respond = () => ({ choices: [{ message: { content: "hi" } }] });

  const result = await generateText({ channel, messages: [{ role: "user", content: "hello" }] });

  assert.equal(result, "hi");
  assert.equal(last().url, "https://example.test/v1/chat/completions");
  assert.equal(authHeader(last()), "Bearer test-key");
  assert.equal(last().body.model, "test-model");
  assert.equal(last().body.stream, false);
});

test("text flattens a multimodal reply to its text parts", async () => {
  respond = () => ({
    choices: [{ message: { content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] } }],
  });

  assert.equal(await generateText({ channel, messages: [{ role: "user", content: "hello" }] }), "one\ntwo");
});

test("a prompt with no reference image goes to /images/generations", async () => {
  const result = await generateImage({ channel, prompt: "draw a square" });

  assert.equal(result, "data:image/png;base64,aGVsbG8=");
  assert.equal(last().url, "https://example.test/v1/images/generations");
  assert.equal(authHeader(last()), "Bearer test-key");
});

test("a reference image switches to /images/edits as multipart", async () => {
  await generateImage({ channel, prompt: "make it blue", referenceImageUrl: PNG_DATA_URL });

  assert.equal(last().url, "https://example.test/v1/images/edits");
  assert.ok(last().init.body instanceof FormData, "edits must be sent as multipart");
  assert.equal(authHeader(last()), "Bearer test-key");
});

test("falls back to /chat/completions when the images route fails", async () => {
  respond = (url) => {
    if (url.includes("/images/")) throw new Error("no images route here");
    return { choices: [{ message: { content: [{ type: "image_url", image_url: { url: PNG_DATA_URL } }] } }] };
  };

  const result = await generateImage({ channel, prompt: "draw a square" });

  assert.equal(result, PNG_DATA_URL);
  assert.deepEqual(
    captured.map((request) => new URL(request.url).pathname),
    ["/v1/images/generations", "/v1/chat/completions"],
  );
});

test("the chat fallback also reads a markdown image link", async () => {
  respond = (url) => {
    if (url.includes("/images/")) throw new Error("no images route here");
    return { choices: [{ message: { content: `here you go ![out](${PNG_DATA_URL})` } }] };
  };

  assert.equal(await generateImage({ channel, prompt: "draw a square" }), PNG_DATA_URL);
});

test("reference images ride along on the chat fallback", async () => {
  respond = (url) => {
    if (url.includes("/images/")) throw new Error("no images route here");
    return { choices: [{ message: { content: [{ type: "image_url", image_url: { url: PNG_DATA_URL } }] } }] };
  };

  await generateImage({
    channel,
    prompt: "combine these",
    referenceImageUrl: PNG_DATA_URL,
    additionalReferenceImageUrls: [PNG_DATA_URL],
  });

  const parts = last().body.messages[0].content;
  assert.equal(parts.filter((part: any) => part.type === "image_url").length, 2);
});

test("reports the first route's error when every route fails", async () => {
  respond = (url) => {
    throw new Error(url.includes("/images/") ? "images route said no" : "chat route said no");
  };

  await assert.rejects(generateImage({ channel, prompt: "draw a square" }), /images route said no/);
});

test("a trailing slash on the base URL does not double up", async () => {
  respond = () => ({ choices: [{ message: { content: "hi" } }] });

  await generateText({
    channel: { ...channel, baseUrl: "https://example.test/v1/" },
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(last().url, "https://example.test/v1/chat/completions");
});

test("surfaces the provider's error message verbatim", async () => {
  globalThis.fetch = (async () =>
    jsonResponse({ error: { message: "model not found" } }, false)) as typeof fetch;

  await assert.rejects(
    generateText({ channel, messages: [{ role: "user", content: "hello" }] }),
    /model not found/,
  );
});
