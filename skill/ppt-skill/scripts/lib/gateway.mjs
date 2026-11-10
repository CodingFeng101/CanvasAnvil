import { resolveImageRoute } from "./image-route.mjs";

/**
 * One image request, the same routes the website's server uses:
 *
 *   with reference images:    /images/edits (every image attached) -> /chat/completions
 *   without reference images: /images/generations                  -> /chat/completions
 *
 * A model that only answers through chat (resolveImageRoute) tries chat first.
 * The first route that returns an image wins; if all fail, the first route's
 * error is the one reported.
 *
 * req: { channel, prompt, referenceImageUrls?: string[], referenceImageUrl?: string, signal?: AbortSignal }
 * Reference images are data URLs or http(s) URLs; the template goes first.
 */

function joinUrl(baseUrl, endpoint) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const path = String(endpoint || "").trim();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

export function referenceImageUrls(req) {
  return [
    ...(req.referenceImageUrl ? [req.referenceImageUrl] : []),
    ...(req.referenceImageUrls || []),
  ].filter(Boolean);
}

async function toDataUrl(url) {
  if (url.startsWith("data:image")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch remote image with status ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function toBlob(url) {
  const dataUrl = await toDataUrl(url);
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) throw new Error("Reference image is not a base64 data URL.");
  return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
}

async function readResponse(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message = parsed?.error?.message || (typeof parsed?.error === "string" ? parsed.error : "") || text;
    throw new Error(`status ${response.status}: ${String(message || "request failed").slice(0, 500)}`);
  }
  return parsed;
}

async function readImagesResponse(parsed) {
  const first = parsed?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return await toDataUrl(String(first.url));
  throw new Error("Image request succeeded but returned no image data.");
}

function readChatImage(content) {
  const fromText = (text) => {
    const markdown = text.match(/!\[.*?\]\((.*?)\)/);
    if (markdown?.[1]) return markdown[1];
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image")) return trimmed;
    return null;
  };
  if (typeof content === "string") return fromText(content);
  if (!Array.isArray(content)) return null;
  const imagePart = content.find((part) => part?.type === "image_url" && part?.image_url?.url);
  if (imagePart) return String(imagePart.image_url.url);
  const textPart = content.find((part) => part?.type === "text" && typeof part?.text === "string");
  return textPart ? fromText(textPart.text) : null;
}

const authHeader = (channel) => ({ Authorization: `Bearer ${channel.apiKey}` });

async function editRoute(req) {
  const urls = referenceImageUrls(req);
  if (urls.length === 0) throw new Error("No reference image to edit.");
  const form = new FormData();
  form.append("model", req.channel.model);
  form.append("prompt", req.prompt);
  const blobs = await Promise.all(urls.map(toBlob));
  // Repeated `image[]` is how the images API takes more than one; a gateway
  // that only understands a single `image` still reads the first.
  const field = blobs.length > 1 ? "image[]" : "image";
  blobs.forEach((blob, i) => form.append(field, blob, i === 0 ? "reference.png" : `material-${i}.png`));
  const response = await fetch(joinUrl(req.channel.baseUrl, "/images/edits"), {
    method: "POST", headers: authHeader(req.channel), body: form, signal: req.signal,
  });
  return await readImagesResponse(await readResponse(response));
}

async function generationRoute(req) {
  const response = await fetch(joinUrl(req.channel.baseUrl, "/images/generations"), {
    method: "POST",
    headers: { ...authHeader(req.channel), "Content-Type": "application/json" },
    body: JSON.stringify({ model: req.channel.model, prompt: req.prompt }),
    signal: req.signal,
  });
  return await readImagesResponse(await readResponse(response));
}

async function chatRoute(req) {
  const parts = [{ type: "text", text: req.prompt }];
  for (const url of referenceImageUrls(req)) {
    parts.push({ type: "image_url", image_url: { url: await toDataUrl(url) } });
  }
  const response = await fetch(joinUrl(req.channel.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: { ...authHeader(req.channel), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.channel.model,
      messages: [{ role: "user", content: parts.length > 1 ? parts : req.prompt }],
      stream: false,
    }),
    signal: req.signal,
  });
  const parsed = await readResponse(response);
  const url = readChatImage(parsed?.choices?.[0]?.message?.content);
  if (!url) throw new Error("Image request succeeded but returned no image URL.");
  return await toDataUrl(url);
}

export function routeNamesFor(req) {
  const images = referenceImageUrls(req).length > 0 ? "edit" : "generation";
  return resolveImageRoute(req.channel).protocol === "openai-images" ? [images, "chat"] : ["chat", images];
}

export async function generateImageThroughGateway(req) {
  const byName = { edit: editRoute, generation: generationRoute, chat: chatRoute };
  let firstError = null;
  for (const name of routeNamesFor(req)) {
    try {
      return await byName[name](req);
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
      if (firstError === null) firstError = error;
    }
  }
  throw firstError instanceof Error ? firstError : new Error("Image generation failed.");
}
