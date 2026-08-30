import { postJson } from "./transport";
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
