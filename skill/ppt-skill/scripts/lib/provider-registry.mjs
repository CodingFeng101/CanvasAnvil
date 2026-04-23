function matchesRule(provider, model, rules) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedModel = String(model || "");
  return rules.some(
    (rule) =>
      rule.provider === normalizedProvider &&
      rule.patterns.some((pattern) => pattern.test(normalizedModel)),
  );
}

const IMAGE_OPENAI_IMAGES_RULES = [
  { provider: "openai", patterns: [/gpt-image/i, /dall-e/i] },
];

const IMAGE_REFERENCE_RULES = [
  { provider: "openai", patterns: [/gpt-image/i] },
  { provider: "aliyun", patterns: [/wan/i, /qwen-image/i] },
  { provider: "bytedance", patterns: [/seedream/i] },
  { provider: "zhipu", patterns: [/glm-image/i, /cogview/i] },
  { provider: "tencent", patterns: [/hunyuan/i] },
];

const IMAGE_PROVIDER_OPTIONS = [
  { id: "openai", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "aliyun", defaultBaseUrl: "" },
  { id: "tencent", defaultBaseUrl: "" },
  { id: "bytedance", defaultBaseUrl: "" },
  { id: "zhipu", defaultBaseUrl: "" },
  { id: "google", defaultBaseUrl: "" },
  { id: "xai", defaultBaseUrl: "" },
  { id: "bfl", defaultBaseUrl: "" },
  { id: "adobe", defaultBaseUrl: "" },
];

export function getDefaultBaseUrl(provider) {
  return IMAGE_PROVIDER_OPTIONS.find((item) => item.id === provider)?.defaultBaseUrl || "";
}

export function resolveImageRoute(channel) {
  const provider = String(channel.provider || "").toLowerCase();
  if (provider === "custom") {
    throw new Error("Custom image providers are not supported in ppt-skill.");
  }

  return {
    protocol: matchesRule(provider, channel.model, IMAGE_OPENAI_IMAGES_RULES)
      ? "openai-images"
      : "openai-chat-image",
    supportsReferenceImages: matchesRule(provider, channel.model, IMAGE_REFERENCE_RULES),
  };
}
