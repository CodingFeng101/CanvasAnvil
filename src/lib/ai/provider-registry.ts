export type AIProviderId =
  | "openai"
  | "ollama"
  | "deepseek"
  | "kimi"
  | "aliyun"
  | "tencent"
  | "bytedance"
  | "zhipu"
  | "baidu"
  | "minimax"
  | "xai"
  | "google"
  | "anthropic"
  | "bfl"
  | "adobe"
  | "custom";

export type TextProtocol = "openai-chat" | "custom";
export type ImageProtocol = "openai-images" | "openai-chat-image" | "openai-images-fallback-chat-image" | "custom";

export interface CustomProviderMappingSpec {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  responsePath: string;
  supportsVision?: boolean;
  supportsReferenceImages?: boolean;
}

export interface AIChannelConfig {
  provider: AIProviderId | string;
  apiKey: string;
  baseUrl: string;
  model: string;
  customMapping?: string;
}

export interface AIConfig {
  textProvider: AIProviderId | string;
  textApiKey: string;
  textBaseUrl: string;
  textModel: string;
  textCustomMapping?: string;
  imageProvider: AIProviderId | string;
  imageApiKey: string;
  imageBaseUrl: string;
  imageModel: string;
  imageCustomMapping?: string;
  fileParserApiToken?: string;
  systemPrompt?: string;
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  imageModelLegacy?: string;
}

export interface ProviderOption {
  id: AIProviderId;
  label: string;
  defaultBaseUrl?: string;
}

export interface TextRoute {
  protocol: TextProtocol;
  supportsVision: boolean;
}

export interface ImageRoute {
  protocol: ImageProtocol;
  supportsReferenceImages: boolean;
}

const TEXT_VISION_RULES: Array<{ provider: AIProviderId; patterns: RegExp[] }> = [
  {
    provider: "openai",
    patterns: [/gpt-4o/i, /gpt-4\.1/i, /gpt-5/i, /o1/i, /o3/i],
  },
  {
    provider: "ollama",
    patterns: [/llava/i, /bakllava/i, /minicpm-v/i, /qwen2\.5-vl/i, /qwen2-vl/i, /vision/i, /vl/i, /gemma3/i],
  },
  {
    provider: "kimi",
    patterns: [/vision/i, /vl/i, /moonshot/i, /kimi/i],
  },
  {
    provider: "aliyun",
    patterns: [/vl/i, /vision/i, /qwen2\.5-vl/i, /qvq/i],
  },
  {
    provider: "zhipu",
    patterns: [/glm-4v/i, /glm-4\.1v/i, /glm-4\.5v/i, /cogvlm/i],
  },
  {
    provider: "baidu",
    patterns: [/vision/i, /vl/i, /ernie-4\.5-vl/i],
  },
  {
    provider: "tencent",
    patterns: [/vision/i, /vl/i, /hunyuan-vision/i],
  },
  {
    provider: "bytedance",
    patterns: [/vision/i, /vl/i, /doubao-vision/i],
  },
  {
    provider: "google",
    patterns: [/gemini/i],
  },
  {
    provider: "anthropic",
    patterns: [/claude/i],
  },
  {
    provider: "minimax",
    patterns: [/vision/i, /vl/i, /minimax-vl/i],
  },
  {
    provider: "xai",
    patterns: [/vision/i, /grok/i],
  },
];

const IMAGE_OPENAI_IMAGES_RULES: Array<{ provider: AIProviderId; patterns: RegExp[] }> = [
  {
    provider: "openai",
    patterns: [/gpt-image/i, /dall-e/i],
  },
];

const IMAGE_REFERENCE_RULES: Array<{ provider: AIProviderId; patterns: RegExp[] }> = [
  {
    provider: "openai",
    patterns: [/gpt-image/i],
  },
  {
    provider: "aliyun",
    patterns: [/wan/i, /qwen-image/i],
  },
  {
    provider: "bytedance",
    patterns: [/seedream/i],
  },
  {
    provider: "zhipu",
    patterns: [/glm-image/i, /cogview/i],
  },
  {
    provider: "tencent",
    patterns: [/hunyuan/i],
  },
];

export const TEXT_PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "ollama", label: "Ollama", defaultBaseUrl: "http://localhost:11434/v1" },
  { id: "deepseek", label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "kimi", label: "Kimi", defaultBaseUrl: "https://api.moonshot.cn/v1" },
  { id: "aliyun", label: "Alibaba Bailian" },
  { id: "tencent", label: "Tencent Hunyuan" },
  { id: "bytedance", label: "Bytedance Ark" },
  { id: "zhipu", label: "Zhipu" },
  { id: "baidu", label: "Baidu Qianfan" },
  { id: "minimax", label: "MiniMax" },
  { id: "xai", label: "xAI" },
  { id: "google", label: "Google" },
  { id: "anthropic", label: "Anthropic" },
];

export const IMAGE_PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "aliyun", label: "Alibaba Wanx" },
  { id: "tencent", label: "Tencent Hunyuan Image" },
  { id: "bytedance", label: "Bytedance Seedream" },
  { id: "zhipu", label: "Zhipu" },
  { id: "google", label: "Google Imagen" },
  { id: "xai", label: "xAI" },
  { id: "bfl", label: "Black Forest Labs" },
  { id: "adobe", label: "Adobe Firefly" },
];

