import {
  type AIChannelConfig,
  type CustomProviderMappingSpec,
  parseCustomProviderMapping,
  resolveImageCapabilities,
  resolveImageRoute,
  resolveTextRoute,
} from "./provider-registry";

export type GatewayChatMessage = {
  role: "system" | "user" | "assistant";
  content: any;
};

export interface TextGatewayRequest {
  channel: AIChannelConfig;
  messages: GatewayChatMessage[];
}

export interface ImageGatewayRequest {
  channel: AIChannelConfig;
  prompt: string;
  referenceImageUrl?: string;
  additionalReferenceImageUrls?: string[];
  maskImageUrl?: string;
}

type ImageAdapter = {
  supports(request: ImageGatewayRequest): boolean;
  generate(request: ImageGatewayRequest): Promise<string>;
};

function shouldUseEditFlow(req: ImageGatewayRequest, capabilities?: { supportsEdits: boolean }) {
  return Boolean(req.referenceImageUrl && capabilities?.supportsEdits);
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const path = String(endpoint || "").trim();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

function extractByPath(input: any, path: string) {
  const normalized = String(path || "").trim();
  if (!normalized) return input;
  const tokens = normalized
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((token) => token.trim())
    .filter(Boolean);
  let current = input;
  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token];
  }
  return current;
}

function applyTemplate(value: any, context: Record<string, any>): any {
  if (typeof value === "string") {
    if (value.startsWith("$")) {
      return context[value.slice(1)];
    }
    return value.replace(/\$([a-zA-Z0-9_]+)/g, (_, key) => {
      const resolved = context[key];
      return resolved == null ? "" : typeof resolved === "string" ? resolved : JSON.stringify(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, context));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = applyTemplate(item, context);
    }
    return out;
  }
  return value;
}

async function executeCustomSpec(args: {
  spec: CustomProviderMappingSpec;
  channel: AIChannelConfig;
  context: Record<string, any>;
}) {
  const url = joinUrl(args.channel.baseUrl, args.spec.endpoint);
  const method = args.spec.method || "POST";
  const extraHeaders = applyTemplate(args.spec.headers || {}, args.context);
  const bodyValue = applyTemplate(args.spec.body || {}, args.context);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${args.channel.apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(bodyValue) }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new Error(
      typeof parsed === "string"
        ? parsed || `Request failed with status ${response.status}`
        : parsed?.error || parsed?.message || `Request failed with status ${response.status}`,
    );
  }

  return extractByPath(parsed, args.spec.responsePath);
}

function extractTextFromOpenAIContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractImageUrlFromOpenAIContent(content: any): string | null {
  if (Array.isArray(content)) {
    const imagePart = content.find((part) => part?.type === "image_url" && part?.image_url?.url);
    if (imagePart?.image_url?.url) return String(imagePart.image_url.url);
    const textPart = content.find((part) => part?.type === "text" && typeof part?.text === "string");
    if (textPart?.text) {
      const markdownMatch = textPart.text.match(/!\[.*?\]\((.*?)\)/);
      if (markdownMatch?.[1]) return markdownMatch[1];
      if (/^https?:\/\//i.test(textPart.text.trim()) || textPart.text.trim().startsWith("data:image")) {
        return textPart.text.trim();
      }
    }
    return null;
  }

  if (typeof content === "string") {
    const markdownMatch = content.match(/!\[.*?\]\((.*?)\)/);
    if (markdownMatch?.[1]) return markdownMatch[1];
    if (/^https?:\/\//i.test(content.trim()) || content.trim().startsWith("data:image")) {
      return content.trim();
    }
  }

  return null;
}

function extractImageUrlFromAliyunContent(content: any): string | null {
  if (Array.isArray(content)) {
    const imagePart = content.find((part) => part?.image);
    if (imagePart?.image) return String(imagePart.image);
    const textPart = content.find((part) => part?.text && typeof part.text === "string");
    if (textPart?.text) {
      const markdownMatch = textPart.text.match(/!\[.*?\]\((.*?)\)/);
      if (markdownMatch?.[1]) return markdownMatch[1];
      if (/^https?:\/\//i.test(textPart.text.trim()) || textPart.text.trim().startsWith("data:image")) {
        return textPart.text.trim();
      }
    }
  }
  return null;
}

