import { generateImage } from "../ai/image"
import { generateText } from "../ai/text"
import { getImageChannel, getTextChannel, normalizeAIConfig } from "../../contracts/ai"
import type { AIConfig, MultimodalMessage } from "../../contracts/ai"

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
          model?: string
      }

const jsonHeaders = { "Content-Type": "application/json" }

const badRequest = (error: string) =>
    Response.json({ error }, { status: 400, headers: jsonHeaders })

const optionalString = (value: unknown) =>
    typeof value === "string" && value ? value : undefined

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
