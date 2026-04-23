import { resolveImageRoute } from "./provider-registry.mjs";

function joinUrl(baseUrl, endpoint) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const path = String(endpoint || "").trim();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

async function convertRemoteImageToDataUrl(url) {
  if (url.startsWith("data:image")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch remote image with status ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function extractImageUrlFromOpenAIContent(content) {
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
    if (/^https?:\/\//i.test(content.trim()) || content.trim().startsWith("data:image")) return content.trim();
  }

  return null;
}

async function requestOpenAIImages(req) {
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
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const first = parsed?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return await convertRemoteImageToDataUrl(String(first.url));
  throw new Error("Image request succeeded but returned no image data.");
}

async function requestOpenAIChatImage(req) {
  const content = [{ type: "text", text: req.prompt }];
  if (req.referenceImageUrl) {
    content.push({ type: "image_url", image_url: { url: req.referenceImageUrl } });
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
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.error?.message || parsed?.error || text || `Request failed with status ${response.status}`);
  }

  const url = extractImageUrlFromOpenAIContent(parsed?.choices?.[0]?.message?.content);
  if (!url) throw new Error("Image request succeeded but returned no image URL.");
  return await convertRemoteImageToDataUrl(url);
}

export async function generateImageThroughGateway(req) {
  const route = resolveImageRoute(req.channel);

  if (route.protocol === "openai-images") return await requestOpenAIImages(req);
  return await requestOpenAIChatImage(req);
}
