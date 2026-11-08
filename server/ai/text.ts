import { joinUrl, postJson } from "./transport";
import type { ChatContentPart, TextRequest } from "../../contracts/ai";

/** Flatten OpenAI message content (string or part array) to plain text. */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      const typed = part as ChatContentPart;
      return typed?.type === "text" && typeof typed.text === "string" ? typed.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function generateText(req: TextRequest): Promise<string> {
  const result = await postJson(
    req.channel,
    "/chat/completions",
    {
      model: req.channel.model,
      messages: req.messages,
      stream: false,
    },
    req.signal,
  );
  return contentToText(result?.choices?.[0]?.message?.content);
}

/**
 * Stream a chat completion. Yields text deltas, then reports why the model stopped
 * ("length" means the output was cut off). Providers that ignore `stream` and answer
 * with plain JSON are handled too.
 */
export async function* streamText(req: TextRequest): AsyncGenerator<{ delta?: string; finish?: string }> {
  const url = joinUrl(req.channel.baseUrl, "/chat/completions");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.channel.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: req.channel.model, messages: req.messages, stream: true }),
    signal: req.signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    console.error(`[ai] POST ${url} (stream) -> ${response.status}:`, text.slice(0, 500) || "(empty body)");
    let message = text;
    try { message = JSON.parse(text)?.error?.message || text; } catch { /* plain text */ }
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  if (!String(response.headers.get("content-type") || "").includes("event-stream")) {
    const result = JSON.parse(await response.text());
    const choice = result?.choices?.[0];
    yield { delta: contentToText(choice?.message?.content), finish: choice?.finish_reason || "stop" };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finish = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!data || data === "[DONE]" || !line.trim().startsWith("data:")) continue;
      let event: any;
      try { event = JSON.parse(data); } catch { continue; }
      const choice = event?.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) yield { delta };
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  yield { finish: finish || "stop" };
}
