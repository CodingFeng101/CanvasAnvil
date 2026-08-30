import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AIChannel } from "./types";

/**
 * Build the AI SDK model used by the streaming `/api/chat` route.
 *
 * Credentials always come from the app's Settings dialog and arrive with the
 * request; `AI_MODEL` / `AI_BASE_URL` only supply defaults for deployments that
 * pin a model server-side.
 */
export function getChatModel(channel: Partial<AIChannel>): { model: LanguageModel; modelId: string } {
  const modelId = String(channel.model || process.env.AI_MODEL || "").trim();
  if (!modelId) {
    throw new Error("No chat model configured. Set one in the app Settings dialog.");
  }

  const apiKey = String(channel.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("API Key is missing. Please set it in the app Settings dialog.");
  }

  const baseURL = String(
    channel.baseUrl || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "",
  ).trim();

  const openai = createOpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
  return { model: openai.chat(modelId), modelId };
}
