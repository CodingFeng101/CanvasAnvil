import { getUiLanguage, t } from "@/shared/i18n";
import { getImageChannel, getTextChannel } from "@contracts/ai";
import { getAIConfig } from "@/ai/storage";
import { applyUiLanguagePolicy } from "@/ai/language-policy";
import { createLimiter } from "@/ai/limiter";
import {
  MAX_GENERATION_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGES,
  cleanUrl,
  normalizeImageUrlForModel,
  normalizeImageUrlsForModel,
} from "@/ai/images";
import type { AIConfig, ChatContentPart, ChatMessage, ImageQuality, ImageSize, MultimodalMessage } from "@contracts/ai";

export type { AIConfig, ChatMessage, ImageQuality, ImageSize } from "@contracts/ai";
export { getAIConfig, saveAIConfig } from "@/ai/storage";

/**
 * Browser-side facade over the model.
 *
 * Requests are proxied through `/api/ppt-ai` rather than sent straight to the
 * provider: it keeps the key out of cross-origin requests and lets the server
 * inline remote images the browser could not fetch.
 */

const MODEL_CONCURRENCY = 30;
const limitModelCall = createLimiter(MODEL_CONCURRENCY);

export interface ImageGenerationRequest {
  prompt: string;
  referenceImageUrl?: string;
  additionalReferenceImageUrls?: string[];
  maskImageUrl?: string;
  size?: ImageSize;
  quality?: ImageQuality;
}

export type GenerateChatMessageOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type ProxyRequest =
  | { kind: "chat"; aiConfig: AIConfig; messages: MultimodalMessage[]; model?: string }
  | ({ kind: "image"; aiConfig: AIConfig; model?: string } & ImageGenerationRequest);

async function callProxy<T>(body: ProxyRequest, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/ppt-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text().catch(() => "");
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = String(parsed?.error || text || "").trim();
    throw new Error(detail || `Proxy request failed with status ${response.status}`);
  }
  return parsed as T;
}

function requireTextChannel() {
  const config = getAIConfig();
  const channel = getTextChannel(config);
  if (!channel.apiKey) throw new Error(t(getUiLanguage(), "error.missingApiKey"));
  return { config, channel };
}

function isAbort(error: unknown) {
  const name = (error as any)?.name;
  return name === "AbortError" || name === "APIUserAbortError";
}

/**
 * Run `task` under the concurrency limit, with an optional timeout folded into
 * the caller's own AbortSignal.
 */
