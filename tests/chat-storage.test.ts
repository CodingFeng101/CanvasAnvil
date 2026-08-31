import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { ChatMessage } from "../contracts/ai";
import {
  buildRecentHistoryContext,
  chatStorageKey,
  loadChatHistory,
  normalizeStoredChatMessages,
  saveChatHistory,
  truncateForStorage,
} from "../client/shared/chat/chat-storage";

/**
 * Chat history carries inline base64 images, so writing it is the one place
 * the storage quota is regularly hit. What matters is that a failed write
 * degrades to a shorter history rather than throwing away the conversation.
 */

const KEY = "chat_history_v2_test";

/** A localStorage stand-in whose quota can be capped to force the fallbacks. */
class FakeStorage {
  private data = new Map<string, string>();
  limit = Infinity;
  writes = 0;

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    if (value.length > this.limit) {
      const error = new Error("QuotaExceededError");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

let storage: FakeStorage;
const originalWindow = (globalThis as Record<string, unknown>).window;
const originalStorage = (globalThis as Record<string, unknown>).localStorage;

beforeEach(() => {
  storage = new FakeStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;
  (globalThis as Record<string, unknown>).window = globalThis;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).localStorage = originalStorage;
  (globalThis as Record<string, unknown>).window = originalWindow;
});

const message = (role: ChatMessage["role"], content: string): ChatMessage => ({ role, content });

test("the storage key is namespaced per workspace", () => {
  assert.equal(chatStorageKey("cad"), "chat_history_v2_cad");
  assert.notEqual(chatStorageKey("cad"), chatStorageKey("ppt"));
});

test("truncateForStorage marks what it cut", () => {
  assert.equal(truncateForStorage("short", 100), "short");
  const cut = truncateForStorage("x".repeat(100), 40);
  assert.equal(cut.length, 40);
  assert.ok(cut.endsWith("[truncated]"), cut.slice(-20));
  // Too small to hold the marker: fall back to a plain slice.
  assert.equal(truncateForStorage("abcdef", 3), "abc");
  assert.equal(truncateForStorage("abcdef", 0), "");
});

test("normalizeStoredChatMessages drops what it cannot use", () => {
  const parsed = normalizeStoredChatMessages([
    { role: "user", content: "keep" },
    { role: "assistant", content: "keep too" },
    { role: "nonsense", content: "role coerced to user" },
    { role: "user", content: "" },
    null,
    "a string",
    { role: "user" },
  ]);

  assert.deepEqual(parsed, [
    { role: "user", content: "keep" },
    { role: "assistant", content: "keep too" },
    { role: "user", content: "role coerced to user" },
  ]);
  assert.deepEqual(normalizeStoredChatMessages("not an array"), []);
});

test("a round trip returns the conversation", () => {
  const messages = [message("user", "hello"), message("assistant", "hi")];
  assert.equal(saveChatHistory(KEY, messages), true);
  assert.deepEqual(loadChatHistory(KEY), messages);
});

test("loading falls back when nothing is stored or it is corrupt", () => {
  const fallback = [message("assistant", "welcome")];
  assert.deepEqual(loadChatHistory(KEY, fallback), fallback);

  storage.setItem(KEY, "{ this is not json");
  assert.deepEqual(loadChatHistory(KEY, fallback), fallback);

  // An array of unusable entries is empty after normalising, so the caller's
  // fallback stands rather than handing back a blank conversation.
  storage.setItem(KEY, JSON.stringify([null, { role: "user" }]));
  assert.deepEqual(loadChatHistory(KEY, fallback), fallback);
});

test("inline image data never reaches storage", () => {
  const png = "data:image/png;base64," + "A".repeat(5000);
  saveChatHistory(KEY, [message("user", `[[IMAGE|diagram.png|${png}]] look at this`)]);

  const written = storage.getItem(KEY)!;
  assert.ok(!written.includes("AAAA"), "base64 payload must be stripped");
  assert.ok(written.includes("[image-data]"), "a placeholder should remain");
  assert.ok(written.includes("diagram.png"), "the label the UI renders is kept");
});

test("a write that will not fit retries smaller instead of dropping everything", () => {
  const long = "x".repeat(20000);
  const messages = Array.from({ length: 40 }, (_, i) => message("user", `${i} ${long}`));

  // Small enough that the first tiers cannot fit, large enough that one can.
  storage.limit = 40000;
  assert.equal(saveChatHistory(KEY, messages), true);
  assert.ok(storage.writes > 1, "expected at least one retry at a smaller size");

  const kept = loadChatHistory(KEY);
  assert.ok(kept.length > 0, "history must survive, even if shortened");
  assert.ok(kept.length < messages.length, "and it should be shorter than the input");
});

test("an impossible write reports failure without wiping what was there", () => {
  saveChatHistory(KEY, [message("user", "previously saved")]);
  storage.limit = 1;
  assert.equal(saveChatHistory(KEY, [message("user", "x".repeat(100))]), false);
  assert.deepEqual(loadChatHistory(KEY), [message("user", "previously saved")]);
});

test("buildRecentHistoryContext summarises the tail for an intent router", () => {
  const context = buildRecentHistoryContext([
    message("system", "ignored"),
    message("user", "draw a login flow"),
    message("assistant", "here it is"),
  ]);

  assert.ok(context.startsWith("Recent chat history"));
  assert.ok(context.includes("[User] draw a login flow"));
  assert.ok(context.includes("[Assistant] here it is"));
  assert.ok(!context.includes("ignored"), "system turns are not conversation");
  assert.equal(buildRecentHistoryContext([]), "");
});

test("buildRecentHistoryContext respects its budget", () => {
  const messages = Array.from({ length: 50 }, (_, i) => message("user", `turn ${i} ${"y".repeat(500)}`));
  const context = buildRecentHistoryContext(messages, {
    maxMessages: 5,
    maxMessageChars: 100,
    maxTotalChars: 300,
  });

  assert.ok(context.length < 600, `expected a small context, got ${context.length}`);
});

test("an over-budget history keeps the newest turns, not the oldest", () => {
  // This is for intent continuity, so the latest exchange is the one the
  // model needs; spending the budget from the oldest end would drop it.
  const messages = [
    message("user", `old ${"y".repeat(200)}`),
    message("user", `middle ${"y".repeat(200)}`),
    message("user", `newest ${"y".repeat(200)}`),
  ];
  const context = buildRecentHistoryContext(messages, {
    maxMessages: 10,
    maxMessageChars: 500,
    maxTotalChars: 250,
  });

  assert.ok(context.includes("newest"), context.slice(0, 120));
  assert.ok(!context.includes("old y"), "the oldest turn is the one dropped");
});

test("turns stay in the order they were said", () => {
  const context = buildRecentHistoryContext([
    message("user", "first"),
    message("assistant", "second"),
    message("user", "third"),
  ]);
  assert.ok(
    context.indexOf("first") < context.indexOf("second") &&
      context.indexOf("second") < context.indexOf("third"),
    context,
  );
});


/**
 * The guard that stops ChatInput's two file-sync effects from swapping arrays
 * forever. It lives in chat-input.tsx alongside the effects it protects; this
 * pins the contract that made the loop possible -- equal-but-distinct arrays
 * must compare as the same.
 */
function sameFileList(a: File[], b: File[]): boolean {
  return a.length === b.length && a.every((file, i) => file === b[i]);
}

const fakeFile = (name: string) => ({ name }) as unknown as File;

test("two separate empty arrays count as the same file list", () => {
  // This is the exact pair that used to ping-pong: the parent and the input
  // each start with their own [], equal in content and distinct by reference.
  assert.equal(sameFileList([], []), true);
});

test("the same files in the same order count as the same list", () => {
  const a = fakeFile("a.png");
  const b = fakeFile("b.png");
  assert.equal(sameFileList([a, b], [a, b]), true);
});

test("a changed list is still detected", () => {
  const a = fakeFile("a.png");
  const b = fakeFile("b.png");
  assert.equal(sameFileList([a], [a, b]), false, "an added file");
  assert.equal(sameFileList([a, b], [a]), false, "a removed file");
  assert.equal(sameFileList([a, b], [b, a]), false, "a reorder");
  assert.equal(sameFileList([a], [fakeFile("a.png")]), false, "a different File with the same name");
});
