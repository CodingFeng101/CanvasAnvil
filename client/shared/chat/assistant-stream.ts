import type { Dispatch, SetStateAction } from "react"
import type { ChatMessage } from "@contracts/ai"

/**
 * Coalesces streamed assistant chunks into one repaint per frame.
 *
 * The model emits far faster than React can usefully re-render a long
 * message; without this the panel spends its time reconciling text nobody
 * saw. Only the newest chunk survives a frame, and `flush` guarantees the
 * final one lands even if the stream ends mid-frame.
 */

function scheduleFrame(callback: () => void): number {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback)
    if (typeof window !== "undefined") return window.setTimeout(callback, 16)
    return 0
}

function cancelFrame(id: number) {
    if (!id) return
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id)
    else if (typeof window !== "undefined") window.clearTimeout(id)
}

export interface AssistantUpdater {
    /** Records the newest full text; repaints at most once per frame. */
    push: (content: string) => void
    /** Repaints immediately with whatever was last pushed. */
    flush: () => void
}

/**
 * Replaces the trailing assistant turn, or appends one if the last turn was
 * the user's. Use directly for a one-shot status line; use
 * {@link createAssistantUpdater} for a stream.
 *
 * @param sanitize strips the workspace's tool payloads out of what the user sees
 */
export function writeLastAssistant(
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
    sanitize: (content: string) => string,
    content: string,
) {
    const display = sanitize(content)
    setMessages((prev) => {
        const last = prev[prev.length - 1]
        const message: ChatMessage = { role: "assistant", content: display }
        return last?.role === "assistant" ? [...prev.slice(0, -1), message] : [...prev, message]
    })
}

export function createAssistantUpdater(
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
    sanitize: (content: string) => string,
): AssistantUpdater {
    const write = (content: string) => writeLastAssistant(setMessages, sanitize, content)

    let latest = ""
    let frameId: number | null = null

    return {
        push: (content: string) => {
            latest = content
            if (frameId !== null) return
            frameId = scheduleFrame(() => {
                frameId = null
                write(latest)
            })
        },
        flush: () => {
            if (frameId !== null) {
                cancelFrame(frameId)
                frameId = null
            }
            write(latest)
        },
    }
}