async function withCancellation<T>(options: GenerateChatMessageOptions | undefined, task: (signal?: AbortSignal) => Promise<T>) {
  const timeoutMs = typeof options?.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 0;
  const external = options?.signal;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller?.signal || external;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (controller && external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }
  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    return await limitModelCall(() => task(signal), signal);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function generateChatMessage(
  messages: ChatMessage[],
  model?: string,
  options?: GenerateChatMessageOptions,
) {
  return await withCancellation(options, async (signal) => {
    const { config, channel } = requireTextChannel();
    try {
      const data = await callProxy<{ content?: string }>(
        { kind: "chat", aiConfig: config, messages: applyUiLanguagePolicy(messages), model: model || channel.model },
        signal,
      );
      return String(data?.content || "");
    } catch (error) {
      if (isAbort(error)) throw error;
      console.error("Chat Error:", error);
      throw error;
    }
  });
}

/**
 * Same transport as {@link generateChatMessage}, but without the UI-language
 * policy message: callers here own their whole prompt (PPT outline and slide
 * agents write their own language rules).
 */
export async function generatePptProxyChatMessage(
  messages: ChatMessage[],
  model?: string,
  options?: GenerateChatMessageOptions,
) {
  const { config, channel } = requireTextChannel();
  const data = await callProxy<{ content?: string }>(
    { kind: "chat", aiConfig: config, messages, model: model || channel.model },
    options?.signal,
  );
  return String(data?.content || "");
}

export async function generateVisionChatMessage(
  systemPrompt: string,
  userPrompt: string,
  imageUrls: string[],
  model?: string,
  options?: GenerateChatMessageOptions,
) {
  return await withCancellation(options, async (signal) => {
    const { config, channel } = requireTextChannel();
    const normalized = await normalizeImageUrlsForModel(imageUrls, MAX_REFERENCE_IMAGES);
    const userContent: ChatContentPart[] = [
      { type: "text", text: userPrompt },
      ...normalized.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ];

    try {
      const data = await callProxy<{ content?: string }>(
        {
          kind: "chat",
          aiConfig: config,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          model: model || channel.model,
        },
        signal,
      );
      return String(data?.content || "");
    } catch (error) {
      if (isAbort(error)) throw error;
      console.error("Vision Chat Error:", error);
      throw error;
    }
  });
}

/**
 * Non-streaming despite the name: the proxy returns a completed message, so the
 * callback fires exactly once. Kept as the shape the chat panels are written
 * against.
 */
export async function streamChatMessage(
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  model?: string,
  signal?: AbortSignal,
) {
  const content = await generateChatMessage(messages, model, { signal });
  onChunk(content);
  return content;
}

/**
 * Real streaming through `/api/ppt-ai/stream`. `onText` receives the whole text so far.
 * Returns the text and why the model stopped: "length" means it ran out of output tokens.
 */
export async function streamChatText(
  messages: ChatMessage[],
  onText: (text: string) => void,
  model?: string,
  options?: GenerateChatMessageOptions,
): Promise<{ text: string; finish: string; error?: string }> {
  return await withCancellation(options, async (signal) => {
    const { config, channel } = requireTextChannel();
    const response = await fetch("/api/ppt-ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "chat", aiConfig: config, messages: applyUiLanguagePolicy(messages), model: model || channel.model }),
      signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      let message = detail;
      try { message = JSON.parse(detail)?.error || detail; } catch { /* plain text */ }
      throw new Error(message || `Stream request failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let finish = "";
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); }
      catch (error) {
        if (isAbort(error) || signal?.aborted) throw error;
        return { text, finish: "interrupted", error: error instanceof Error ? error.message : String(error) };
      }
      const { value, done } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { delta?: string; finish?: string; error?: string };
        // The upstream connection dropped mid-answer ("terminated", reset sockets): hand back what
        // arrived so the caller can resume instead of losing it.
        if (event.error) return { text, finish: "interrupted", error: event.error };
        if (event.delta) { text += event.delta; onText(text); }
        if (event.finish) finish = event.finish;
      }
    }
    return { text, finish: finish || "stop" };
  });
}

export async function generateImage(request: ImageGenerationRequest, signal?: AbortSignal) {
  return await limitModelCall(async () => {
    const config = getAIConfig();
    const channel = getImageChannel(config);
    if (!channel.apiKey) throw new Error(t(getUiLanguage(), "error.missingApiKey"));

    const referenceImageUrl = request.referenceImageUrl
      ? await normalizeImageUrlForModel(request.referenceImageUrl)
      : null;
    const maskImageUrl = request.maskImageUrl
      ? await normalizeImageUrlForModel(request.maskImageUrl)
      : null;
    const additionalReferenceImageUrls = await normalizeImageUrlsForModel(
      Array.isArray(request.additionalReferenceImageUrls) ? request.additionalReferenceImageUrls : [],
      Math.max(0, MAX_GENERATION_REFERENCE_IMAGES - (referenceImageUrl ? 1 : 0)),
    );

    try {
      const result = await callProxy<{ url?: string }>(
        {
          kind: "image",
          aiConfig: config,
          prompt: request.prompt,
          referenceImageUrl: referenceImageUrl || undefined,
          additionalReferenceImageUrls,
          maskImageUrl: maskImageUrl || undefined,
          size: request.size,
          quality: request.quality,
          model: channel.model,
        },
        signal,
      );
      return cleanUrl(String(result?.url || ""));
    } catch (error) {
      console.error("Image Gen Error:", error);
      throw error;
    }
  }, signal);
}
