import type { ChatMessage } from "@contracts/ai"

/**
 * Chat history persistence.
 *
 * Conversations here carry inline base64 images, so a handful of turns can
 * blow past the localStorage quota. Two defences, in order: strip the image
 * payloads (the tag and its label are what the UI re-renders from), then, if
 * the write still fails, retry with progressively harsher limits. The history
 * is never dropped wholesale — a shorter history beats none.
 */

export const CHAT_STORAGE_KEY_PREFIX = "chat_history_v2_"

export const chatStorageKey = (workspaceId: string) => `${CHAT_STORAGE_KEY_PREFIX}${workspaceId}`

const TRUNCATE_SUFFIX = "\n...[truncated]"

interface StorageLimits {
    maxMessages: number
    maxMessageChars: number
    maxTotalChars: number
}

/** Tried in order until one write succeeds. */
const FALLBACK_LIMITS: StorageLimits[] = [
    { maxMessages: 50, maxMessageChars: 24000, maxTotalChars: 240000 },
    { maxMessages: 30, maxMessageChars: 12000, maxTotalChars: 120000 },
    { maxMessages: 16, maxMessageChars: 6000, maxTotalChars: 60000 },
    { maxMessages: 8, maxMessageChars: 3000, maxTotalChars: 30000 },
]

export function truncateForStorage(text: string, maxChars: number) {
    const value = String(text || "")
    if (maxChars <= 0) return ""
    if (value.length <= maxChars) return value
    if (maxChars <= TRUNCATE_SUFFIX.length) return value.slice(0, maxChars)
    return value.slice(0, maxChars - TRUNCATE_SUFFIX.length) + TRUNCATE_SUFFIX
}

/** Accepts whatever was in storage; drops anything that is not a usable turn. */
export function normalizeStoredChatMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((message): message is Record<string, unknown> => !!message && typeof message === "object")
        .map((message) => {
            const role = String(message.role || "")
            return {
                role: (role === "user" || role === "assistant" || role === "system" ? role : "user") as ChatMessage["role"],
                content: typeof message.content === "string" ? message.content : String(message.content ?? ""),
            }
        })
        .filter((message) => !!message.content)
}

/**
 * Replaces inline image data with a placeholder. `[[IMAGE|label|data:...]]`
 * keeps its label so the message still reads correctly after a reload.
 */
function stripImagePayloads(text: string) {
    return String(text || "")
        .replace(/\[\[IMAGE\|([^|\]]*)\|data:image\/[\s\S]*?\]\]/gi, "[[IMAGE|$1|[image-data]]]")
        .replace(/data:image\/[^)\s]+/gi, "[image-data]")
}

function compactForStorage(source: ChatMessage[], limits: StorageLimits): ChatMessage[] {
    const compacted = normalizeStoredChatMessages(source)
        .slice(-limits.maxMessages)
        .map((message) => ({
            role: message.role,
            content: truncateForStorage(stripImagePayloads(message.content), limits.maxMessageChars),
        }))

    let totalChars = compacted.reduce((sum, message) => sum + message.content.length, 0)
    while (compacted.length > 1 && totalChars > limits.maxTotalChars) {
        totalChars -= compacted.shift()?.content.length || 0
    }

    // A single oversized message cannot be dropped — it may be the only turn.
    if (compacted.length === 1 && compacted[0].content.length > limits.maxTotalChars) {
        compacted[0] = {
            role: compacted[0].role,
            content: truncateForStorage(compacted[0].content, limits.maxTotalChars),
        }
    }

    return compacted
}

export function loadChatHistory(storageKey: string, fallback: ChatMessage[] = []): ChatMessage[] {
    if (typeof window === "undefined") return fallback
    try {
        const saved = localStorage.getItem(storageKey)
        if (!saved) return fallback
        const parsed = normalizeStoredChatMessages(JSON.parse(saved))
        return parsed.length > 0 ? parsed : fallback
    } catch (error) {
        console.error("Failed to parse chat history", error)
        return fallback
    }
}

/** Returns false only when even the harshest limits could not be written. */
export function saveChatHistory(storageKey: string, messages: ChatMessage[]): boolean {
    for (const limits of FALLBACK_LIMITS) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(compactForStorage(messages, limits)))
            return true
        } catch {
            // Quota exceeded — try again with a smaller slice.
        }
    }
    console.warn("Failed to persist chat history even at the smallest size")
    return false
}

/**
 * A compact transcript to hand an intent-routing agent, which needs recent
 * context but not the whole conversation.
 */
export function buildRecentHistoryContext(
    source: ChatMessage[],
    limits: StorageLimits = { maxMessages: 12, maxMessageChars: 3000, maxTotalChars: 18000 },
): string {
    const recent = (source || [])
        .filter((message) => message && (message.role === "user" || message.role === "assistant"))
        .slice(-limits.maxMessages)
    if (recent.length === 0) return ""

    // Walked newest-first so the budget is spent on the turns that matter:
    // this exists for intent continuity, and the latest exchange is the one
    // the model needs. Filling from the oldest end would drop it.
    const lines: string[] = []
    let totalChars = 0
    for (let i = recent.length - 1; i >= 0; i -= 1) {
        const message = recent[i]
        const text = truncateForStorage(String(message.content || ""), limits.maxMessageChars)
        if (!text) continue
        const remaining = limits.maxTotalChars - totalChars
        if (remaining <= 0) break
        const clipped = text.length > remaining ? truncateForStorage(text, remaining) : text
        lines.unshift(`[${message.role === "assistant" ? "Assistant" : "User"}] ${clipped}`)
        totalChars += clipped.length
    }

    if (lines.length === 0) return ""
    return `Recent chat history (for intent continuity):\n\n${lines.join("\n\n")}`
}
