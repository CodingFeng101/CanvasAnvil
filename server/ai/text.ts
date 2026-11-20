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

/** Token usage as the provider reported it; absent when it reports none. */
export type TextUsage = { input?: number; output?: number };

/** OpenAI-style `usage` → ours. Only numbers the provider actually sent. */
export function readUsage(raw: any): TextUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const pick = (...values: unknown[]) => values.find((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  const input = pick(raw.prompt_tokens, raw.input_tokens);
  const output = pick(raw.completion_tokens, raw.output_tokens);
  return input === undefined && output === undefined ? undefined : { input, output };
}

export async function generateText(req: TextRequest): Promise<string> {
  return (await generateTextWithUsage(req)).text;
}

export async function generateTextWithUsage(req: TextRequest): Promise<{ text: string; usage?: TextUsage }> {
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
  return { text: contentToText(result?.choices?.[0]?.message?.content), usage: readUsage(result?.usage) };
}

/**
 * Stream a chat completion. Yields text deltas, then reports why the model stopped
 * ("length" means the output was cut off). Providers that ignore `stream` and answer
 * with plain JSON are handled too.
 */
export async function* streamText(req: TextRequest): AsyncGenerator<{ delta?: string; finish?: string; usage?: TextUsage }> {
  const url = joinUrl(req.channel.baseUrl, "/chat/completions");
  const post = (withUsage: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${req.channel.apiKey}`, "Content-Type": "application/json" },
      // `include_usage` asks for the token counts in the last chunk.
      body: JSON.stringify({ model: req.channel.model, messages: req.messages, stream: true, ...(withUsage && { stream_options: { include_usage: true } }) }),
      signal: req.signal,
    });
  let response = await post(true);
  // A provider that rejects `stream_options` is asked again without it (and reports no usage).
  if (response.status === 400) {
    const text = await response.clone().text().catch(() => "");
    if (/stream_options|include_usage/i.test(text)) response = await post(false);
  }
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
    yield { delta: contentToText(choice?.message?.content), finish: choice?.finish_reason || "stop", usage: readUsage(result?.usage) };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finish = "";
  let usage: TextUsage | undefined;
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
      usage = readUsage(event?.usage) ?? usage;
    }
  }
  yield { finish: finish || "stop", ...(usage && { usage }) };
}
