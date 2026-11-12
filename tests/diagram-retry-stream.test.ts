import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createUIMessageStream } from "ai";

/**
 * After a failed display_diagram the chat sends the conversation again and the answer continues the same
 * assistant message. The stream must start under that message's id: under a new id the client appends a second
 * message that repeats the first one's text, plan and failed drawing.
 */
async function startId(originalMessages?: unknown[]) {
  const stream = createUIMessageStream({
    ...(originalMessages ? { originalMessages: originalMessages as never } : {}),
    execute: ({ writer }) => { writer.write({ type: "start" }); writer.write({ type: "finish" }); },
  });
  for await (const chunk of stream as unknown as AsyncIterable<{ type: string; messageId?: string }>) if (chunk.type === "start") return chunk.messageId;
  return undefined;
}

test("a continued answer keeps the assistant message's id only when the conversation is passed", async () => {
  const conversation = [{ id: "user-1", role: "user", parts: [] }, { id: "assistant-1", role: "assistant", parts: [] }];
  assert.equal(await startId(conversation), "assistant-1");
  assert.notEqual(await startId(), "assistant-1");
});

test("the diagram chat route passes the conversation to its stream", () => {
  const source = readFileSync(new URL("../server/routes/chat.ts", import.meta.url), "utf8");
  assert.match(source, /createUIMessageStream\(\{[\s\S]{0,400}originalMessages: Array\.isArray\(messages\) \? messages : \[\]/);
});
