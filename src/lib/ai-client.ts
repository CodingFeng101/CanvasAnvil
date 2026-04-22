import { getUiLanguage } from "@/lib/ui-language";
import { t } from "@/lib/i18n";
import {
  type AIConfig,
  getImageChannelConfig,
  getTextChannelConfig,
  normalizeAIConfig,
} from "@/lib/ai/provider-registry";
export type { AIConfig } from "@/lib/ai/provider-registry";

// Default Configuration
const DEFAULT_CONFIG: AIConfig = {
  textProvider: "openai",
  textApiKey: "",
  textBaseUrl: "https://api.openai.com/v1",
  textModel: "gpt-4o-mini",
  textCustomMapping: "",
  imageProvider: "openai",
  imageApiKey: "",
  imageBaseUrl: "https://api.openai.com/v1",
  imageModel: "gpt-image-1",
  imageCustomMapping: "",
  fileParserApiToken: "",
  systemPrompt: "",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  chatModel: "gpt-4o-mini",
  imageModelLegacy: "gpt-image-1",
};

const STORAGE_KEY = "unified_ai_workspace_config";
const MODEL_CONCURRENCY = 30;
const IMAGE_MODEL_MAX_REFERENCE_IMAGES = 3;
const IMAGE_MODEL_MAX_DIMENSION = 1536;
const IMAGE_MODEL_MAX_DATA_URL_LENGTH = 1_800_000;
const IMAGE_MODEL_JPEG_QUALITY = 0.86;

type QueueItem<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function createLimiter(max: number) {
  let active = 0;
  const queue: QueueItem<any>[] = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      const item = queue.shift()!;
      if (item.signal?.aborted) {
        item.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        continue;
      }

      active += 1;
      if (item.signal && item.onAbort) {
        item.signal.removeEventListener("abort", item.onAbort);
        item.onAbort = undefined;
      }
      let finished = false;
      let abortHandler: (() => void) | null = null;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (item.signal && abortHandler) {
          item.signal.removeEventListener("abort", abortHandler as any);
        }
        active -= 1;
        pump();
      };

      if (item.signal) {
        abortHandler = () => {
          const err = Object.assign(new Error("Aborted"), { name: "AbortError" });
          item.reject(err);
          finish();
        };
        item.signal.addEventListener("abort", abortHandler, { once: true });
      }

      item.run().then(
        (value) => {
          item.resolve(value);
          finish();
        },
        (reason) => {
          item.reject(reason);
          finish();
        }
      );
    }
  };

  return function limit<T>(run: () => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { run, resolve, reject, signal };
      if (signal) {
        const onAbort = () => {
          const idx = queue.indexOf(item as any);
          if (idx >= 0) queue.splice(idx, 1);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        };
        item.onAbort = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }

      queue.push(item);
      pump();
    });
  };
}

const limitModelCall = createLimiter(MODEL_CONCURRENCY);

// Helper to get config
export function getAIConfig(): AIConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return normalizeAIConfig({ ...DEFAULT_CONFIG, ...JSON.parse(stored) });
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
      }
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

// Helper to save config
export function saveAIConfig(config: AIConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAIConfig(config)));
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const UI_LANG_POLICY_PREFIX = "UI_LANG_POLICY:";

function getUiLanguagePolicySystemMessage(): ChatMessage {
  const uiLang = getUiLanguage();
  if (uiLang === "en") {
    return {
      role: "system",
      content:
        `${UI_LANG_POLICY_PREFIX} uiLang=en\n` +
        "All assistant outputs must be in English.\n" +
        "- Do not output Chinese characters.\n" +
        "- If an agent must output code/JSON/XML only, keep the required format and keep any fixed identifiers/schema keys; write any human-readable strings in English unless the schema mandates otherwise.",
    };
  }
  return {
    role: "system",
    content:
      `${UI_LANG_POLICY_PREFIX} uiLang=zh\n` +
      "All assistant outputs must be in Simplified Chinese.\n" +
      "- Do not output English unless required for code, identifiers, proper nouns, or file paths.\n" +
      "- If an agent must output code/JSON/XML only, keep the required format and keep any fixed identifiers/schema keys; write any human-readable strings in Chinese unless the schema mandates otherwise.",
  };
}

function applyUiLanguagePolicy(messages: ChatMessage[]): ChatMessage[] {
  const filtered = (messages || []).filter(
    (m) => !(m.role === "system" && String(m.content || "").startsWith(UI_LANG_POLICY_PREFIX))
  );
  return [getUiLanguagePolicySystemMessage(), ...filtered];
}

// Stream Chat Message
export async function streamChatMessage(
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  model?: string,
  signal?: AbortSignal
) {
  const content = await generateChatMessage(messages, model, { signal });
  onChunk(content);
  return content;
}

// Simple non-stream wrapper
export type GenerateChatMessageOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function normalizeVisionImageUrls(imageUrls: string[]) {
  return await normalizeImageUrlsForModel(imageUrls, IMAGE_MODEL_MAX_REFERENCE_IMAGES);
}

