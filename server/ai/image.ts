import { dataUrlToFile, postForm, postJson, toDataUrl } from "./transport";
import type { ImageRequest } from "../../contracts/ai";

/**
 * Image models are reached through three OpenAI routes, tried in order:
 *
 *   1. `/images/edits`      — only when a reference image was supplied
 *   2. `/images/generations`
 *   3. `/chat/completions`  — many OpenAI-compatible gateways expose their
 *                             image models as chat models that answer with an
 *                             image part or a markdown image link
 *
 * The first route that returns an image wins. If every route fails, the error
 * from the first (most specific) attempt is what the caller sees, since that
 * is the route the configuration asked for.
 */
type Route = (req: ImageRequest) => Promise<string>;

function referenceImageUrls(req: ImageRequest): string[] {
  return [
    ...(req.referenceImageUrl ? [req.referenceImageUrl] : []),
    ...(req.additionalReferenceImageUrls || []).filter(Boolean),
  ];
}

/** OpenAI's images routes answer with either base64 or a short-lived URL. */
async function readImagesResponse(result: any): Promise<string> {
  const first = result?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return await toDataUrl(String(first.url));
  throw new Error("Image request succeeded but returned no image data.");
}

/** Chat responses may carry the image as a part, a markdown link, or a bare URL. */
function readChatImage(content: any): string | null {
  const fromText = (text: string): string | null => {
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

const editRoute: Route = async (req) => {
  const form = new FormData();
  form.append("model", req.channel.model);
  form.append("prompt", req.prompt);
  form.append("image", await dataUrlToFile(req.referenceImageUrl!, "reference.png"));
  if (req.maskImageUrl) {
    form.append("mask", await dataUrlToFile(req.maskImageUrl, "mask.png"));
  }
  return await readImagesResponse(await postForm(req.channel, "/images/edits", form, req.signal));
};

const generationRoute: Route = async (req) =>
  await readImagesResponse(
    await postJson(req.channel, "/images/generations", { model: req.channel.model, prompt: req.prompt }, req.signal),
  );

const chatRoute: Route = async (req) => {
  const parts: any[] = [{ type: "text", text: req.prompt }];
  if (req.maskImageUrl) {
    parts.push({ type: "image_url", image_url: { url: req.maskImageUrl } });
  }
  for (const url of referenceImageUrls(req)) {
    parts.push({ type: "image_url", image_url: { url } });
  }

  const result = await postJson(
    req.channel,
    "/chat/completions",
    {
      model: req.channel.model,
      messages: [{ role: "user", content: parts.length > 1 ? parts : req.prompt }],
      stream: false,
    },
    req.signal,
  );

  const url = readChatImage(result?.choices?.[0]?.message?.content);
  if (!url) throw new Error("Image request succeeded but returned no image URL.");
  return await toDataUrl(url);
};

export async function generateImage(req: ImageRequest): Promise<string> {
  const routes: Route[] = req.referenceImageUrl
    ? [editRoute, chatRoute]
    : [generationRoute, chatRoute];

  let firstError: unknown = null;
  for (const route of routes) {
    try {
      return await route(req);
    } catch (error) {
      if ((error as any)?.name === "AbortError") throw error;
      if (firstError === null) firstError = error;
    }
  }
  throw firstError instanceof Error ? firstError : new Error("Image generation failed.");
}
