import { generateImage } from "../ai/image"
import { generateText, streamText } from "../ai/text"
import { IMAGE_QUALITIES, IMAGE_SIZES, getImageChannel, getTextChannel, normalizeAIConfig } from "../../contracts/ai"
import type { AIConfig, ImageQuality, ImageSize, MultimodalMessage } from "../../contracts/ai"

/**
 * Non-streaming model proxy for the CAD and PPT workspaces.
 *
 * The browser never talks to the provider directly, so the API key stays out
 * of cross-origin requests and remote images can be inlined server-side.
 */

type RequestBody =
    | { kind: "chat"; aiConfig?: Partial<AIConfig>; messages?: MultimodalMessage[]; model?: string }
    | {
          kind: "image"
          aiConfig?: Partial<AIConfig>
          prompt?: string
          referenceImageUrl?: string
          additionalReferenceImageUrls?: string[]
          maskImageUrl?: string
          size?: ImageSize
          quality?: ImageQuality
          model?: string
      }

const jsonHeaders = { "Content-Type": "application/json" }

const badRequest = (error: string) =>
    Response.json({ error }, { status: 400, headers: jsonHeaders })

const optionalString = (value: unknown) =>
    typeof value === "string" && value ? value : undefined

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
    return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody
        const config = normalizeAIConfig(body?.aiConfig)

        if (body.kind === "chat") {
            const messages = Array.isArray(body.messages) ? body.messages : []
            const channel = { ...getTextChannel(config), model: String(body.model || config.textModel || "").trim() }

            if (!channel.apiKey || !channel.model || messages.length === 0) {
                return badRequest("Missing text model, API key, or messages.")
            }

            const content = await generateText({ channel, messages })
            return Response.json({ content }, { headers: jsonHeaders })
        }

        if (body.kind === "image") {
            const prompt = String(body.prompt || "").trim()
            const channel = { ...getImageChannel(config), model: String(body.model || config.imageModel || "").trim() }

            if (!channel.apiKey || !channel.model || !prompt) {
                return badRequest("Missing image model, API key, or prompt.")
            }

            const url = await generateImage({
                channel,
                prompt,
                referenceImageUrl: optionalString(body.referenceImageUrl),
                maskImageUrl: optionalString(body.maskImageUrl),
                additionalReferenceImageUrls: Array.isArray(body.additionalReferenceImageUrls)
                    ? body.additionalReferenceImageUrls.map((x) => String(x || "")).filter(Boolean)
                    : [],
                size: optionalEnum(body.size, IMAGE_SIZES),
                quality: optionalEnum(body.quality, IMAGE_QUALITIES),
            })
            return Response.json({ url }, { headers: jsonHeaders })
        }

        return badRequest("Unsupported PPT AI request kind.")
    } catch (error) {
        return Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500, headers: jsonHeaders },
        )
    }
}

/**
 * Streaming text for the CAD workspace: newline-delimited JSON, one event per line —
 * {"delta": "..."} as the model writes, then {"finish": "stop" | "length"}, or {"error": "..."}.
 */
export async function POST_STREAM(req: Request) {
    let body: RequestBody
    try {
        body = (await req.json()) as RequestBody
    } catch {
        return badRequest("Invalid JSON body.")
    }
    if (body?.kind !== "chat") return badRequest("Only chat requests stream.")
    const config = normalizeAIConfig(body.aiConfig)
    const messages = Array.isArray(body.messages) ? body.messages : []
    const channel = { ...getTextChannel(config), model: String(body.model || config.textModel || "").trim() }
    if (!channel.apiKey || !channel.model || messages.length === 0) {
        return badRequest("Missing text model, API key, or messages.")
    }
    const encoder = new TextEncoder()
    const abort = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
            const started = Date.now()
            let chars = 0
            let firstAt = 0
            let finish = ""
            const inputChars = JSON.stringify(messages).length
            try {
                for await (const event of streamText({ channel, messages, signal: abort.signal })) {
                    if (event.delta && !firstAt) firstAt = Date.now()
                    chars += event.delta?.length ?? 0
                    if (event.finish) finish = event.finish
                    send(event)
                }
                const seconds = (at: number) => ((at - started) / 1000).toFixed(1)
                console.log(`[ai] stream ${channel.model} ${finish}: input ${inputChars} chars, first token ${firstAt ? seconds(firstAt) : "-"}s, total ${seconds(Date.now())}s, ${chars} chars out`)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const rawCause = (error as { cause?: { message?: string } } | null)?.cause
                const cause = rawCause ? ` (${rawCause.message ?? String(rawCause)})` : ""
                // "terminated" = the provider or a proxy closed the connection mid-answer.
                console.error(`[ai] stream ${channel.model} interrupted after ${Math.round((Date.now() - started) / 1000)}s, ${chars} chars: ${message}${cause}`)
                send({ error: message })
            } finally {
                controller.close()
            }
        },
        cancel() {
            abort.abort()
        },
    })
    return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    })
}
