type ProxyAIConfig = {
    apiKey?: string
    baseUrl?: string
    chatModel?: string
    imageModel?: string
}

type ProxyChatMessage = {
    role: "system" | "user" | "assistant"
    content: any
}

type PptAIRequestBody =
    | {
          kind: "chat"
          aiConfig?: ProxyAIConfig
          messages?: ProxyChatMessage[]
          model?: string
      }
    | {
          kind: "image"
          aiConfig?: ProxyAIConfig
          prompt?: string
          referenceImageUrl?: string
          additionalReferenceImageUrls?: string[]
          model?: string
      }

const jsonHeaders = { "Content-Type": "application/json" }

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error"
}

function cleanUrl(url: string) {
    if (!url) return null
    if (url.startsWith("http")) return url
    if (url.startsWith("data:image")) return url
    return null
}

function extractTextFromContent(content: any): string {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") return part
                if (part?.type === "text" && typeof part?.text === "string") return part.text
                return ""
            })
            .filter(Boolean)
            .join("\n")
    }
    return ""
}

function extractImageUrlFromContent(messageContent: any) {
    if (Array.isArray(messageContent)) {
        const imagePart = messageContent.find((part: any) => part?.type === "image_url")
        if (imagePart?.image_url?.url) {
            return cleanUrl(String(imagePart.image_url.url))
        }
        return null
    }

    if (typeof messageContent === "string") {
        const markdownMatch = messageContent.match(/!\[.*?\]\((.*?)\)/)
        if (markdownMatch?.[1]) {
            return cleanUrl(markdownMatch[1])
        }
        return cleanUrl(messageContent.trim())
    }

    return null
}

async function convertRemoteImageToDataUrl(url: string): Promise<string> {
    if (url.startsWith("data:image")) return url
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to fetch remote image with status ${response.status}`)
    }
    const contentType = response.headers.get("content-type") || "image/png"
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString("base64")}`
}

async function proxyChatCompletion(args: {
    apiKey: string
    baseUrl: string
    model: string
    messages: ProxyChatMessage[]
}) {
    const response = await fetch(`${args.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: args.model,
            messages: args.messages,
            stream: false,
        }),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Upstream chat request failed with status ${response.status}: ${text}`)
    }

    const result = await response.json()
    const content = result?.choices?.[0]?.message?.content
    return extractTextFromContent(content)
}

async function proxyImageCompletion(args: {
    apiKey: string
    baseUrl: string
    model: string
    prompt: string
    referenceImageUrl?: string
    additionalReferenceImageUrls?: string[]
}) {
    const content: any[] = [{ type: "text", text: args.prompt }]
    if (args.referenceImageUrl) {
        content.push({
            type: "image_url",
            image_url: { url: args.referenceImageUrl },
        })
    }
    for (const url of args.additionalReferenceImageUrls || []) {
        if (!url) continue
        content.push({
            type: "image_url",
            image_url: { url },
        })
    }

    const response = await fetch(`${args.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: args.model,
            messages: [{ role: "user", content: content.length > 1 ? content : args.prompt }],
            stream: false,
        }),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Upstream image request failed with status ${response.status}: ${text}`)
    }

    const result = await response.json()
    const messageContent = result?.choices?.[0]?.message?.content
    const url = extractImageUrlFromContent(messageContent)
    if (!url) {
        throw new Error("Upstream image request succeeded but returned no image URL")
    }
    return await convertRemoteImageToDataUrl(url)
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as PptAIRequestBody
        const aiConfig = body?.aiConfig || {}
        const apiKey = String(aiConfig.apiKey || "").trim()
        const baseUrl = String(aiConfig.baseUrl || "").trim().replace(/\/+$/, "")

        if (!apiKey || !baseUrl) {
            return Response.json(
                { error: "Missing AI API key or base URL for PPT proxy request." },
                { status: 400, headers: jsonHeaders },
            )
        }

        if (body.kind === "chat") {
            const model = String(body.model || aiConfig.chatModel || "").trim()
            const messages = Array.isArray(body.messages) ? body.messages : []
            if (!model || messages.length === 0) {
                return Response.json(
                    { error: "Missing chat model or messages." },
                    { status: 400, headers: jsonHeaders },
                )
            }

            const content = await proxyChatCompletion({
                apiKey,
                baseUrl,
                model,
                messages,
            })
            return Response.json({ content }, { headers: jsonHeaders })
        }

        if (body.kind === "image") {
            const model = String(body.model || aiConfig.imageModel || "").trim()
            const prompt = String(body.prompt || "").trim()
            if (!model || !prompt) {
                return Response.json(
                    { error: "Missing image model or prompt." },
                    { status: 400, headers: jsonHeaders },
                )
            }

            const url = await proxyImageCompletion({
                apiKey,
                baseUrl,
                model,
                prompt,
                referenceImageUrl:
                    typeof body.referenceImageUrl === "string" ? body.referenceImageUrl : undefined,
                additionalReferenceImageUrls: Array.isArray(body.additionalReferenceImageUrls)
                    ? body.additionalReferenceImageUrls.map((x) => String(x || "")).filter(Boolean)
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
