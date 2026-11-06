/**
 * One eval prompt carried through the app's /api/chat route the way the chat
 * panel carries it: a truncated display_diagram is continued with
 * append_diagram, and a diagram with no shapes is sent back once.
 *
 * Runs in Node (run.ts, with credentials from the environment) and in the
 * app's own page (browser.ts, with the settings the app already has), so it
 * touches neither DOM nor Node APIs.
 */

import { isMxCellXmlComplete } from "../../../client/workspaces/diagram/lib/diagram-operations"
import { wrapWithMxFile } from "../../../client/workspaces/diagram/lib/drawio-xml"

export interface EvalPrompt {
    id: string
    family: string
    lang: "zh" | "en"
    level: "simple" | "complex"
    split: "dev" | "holdout"
    text: string
}

export interface Generation {
    id: string
    /** The finished diagram as the model drew it, wrapped in mxfile. */
    xml?: string
    failure?: string
    rounds: number
    seconds: number
    tools: string[]
    /** The layout display_diagram declared, if it declared one. */
    layout?: string
}

interface ToolPart {
    type: string
    toolCallId: string
    state: string
    input?: unknown
    output?: unknown
    errorText?: string
}

type Part = { type: "text"; text: string } | ToolPart

interface StreamResult {
    parts: Part[]
    error?: string
}

/** Read the UI message stream into the assistant message it describes. */
async function readStream(res: Response): Promise<StreamResult> {
    const parts: Part[] = []
    const texts = new Map<string, { type: "text"; text: string }>()
    const tools = new Map<string, ToolPart>()
    let error: string | undefined
    const body = await res.text()
    for (const block of body.split(/\r?\n\r?\n/)) {
        const line = block.split(/\r?\n/).find((l) => l.startsWith("data:"))
        if (!line) continue
        const data = line.slice(5).trim()
        if (!data || data === "[DONE]") continue
        let ev: Record<string, unknown>
        try {
            ev = JSON.parse(data)
        } catch {
            continue
        }
        const type = String(ev.type)
        if (type === "text-start") {
            const p = { type: "text" as const, text: "" }
            texts.set(String(ev.id), p)
            parts.push(p)
        } else if (type === "text-delta") {
            const p = texts.get(String(ev.id))
            if (p) p.text += String(ev.delta ?? "")
        } else if (type === "tool-input-available") {
            const id = String(ev.toolCallId)
            let p = tools.get(id)
            if (!p) {
                p = { type: `tool-${ev.toolName}`, toolCallId: id, state: "input-available" }
                tools.set(id, p)
                parts.push(p)
            }
            p.input = ev.input
        } else if (type === "tool-output-available") {
            const p = tools.get(String(ev.toolCallId))
            if (p) {
                p.state = "output-available"
                p.output = ev.output
            }
        } else if (type === "error") {
            error = String(ev.errorText ?? "stream error")
        }
    }
    return { parts, error }
}

export interface ChatTarget {
    /** Where the app runs, ending in "/". */
    appUrl: string
    /** The aiConfig body field, exactly as the chat panel sends it. */
    aiConfig: Record<string, unknown>
}

async function ask(target: ChatTarget, messages: unknown[], signal: AbortSignal): Promise<StreamResult> {
    const res = await fetch(new URL("api/chat", target.appUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
            messages,
            xml: "",
            previousXml: "",
            sessionId: `eval-${Date.now()}`,
            deepThinkingEnabled: false,
            aiConfig: target.aiConfig,
        }),
    })
    if (!res.ok) return { parts: [], error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
    return readStream(res)
}

const MAX_ROUNDS = 4
const ROUND_TIMEOUT_MS = 240_000

export async function generate(target: ChatTarget, prompt: EvalPrompt): Promise<Generation> {
    const started = Date.now()
    const messages: unknown[] = [{ id: "u1", role: "user", parts: [{ type: "text", text: prompt.text }] }]
    const tools: string[] = []
    let assembled = ""
    let layout: string | undefined
    let repairs = 0
    const done = (rounds: number, fields: Partial<Generation>): Generation => ({
        id: prompt.id,
        rounds,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        tools,
        ...(layout ? { layout } : {}),
        ...fields,
    })

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS)
        let reply: StreamResult
        try {
            reply = await ask(target, messages, controller.signal)
        } catch (error) {
            return done(round, { failure: `request failed: ${String(error)}` })
        } finally {
            clearTimeout(timer)
        }
        if (reply.error) return done(round, { failure: reply.error })
        for (const p of reply.parts) if (p.type.startsWith("tool-")) tools.push(p.type.slice(5))

        const call = [...reply.parts]
            .reverse()
            .find((p): p is ToolPart => p.type === "tool-display_diagram" || p.type === "tool-append_diagram")
        if (!call) return done(round, { failure: "no diagram drawn" })
        const input = (call.input ?? {}) as { xml?: string; layout?: unknown }
        const fragment = String(input.xml ?? "")
        if (call.type === "tool-display_diagram" && typeof input.layout === "string") layout = input.layout
        const xml = call.type === "tool-append_diagram" ? assembled + fragment : fragment
        assembled = xml

        let feedback: string | null = null
        if (!isMxCellXmlComplete(xml)) {
            feedback =
                "Output was truncated due to length limits. Continue with append_diagram from the exact point where this fragment stopped. Do not emit wrapper tags or restart."
        } else if (!/<mxCell\b[^>]*\bvertex="1"/.test(xml) && repairs < 1) {
            repairs++
            feedback = "The diagram has no shapes. Call display_diagram again with complete mxCell elements."
        }
        if (!feedback) return done(round, { xml: wrapWithMxFile(xml) })
        call.state = "output-error"
        call.errorText = feedback
        messages.push({ id: `a${round}`, role: "assistant", parts: reply.parts })
    }
    return done(MAX_ROUNDS, { failure: "gave up after continuation and repair rounds" })
}