async function convertRemoteImageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:image")) return url;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image with status ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const normalized = dataUrl.startsWith("data:")
    ? dataUrl
    : await convertRemoteImageToDataUrl(dataUrl);
  const match = normalized.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    throw new Error("Unsupported image data URL.");
  }
  const mime = match[1] || "image/png";
  const bytes = Buffer.from(match[2] || "", "base64");
  return new File([bytes], filename, { type: mime });
}

async function requestOpenAIImages(req: ImageGatewayRequest): Promise<string> {
  const response = await fetch(joinUrl(req.channel.baseUrl, "/images/generations"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.channel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.channel.model,
      prompt: req.prompt,
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const first = parsed?.data?.[0];
  if (first?.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first?.url) {
    return await convertRemoteImageToDataUrl(String(first.url));
  }
  throw new Error("Image request succeeded but returned no image data.");
}

async function requestOpenAIImageEdit(req: ImageGatewayRequest): Promise<string> {
  if (!req.referenceImageUrl) {
    return await requestOpenAIImages(req);
  }

  const form = new FormData();
  form.append("model", req.channel.model);
  form.append("prompt", req.prompt);
  form.append("image", await dataUrlToFile(req.referenceImageUrl, "slide.png"));
  if (req.maskImageUrl) {
    form.append("mask", await dataUrlToFile(req.maskImageUrl, "mask.png"));
  }

  const response = await fetch(joinUrl(req.channel.baseUrl, "/images/edits"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.channel.apiKey}`,
    },
    body: form,
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const first = parsed?.data?.[0];
  if (first?.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first?.url) {
    return await convertRemoteImageToDataUrl(String(first.url));
  }
  throw new Error("Image edit request succeeded but returned no image data.");
}

async function requestOpenAIChatImage(req: ImageGatewayRequest): Promise<string> {
  const content: any[] = [{ type: "text", text: req.prompt }];
  if (req.referenceImageUrl) {
    content.push({ type: "image_url", image_url: { url: req.referenceImageUrl } });
  }
  if (req.maskImageUrl) {
    content.push({ type: "image_url", image_url: { url: req.maskImageUrl } });
  }
  for (const url of req.additionalReferenceImageUrls || []) {
    if (!url) continue;
    content.push({ type: "image_url", image_url: { url } });
  }

  const response = await fetch(joinUrl(req.channel.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.channel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.channel.model,
      messages: [{ role: "user", content: content.length > 1 ? content : req.prompt }],
      stream: false,
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const url = extractImageUrlFromOpenAIContent(parsed?.choices?.[0]?.message?.content);
  if (!url) {
    throw new Error("Image request succeeded but returned no image URL.");
  }
  return await convertRemoteImageToDataUrl(url);
}

async function requestAliyunImage(req: ImageGatewayRequest): Promise<string> {
  const content: any[] = [];
  for (const url of [
    ...(req.referenceImageUrl ? [req.referenceImageUrl] : []),
    ...(req.additionalReferenceImageUrls || []),
  ]) {
    content.push({ image: url });
  }
  content.push({ text: req.prompt });

  const response = await fetch(joinUrl(req.channel.baseUrl, "/services/aigc/multimodal-generation/generation"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.channel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.channel.model,
      input: {
        messages: [
          {
            role: "user",
            content,
          },
        ],
      },
      parameters: {
        n: 1,
        watermark: false,
      },
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const url = extractImageUrlFromAliyunContent(parsed?.output?.choices?.[0]?.message?.content);
  if (!url) {
    throw new Error("Aliyun image request succeeded but returned no image URL.");
  }
  return await convertRemoteImageToDataUrl(url);
}

const openaiImageAdapter: ImageAdapter = {
  supports: (req) => String(req.channel.provider || "").toLowerCase() === "openai",
  generate: async (req) => {
    const capabilities = resolveImageCapabilities(req.channel);
    if (shouldUseEditFlow(req, capabilities)) {
      return await requestOpenAIImageEdit(req);
    }
    return await requestOpenAIImages(req);
  },
};

const xaiImageAdapter: ImageAdapter = {
  supports: (req) => String(req.channel.provider || "").toLowerCase() === "xai",
  generate: async (req) => {
    // xAI image APIs are OpenAI-style at the transport layer in current provider support.
    const capabilities = resolveImageCapabilities(req.channel);
    if (shouldUseEditFlow(req, capabilities)) {
      return await requestOpenAIImageEdit(req);
    }
    return await requestOpenAIImages(req);
  },
};

const aliyunImageAdapter: ImageAdapter = {
  supports: (req) => String(req.channel.provider || "").toLowerCase() === "aliyun",
  generate: async (req) => {
    return await requestAliyunImage(req);
  },
};

const imageAdapters: ImageAdapter[] = [openaiImageAdapter, xaiImageAdapter, aliyunImageAdapter];

function findImageAdapter(req: ImageGatewayRequest): ImageAdapter | null {
  return imageAdapters.find((adapter) => adapter.supports(req)) || null;
}

export async function generateTextThroughGateway(req: TextGatewayRequest): Promise<string> {
  const route = resolveTextRoute(req.channel);
  if (route.protocol === "custom") {
    const spec = parseCustomProviderMapping(req.channel.customMapping);
    if (!spec) throw new Error("Custom text mapping is required.");
    const result = await executeCustomSpec({
      spec,
      channel: req.channel,
      context: {
        apiKey: req.channel.apiKey,
        baseUrl: req.channel.baseUrl,
        model: req.channel.model,
        messages: req.messages,
        prompt: extractTextFromOpenAIContent(req.messages[req.messages.length - 1]?.content),
      },
    });
    return typeof result === "string" ? result : JSON.stringify(result ?? "");
  }

  const response = await fetch(joinUrl(req.channel.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.channel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.channel.model,
      messages: req.messages,
      stream: false,
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  return extractTextFromOpenAIContent(parsed?.choices?.[0]?.message?.content);
}

export async function generateImageThroughGateway(req: ImageGatewayRequest): Promise<string> {
  const route = resolveImageRoute(req.channel);
  const capabilities = resolveImageCapabilities(req.channel);
  if (route.protocol === "custom") {
    const spec = parseCustomProviderMapping(req.channel.customMapping);
    if (!spec) throw new Error("Custom image mapping is required.");
    const result = await executeCustomSpec({
      spec,
      channel: req.channel,
      context: {
        apiKey: req.channel.apiKey,
        baseUrl: req.channel.baseUrl,
        model: req.channel.model,
        prompt: req.prompt,
        referenceImageUrl: req.referenceImageUrl || "",
        maskImageUrl: req.maskImageUrl || "",
        additionalReferenceImageUrls: req.additionalReferenceImageUrls || [],
        referenceImages: [
          ...(req.referenceImageUrl ? [req.referenceImageUrl] : []),
          ...(req.maskImageUrl ? [req.maskImageUrl] : []),
          ...(req.additionalReferenceImageUrls || []),
        ],
      },
    });
    const url = typeof result === "string" ? result : String(result || "");
    return await convertRemoteImageToDataUrl(url);
  }

  const adapter = findImageAdapter(req);
  if (adapter) {
    return await adapter.generate(req);
  }

  if (shouldUseEditFlow(req, capabilities)) {
    return await requestOpenAIImageEdit(req);
  }

  if (route.protocol === "openai-images" || route.protocol === "openai-images-fallback-chat-image") {
    try {
      return await requestOpenAIImages(req);
    } catch (imagesError) {
      if (route.protocol === "openai-images-fallback-chat-image") {
        try {
          return await requestOpenAIChatImage(req);
        } catch {
          throw imagesError;
        }
      }
      throw imagesError;
    }
  }

  return await requestOpenAIChatImage(req);
}
