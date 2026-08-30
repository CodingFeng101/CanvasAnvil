import type { AIChannel } from "./types";

/** Join a configured base URL with an API path, tolerating stray slashes. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const suffix = String(path || "").trim();
  if (!suffix) return base;
  if (/^https?:\/\//i.test(suffix)) return suffix;
  if (!base) return suffix;
  return `${base}/${suffix.replace(/^\/+/, "")}`;
}

function parseBody(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Pull the most specific message an OpenAI-shaped error response offers. */
function toRequestError(status: number, text: string): Error {
  const parsed = parseBody(text);
  const message =
    parsed?.error?.message ||
    (typeof parsed?.error === "string" ? parsed.error : "") ||
    parsed?.message ||
    text ||
    `Request failed with status ${status}`;
  return new Error(String(message));
}

async function send(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw toRequestError(response.status, text);
  return parseBody(text);
}

export function postJson(channel: AIChannel, path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  return send(joinUrl(channel.baseUrl, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channel.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Multipart POST, for `/images/edits`; fetch sets the boundary itself. */
export function postForm(channel: AIChannel, path: string, form: FormData, signal?: AbortSignal): Promise<any> {
  return send(joinUrl(channel.baseUrl, path), {
    method: "POST",
    headers: { Authorization: `Bearer ${channel.apiKey}` },
    body: form,
    signal,
  });
}

/**
 * Inline a remote image so callers never hand out a URL that expires or needs
 * separate credentials. Data URLs pass through untouched.
 */
export async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:image")) return url;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image with status ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const normalized = await toDataUrl(dataUrl);
  const match = normalized.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("Unsupported image data URL.");
  return new File([Buffer.from(match[2] || "", "base64")], filename, {
    type: match[1] || "image/png",
  });
}