function matchesRule(provider: string, model: string, rules: Array<{ provider: AIProviderId; patterns: RegExp[] }>) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedModel = String(model || "");
  return rules.some(
    (rule) =>
      rule.provider === normalizedProvider &&
      rule.patterns.some((pattern) => pattern.test(normalizedModel)),
  );
}

export function getDefaultBaseUrl(provider: string, kind: "text" | "image"): string {
  const options = kind === "text" ? TEXT_PROVIDER_OPTIONS : IMAGE_PROVIDER_OPTIONS;
  return options.find((item) => item.id === provider)?.defaultBaseUrl || "";
}

export function parseCustomProviderMapping(raw: string | undefined): CustomProviderMappingSpec | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const parsed = JSON.parse(text) as CustomProviderMappingSpec;
  if (!parsed || typeof parsed !== "object" || !parsed.endpoint || !parsed.responsePath) {
    throw new Error("Invalid custom mapping: endpoint and responsePath are required.");
  }
  return parsed;
}

export function resolveTextRoute(channel: AIChannelConfig): TextRoute {
  const provider = String(channel.provider || "").toLowerCase();
  if (provider === "custom" && String(channel.customMapping || "").trim()) {
    const spec = parseCustomProviderMapping(channel.customMapping);
    return {
      protocol: "custom",
      supportsVision: spec?.supportsVision === true,
    };
  }

  return {
    protocol: "openai-chat",
    supportsVision: matchesRule(provider, channel.model, TEXT_VISION_RULES),
  };
}

export function resolveImageRoute(channel: AIChannelConfig): ImageRoute {
  const provider = String(channel.provider || "").toLowerCase();
  if (provider === "custom" && String(channel.customMapping || "").trim()) {
    const spec = parseCustomProviderMapping(channel.customMapping);
    return {
      protocol: "custom",
      supportsReferenceImages: spec?.supportsReferenceImages === true,
    };
  }

  if (provider === "custom") {
    return {
      protocol: "openai-images-fallback-chat-image",
      supportsReferenceImages: false,
    };
  }

  return {
    protocol: matchesRule(provider, channel.model, IMAGE_OPENAI_IMAGES_RULES)
      ? "openai-images"
      : "openai-chat-image",
    supportsReferenceImages: matchesRule(provider, channel.model, IMAGE_REFERENCE_RULES),
  };
}

export function getTextChannelConfig(config: AIConfig): AIChannelConfig {
  return {
    provider: String(config.textProvider || "openai"),
    apiKey: String(config.textApiKey || config.apiKey || "").trim(),
    baseUrl: String(config.textBaseUrl || config.baseUrl || getDefaultBaseUrl(String(config.textProvider || "openai"), "text") || "").trim(),
    model: String(config.textModel || config.chatModel || "").trim(),
    customMapping: String(config.textCustomMapping || "").trim(),
  };
}

export function getImageChannelConfig(config: AIConfig): AIChannelConfig {
  return {
    provider: String(config.imageProvider || "openai"),
    apiKey: String(config.imageApiKey || config.apiKey || "").trim(),
    baseUrl: String(config.imageBaseUrl || config.baseUrl || getDefaultBaseUrl(String(config.imageProvider || "openai"), "image") || "").trim(),
    model: String(config.imageModel || config.imageModelLegacy || "").trim(),
    customMapping: String(config.imageCustomMapping || "").trim(),
  };
}

export function normalizeAIConfig(rawConfig: Partial<AIConfig> | null | undefined): AIConfig {
  const raw = rawConfig || {};
  const requestedTextProvider = String((raw.textProvider || "openai") as string).trim() || "openai";
  const requestedImageProvider = String((raw.imageProvider || "openai") as string).trim() || "openai";
  const textProvider = requestedTextProvider === "custom" ? "openai" : requestedTextProvider;
  const imageProvider = requestedImageProvider === "custom" ? "openai" : requestedImageProvider;
  const textApiKey = String((raw.textApiKey || raw.apiKey || "") as string).trim();
  const imageApiKey = String((raw.imageApiKey || raw.apiKey || "") as string).trim();
  const textBaseUrl =
    String((raw.textBaseUrl || raw.baseUrl || getDefaultBaseUrl(textProvider, "text") || "") as string).trim();
  const imageBaseUrl =
    String((raw.imageBaseUrl || raw.baseUrl || getDefaultBaseUrl(imageProvider, "image") || "") as string).trim();
  const textModel = String((raw.textModel || raw.chatModel || "") as string).trim();
  const imageModel = String((raw.imageModel || raw.imageModelLegacy || "") as string).trim();

  return {
    textProvider,
    textApiKey,
    textBaseUrl,
    textModel,
    textCustomMapping: "",
    imageProvider,
    imageApiKey,
    imageBaseUrl,
    imageModel,
    imageCustomMapping: "",
    fileParserApiToken: String(raw.fileParserApiToken || "").trim(),
    systemPrompt: String(raw.systemPrompt || "").trim(),
    apiKey: textApiKey,
    baseUrl: textBaseUrl,
    chatModel: textModel,
    imageModelLegacy: imageModel,
  };
}
