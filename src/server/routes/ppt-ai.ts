import {
    generateImageThroughGateway,
    generateTextThroughGateway,
} from "../../lib/ai/gateway"
import {
    getImageChannelConfig,
    getTextChannelConfig,
    normalizeAIConfig,
    type AIConfig,
} from "../../lib/ai/provider-registry"

type ProxyChatMessage = {
    role: "system" | "user" | "assistant"
    content: any
}

type PptAIRequestBody =
    | {
          kind: "chat"
          aiConfig?: Partial<AIConfig>
          messages?: ProxyChatMessage[]
          model?: string
      }
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

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error"
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as PptAIRequestBody
        const config = normalizeAIConfig(body?.aiConfig)

        if (body.kind === "chat") {
            const messages = Array.isArray(body.messages) ? body.messages : []
            const textChannel = getTextChannelConfig(config)
            textChannel.model = String(body.model || textChannel.model || "").trim()

            if (!textChannel.apiKey || !textChannel.model || messages.length === 0) {
                return Response.json(
                    { error: "Missing text model, API key, or messages." },
                    { status: 400, headers: jsonHeaders },
                )
            }

            const content = await generateTextThroughGateway({
                channel: textChannel,
                messages,
            })
            return Response.json({ content }, { headers: jsonHeaders })
        }

        if (body.kind === "image") {
            const prompt = String(body.prompt || "").trim()
            const imageChannel = getImageChannelConfig(config)
            imageChannel.model = String(body.model || imageChannel.model || "").trim()

            if (!imageChannel.apiKey || !imageChannel.model || !prompt) {
                return Response.json(
                    { error: "Missing image model, API key, or prompt." },
                    { status: 400, headers: jsonHeaders },
                )
            }

            const url = await generateImageThroughGateway({
                channel: imageChannel,
                prompt,
                referenceImageUrl:
                    typeof body.referenceImageUrl === "string"
                        ? body.referenceImageUrl
                        : undefined,
                maskImageUrl:
                    typeof body.maskImageUrl === "string"
                        ? body.maskImageUrl
                        : undefined,
                additionalReferenceImageUrls: Array.isArray(
                    body.additionalReferenceImageUrls,
                )
                    ? body.additionalReferenceImageUrls
                          .map((x) => String(x || ""))
                          .filter(Boolean)
                    : [],
            })
            return Response.json({ url }, { headers: jsonHeaders })
        }

        return Response.json(
            { error: "Unsupported PPT AI request kind." },
            { status: 400, headers: jsonHeaders },
        )
    } catch (error) {
        return Response.json(
            { error: getErrorMessage(error) },
            { status: 500, headers: jsonHeaders },
        )
    }
}
