import OpenAI from 'openai';
import { getUiLanguage } from "@/lib/ui-language";
import { t } from "@/lib/i18n";

// Configuration Interfaces
export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
  fileParserApiToken?: string;
  systemPrompt?: string;
}

// Default Configuration
const DEFAULT_CONFIG: AIConfig = {
  apiKey: "",
  baseUrl: "",
  chatModel: "gpt-3.5-turbo",
  imageModel: "gemini-2.5-flash-image-preview",
  fileParserApiToken: "",
  systemPrompt: ""
};

const STORAGE_KEY = "unified_ai_workspace_config";
const MODEL_CONCURRENCY = 30;

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
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// OpenAI Client Factory
function getClient() {
  const config = getAIConfig();
  const baseURL = String(config.baseUrl || "").trim();
  const clientOptions: {
    apiKey: string;
    baseURL?: string;
    dangerouslyAllowBrowser: true;
  } = {
    apiKey: config.apiKey || "dummy", // Prevent crash if empty, but calls will fail
    dangerouslyAllowBrowser: true
  };
  if (baseURL) {
    clientOptions.baseURL = baseURL;
  }
  return new OpenAI(clientOptions);
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
  return await limitModelCall(async () => {
    const config = getAIConfig();
    const client = getClient();
    
    if (!config.apiKey) {
      throw new Error(t(getUiLanguage(), "error.missingApiKey"));
    }
  
    try {
      const stream = await client.chat.completions.create(
        {
          model: model || config.chatModel,
          messages: applyUiLanguagePolicy(messages),
          stream: true,
        },
        signal ? ({ signal } as any) : undefined
      );
  
      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(fullContent);
        }
      }
      return fullContent;
    } catch (error) {
      if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
        throw error;
      }
      console.error("Chat Stream Error:", error);
      throw error;
    }
  }, signal);
}

// Simple non-stream wrapper
export type GenerateChatMessageOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

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
      const client = getClient();

      if (!config.apiKey) {
        throw new Error(t(getUiLanguage(), "error.missingApiKey"));
      }

      try {
        const resp = await client.chat.completions.create(
          {
            model: model || config.chatModel,
            messages: applyUiLanguagePolicy(messages),
            stream: false,
          },
          mergedSignal ? ({ signal: mergedSignal } as any) : undefined
        );
        return resp.choices?.[0]?.message?.content || "";
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

// Legacy non-stream function (kept for compatibility if needed)
export async function sendChatMessage(messages: ChatMessage[]) {
  return streamChatMessage(messages, () => {});
}

// Image Generation Client
export interface ImageGenerationRequest {
  prompt: string;
  referenceImageUrl?: string; // Main reference (kept for backward compatibility)
  additionalReferenceImageUrls?: string[]; // Additional references
}

// Helper to validate and clean URL
function cleanUrl(url: string) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // If it looks like a path but not absolute URL, return as is (might be base64 or relative)
    if (url.startsWith('data:image')) return url;
    return null;
}

function dataUrlToObjectUrl(dataUrl: string) {
    if (typeof window === "undefined") return null;
    if (!dataUrl.startsWith("data:image")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const header = dataUrl.slice(0, comma);
    const data = dataUrl.slice(comma + 1);
    const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);
    const mime = mimeMatch?.[1] || "image/png";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
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
    
    if (!config.apiKey) {
      throw new Error(t(getUiLanguage(), "error.missingApiKey"));
    }
  
    let referenceImageUrl = request.referenceImageUrl;
    if (referenceImageUrl && referenceImageUrl.startsWith("blob:")) {
      const dataUrl = await objectUrlToDataUrl(referenceImageUrl);
      if (dataUrl) referenceImageUrl = dataUrl;
      else referenceImageUrl = undefined;
    }

    const additionalUrls: string[] = [];
    if (request.additionalReferenceImageUrls && request.additionalReferenceImageUrls.length > 0) {
        for (const url of request.additionalReferenceImageUrls) {
            if (url.startsWith("blob:")) {
                const dataUrl = await objectUrlToDataUrl(url);
                if (dataUrl) additionalUrls.push(dataUrl);
            } else {
                additionalUrls.push(url);
            }
        }
    }

    const myHeaders = new Headers();
    myHeaders.append("Authorization", `Bearer ${config.apiKey}`);
    myHeaders.append("Content-Type", "application/json");
  
    const content: any[] = [
      {
        "type": "text",
        "text": request.prompt
      }
    ];
  
    if (referenceImageUrl) {
      content.push({
        "type": "image_url",
        "image_url": {
          "url": referenceImageUrl
        }
      });
    }

    for (const url of additionalUrls) {
        content.push({
            "type": "image_url",
            "image_url": {
                "url": url
            }
        });
    }
  
    const raw = JSON.stringify({
      "model": config.imageModel,
      "messages": [
        {
          "role": "user",
          "content": referenceImageUrl || additionalUrls.length > 0 ? content : request.prompt
        }
      ],
      "stream": false
    });
  
    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow' as RequestRedirect,
      ...(signal ? { signal } : {})
    };
  
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, requestOptions);
      
      if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
      }
  
      const result = await response.json();
      const url = parseAIResponse(result);
      if (url && url.startsWith("data:image")) {
        try {
          const objectUrl = dataUrlToObjectUrl(url);
          if (objectUrl) return objectUrl;
        } catch {
        }
      }
      return url;
    } catch (error) {
      console.error("Image Gen Error:", error);
      throw error;
    }
  }, signal);
}