export async function generateChatMessage(messages: ChatMessage[], model?: string, options?: GenerateChatMessageOptions) {
  const timeoutMs = typeof options?.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 0;
  const externalSignal = options?.signal;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const mergedSignal = controller?.signal || externalSignal;
  let timeoutId: any = null;

  if (controller && externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    return await limitModelCall(async () => {
      const config = getAIConfig();
      const textChannel = getTextChannelConfig(config);
      if (!textChannel.apiKey) {
        throw new Error(t(getUiLanguage(), "error.missingApiKey"));
      }

      try {
        const data = await callPptProxy<{ content?: string }>(
          {
            kind: "chat",
            aiConfig: config,
            messages: applyUiLanguagePolicy(messages),
            model: model || textChannel.model,
          },
          mergedSignal || undefined
        );
        return String(data?.content || "");
      } catch (error) {
        if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
          throw error;
        }
        console.error("Chat Error:", error);
        throw error;
      }
    }, mergedSignal);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function generatePptProxyChatMessage(
  messages: ChatMessage[],
  model?: string,
  options?: GenerateChatMessageOptions
) {
  const config = getAIConfig();
  const textChannel = getTextChannelConfig(config);
  if (!textChannel.apiKey) {
    throw new Error(t(getUiLanguage(), "error.missingApiKey"));
  }

  const data = await callPptProxy<{ content?: string }>(
    {
      kind: "chat",
      aiConfig: config,
      messages,
      model: model || textChannel.model,
    },
    options?.signal
  );

  return String(data?.content || "");
}

export async function generateVisionChatMessage(
  systemPrompt: string,
  userPrompt: string,
  imageUrls: string[],
  model?: string,
  options?: GenerateChatMessageOptions
) {
  const timeoutMs = typeof options?.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 0;
  const externalSignal = options?.signal;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const mergedSignal = controller?.signal || externalSignal;
  let timeoutId: any = null;

  if (controller && externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    return await limitModelCall(async () => {
      const config = getAIConfig();
      const textChannel = getTextChannelConfig(config);

      if (!textChannel.apiKey) {
        throw new Error(t(getUiLanguage(), "error.missingApiKey"));
      }
      const normalizedImageUrls = await normalizeVisionImageUrls(imageUrls);
      const userContent: any[] = [{ type: "text", text: userPrompt }];
      for (const url of normalizedImageUrls) {
        userContent.push({
          type: "image_url",
          image_url: { url },
        });
      }

      try {
        const data = await callPptProxy<{ content?: string }>(
          {
            kind: "chat",
            aiConfig: config,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent as any },
            ] as any,
            model: model || textChannel.model,
          },
          mergedSignal || undefined
        );
        return String(data?.content || "");
      } catch (error) {
        if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
          throw error;
        }
        console.error("Vision Chat Error:", error);
        throw error;
      }
    }, mergedSignal);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Legacy non-stream function (kept for compatibility if needed)
export async function sendChatMessage(messages: ChatMessage[]) {
  return streamChatMessage(messages, () => {});
}

// Image Generation Client
export interface ImageGenerationRequest {
  prompt: string;
  referenceImageUrl?: string; // Main reference (kept for backward compatibility)
  additionalReferenceImageUrls?: string[]; // Additional references
  maskImageUrl?: string;
}

type PptProxyChatRequest = {
  kind: "chat";
  aiConfig: AIConfig;
  messages: ChatMessage[];
  model?: string;
};

type PptProxyImageRequest = {
  kind: "image";
  aiConfig: AIConfig;
  prompt: string;
  referenceImageUrl?: string;
  additionalReferenceImageUrls?: string[];
  maskImageUrl?: string;
  model?: string;
};

