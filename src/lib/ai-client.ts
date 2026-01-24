import OpenAI from 'openai';

// Configuration Interfaces
export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
  systemPrompt?: string;
}

// Default Configuration
const DEFAULT_CONFIG: AIConfig = {
  apiKey: "",
  baseUrl: "https://api.rcouyi.com/v1",
  chatModel: "gpt-3.5-turbo",
  imageModel: "gemini-2.5-flash-image-preview",
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

      item
        .run()
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
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
    return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
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
  return new OpenAI({
    apiKey: config.apiKey || "dummy", // Prevent crash if empty, but calls will fail
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true
  });
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
      throw new Error("请先在设置中配置 API Key");
    }
  
    try {
      const stream = await client.chat.completions.create(
        {
          model: model || config.chatModel,
          messages: messages,
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
      console.log("=== AI Chat Response ===");
      console.log(fullContent);
      console.log("========================");
      return fullContent;
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        throw error;
      }
      console.error("Chat Stream Error:", error);
      throw error;
    }
  }, signal);
}

// Simple non-stream wrapper
export async function generateChatMessage(messages: ChatMessage[], model?: string) {
  return streamChatMessage(messages, () => {}, model);
}

// Legacy non-stream function (kept for compatibility if needed)
export async function sendChatMessage(messages: ChatMessage[]) {
  return streamChatMessage(messages, () => {});
}

// Image Generation Client
export interface ImageGenerationRequest {
  prompt: string;
  referenceImageUrl?: string; // For image-to-image
}

// Helper to validate and clean URL
function cleanUrl(url: string) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // If it looks like a path but not absolute URL, return as is (might be base64 or relative)
    if (url.startsWith('data:image')) return url;
    return null;
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
    console.log("=== AI Image Response (Parsed) ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("==================================");

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
      throw new Error("请先在设置中配置 API Key");
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
  
    if (request.referenceImageUrl) {
      content.push({
        "type": "image_url",
        "image_url": {
          "url": request.referenceImageUrl
        }
      });
    }
  
    const raw = JSON.stringify({
      "model": config.imageModel,
      "messages": [
        {
          "role": "user",
          "content": request.referenceImageUrl ? content : request.prompt
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
      return parseAIResponse(result);
    } catch (error) {
      console.error("Image Gen Error:", error);
      throw error;
    }
  }, signal);
}