async function callPptProxy<T>(body: PptProxyChatRequest | PptProxyImageRequest, signal?: AbortSignal): Promise<T> {
    const response = await fetch("/api/ppt-ai", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
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

// Helper to validate and clean URL
function cleanUrl(url: string) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // If it looks like a path but not absolute URL, return as is (might be base64 or relative)
    if (url.startsWith('data:image')) return url;
    return null;
}

async function objectUrlToDataUrl(objectUrl: string) {
    if (typeof window === "undefined") return null;
    if (!objectUrl || !objectUrl.startsWith("blob:")) return null;
    try {
        const resp = await fetch(objectUrl);
        const blob = await resp.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onerror = () => resolve(null);
            reader.onloadend = () => {
                const result = reader.result;
                resolve(typeof result === "string" ? result : null);
            };
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

function getImageMimeFromDataUrl(dataUrl: string) {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    return match?.[1]?.toLowerCase() || "image/png";
}

async function compressDataImageUrlForModel(dataUrl: string) {
    if (typeof window === "undefined" || typeof document === "undefined") return dataUrl;
    if (!String(dataUrl || "").startsWith("data:image")) return dataUrl;

    return await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const width = Number(img.naturalWidth || img.width || 0);
                const height = Number(img.naturalHeight || img.height || 0);
                if (!width || !height) {
                    resolve(dataUrl);
                    return;
                }

                const longestSide = Math.max(width, height);
                const needsResize = longestSide > IMAGE_MODEL_MAX_DIMENSION;
                const needsReencode = dataUrl.length > IMAGE_MODEL_MAX_DATA_URL_LENGTH;

                if (!needsResize && !needsReencode) {
                    resolve(dataUrl);
                    return;
                }

                const scale = needsResize ? IMAGE_MODEL_MAX_DIMENSION / longestSide : 1;
                const targetWidth = Math.max(1, Math.round(width * scale));
                const targetHeight = Math.max(1, Math.round(height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(dataUrl);
                    return;
                }

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const originalMime = getImageMimeFromDataUrl(dataUrl);
                const targetMime =
                    originalMime === "image/jpeg" || originalMime === "image/jpg" || needsReencode
                        ? "image/jpeg"
                        : originalMime;
                const compressed =
                    targetMime === "image/jpeg"
                        ? canvas.toDataURL(targetMime, IMAGE_MODEL_JPEG_QUALITY)
                        : canvas.toDataURL(targetMime);

                resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
            } catch {
                resolve(dataUrl);
            }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

async function normalizeImageUrlForModel(url: string) {
    const raw = String(url || "").trim();
    if (!raw) return null;

    if (raw.startsWith("blob:")) {
        const dataUrl = await objectUrlToDataUrl(raw);
        if (!dataUrl) return null;
        return await compressDataImageUrlForModel(dataUrl);
    }

    if (raw.startsWith("data:image")) {
        return await compressDataImageUrlForModel(raw);
    }

    return cleanUrl(raw);
}

async function normalizeImageUrlsForModel(imageUrls: string[], maxImages: number) {
    const normalized: string[] = [];
    for (const raw of imageUrls) {
        if (normalized.length >= maxImages) break;
        const url = await normalizeImageUrlForModel(raw);
        if (!url || normalized.includes(url)) continue;
        normalized.push(url);
    }
    return normalized;
}

function extractImageUrlFromContent(messageContent: any) {
    if (Array.isArray(messageContent)) {
        const imagePart = messageContent.find((part: any) => part.type === 'image_url');
        if (imagePart) {
            return cleanUrl(imagePart.image_url.url);
        }
        const textPart = messageContent.find((part: any) => part.type === 'text');
        if (textPart) {
            const text = textPart.text;
            const markdownMatch = text.match(/!\[.*?\]\((.*?)\)/);
            if (markdownMatch && markdownMatch[1]) {
                return cleanUrl(markdownMatch[1]);
            }
            if (text.trim().startsWith('http') || text.trim().startsWith('data:image')) {
                return cleanUrl(text.trim());
            }
        }
        return null;
    }

    if (typeof messageContent === 'string') {
        const markdownMatch = messageContent.match(/!\[.*?\]\((.*?)\)/);
        if (markdownMatch && markdownMatch[1]) {
            return cleanUrl(markdownMatch[1]);
        }
        if (messageContent.trim().startsWith('http')) {
            return cleanUrl(messageContent.trim());
        }
        return null;
    }

    return null;
}

function parseAIResponse(result: any) {
    if (result.error) {
        throw new Error(result.error.message || "API Error");
    }

    if (result.choices && result.choices.length > 0) {
        const messageContent = result.choices[0].message.content;
        return extractImageUrlFromContent(messageContent);
    }
    return null;
}

export async function generateImage(request: ImageGenerationRequest, signal?: AbortSignal) {
  return await limitModelCall(async () => {
    const config = getAIConfig();
    const imageChannel = getImageChannelConfig(config);
    if (!imageChannel.apiKey) {
      throw new Error(t(getUiLanguage(), "error.missingApiKey"));
    }
  
      const normalizedReferenceImageUrl = request.referenceImageUrl
        ? await normalizeImageUrlForModel(request.referenceImageUrl)
        : null;
      const normalizedMaskImageUrl = request.maskImageUrl
        ? await normalizeImageUrlForModel(request.maskImageUrl)
        : null;
      const additionalUrls = await normalizeImageUrlsForModel(
        Array.isArray(request.additionalReferenceImageUrls) ? request.additionalReferenceImageUrls : [],
        Math.max(0, IMAGE_MODEL_MAX_REFERENCE_IMAGES - (normalizedReferenceImageUrl ? 1 : 0))
      );

    try {
      const result = await callPptProxy<{ url?: string }>(
        {
          kind: "image",
          aiConfig: config,
            prompt: request.prompt,
            referenceImageUrl: normalizedReferenceImageUrl || undefined,
            additionalReferenceImageUrls: additionalUrls,
            maskImageUrl: normalizedMaskImageUrl || undefined,
            model: imageChannel.model,
          },
          signal
      );
      const url = cleanUrl(String(result?.url || ""));
      return url;
    } catch (error) {
      console.error("Image Gen Error:", error);
      throw error;
    }
  }, signal);
}
