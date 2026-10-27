import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { generateImage } from "../ai/image"
import { promptsDir } from "./resources"
import type { AIChannel } from "../../contracts/ai"
import { parseDataUrl } from "./files"

/**
 * "Deep thinking" for Diagram: before writing XML, have an image model draw the
 * diagram, then hand that picture to the text model as a layout reference.
 *
 * The draft is saved to disk when a debug directory is configured, because
 * the only way to tell a bad layout from a bad XML translation is to look at
 * what the image model actually produced.
 */

export type ImageAttachment = {
    url: string
    mediaType: string
}

export function cleanImageReferenceUrl(url: string): string | null {
    const value = String(url || "").trim()
    if (!value) return null
    if (value.startsWith("http://") || value.startsWith("https://")) return value
    if (value.startsWith("data:image/")) return value
    return null
}

export function extractImageUrlFromModelContent(messageContent: any): string | null {
    if (Array.isArray(messageContent)) {
        const imagePart = messageContent.find(
            (part: any) => part?.type === "image_url" && part?.image_url?.url,
        )
        if (imagePart?.image_url?.url) {
            return cleanImageReferenceUrl(imagePart.image_url.url)
        }

        const textPart = messageContent.find((part: any) => part?.type === "text")
        const text = String(textPart?.text || "").trim()
        if (!text) return null

        const markdownMatch = text.match(/!\[.*?\]\((.*?)\)/)
        if (markdownMatch?.[1]) {
            return cleanImageReferenceUrl(markdownMatch[1])
        }
        return cleanImageReferenceUrl(text)
    }

    if (typeof messageContent === "string") {
        const text = messageContent.trim()
        const markdownMatch = text.match(/!\[.*?\]\((.*?)\)/)
        if (markdownMatch?.[1]) {
            return cleanImageReferenceUrl(markdownMatch[1])
        }
        return cleanImageReferenceUrl(text)
    }

    return null
}

/** The prompt file rarely changes; read it once per process. */
let diagramDeepThinkingImagePromptTemplateCache: string | null = null

export async function getDiagramDeepThinkingImagePromptTemplate(): Promise<string> {
    if (diagramDeepThinkingImagePromptTemplateCache) {
        return diagramDeepThinkingImagePromptTemplateCache
    }

    const promptPath = path.join(promptsDir(), "diagram", "deep-thinking-image.md")
    const raw = await readFile(promptPath, "utf8")
    diagramDeepThinkingImagePromptTemplateCache = String(raw || "").trim()
    return diagramDeepThinkingImagePromptTemplateCache
}

export function buildDiagramDeepThinkingImagePrompt(params: {
    userText: string
    globalConstraints: string
    processedFilesContext: string
    template: string
}): string {
    const safeUserText = String(params.userText || "").trim() || "(empty)"
    const safeGlobalConstraints =
        String(params.globalConstraints || "").trim() || "(none)"
    const safeProcessedFiles =
        String(params.processedFilesContext || "").trim() || "(none)"

    return params.template
        .replace("{{USER_REQUEST}}", safeUserText)
        .replace("{{GLOBAL_CONSTRAINTS}}", safeGlobalConstraints)
        .replace("{{PROCESSED_FILE_CONTENT}}", safeProcessedFiles)
}

export function getImageExtensionFromMediaType(mediaType: string): string {
    const normalized = String(mediaType || "").toLowerCase()
    if (normalized.includes("png")) return "png"
    if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg"
    if (normalized.includes("webp")) return "webp"
    if (normalized.includes("gif")) return "gif"
    if (normalized.includes("svg")) return "svg"
    return "png"
}

export async function saveDeepThinkingImageDebugArtifact(args: {
    dataUrl: string
    sessionId?: string
    userText: string
}): Promise<string | null> {
    const raw = String(args.dataUrl || "")
    if (!raw.startsWith("data:image/")) return null

    const { mediaType, base64 } = parseDataUrl(raw)
    const ext = getImageExtensionFromMediaType(mediaType)
    const safeSession =
        String(args.sessionId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_") ||
        "anonymous"
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const outDir = path.join(process.cwd(), ".tmp-diagram-deep-thinking")
    const imagePath = path.join(outDir, `${stamp}-${safeSession}.${ext}`)
    const metaPath = path.join(outDir, `${stamp}-${safeSession}.txt`)

    await mkdir(outDir, { recursive: true })
    await writeFile(imagePath, Buffer.from(base64, "base64"))
    await writeFile(
        metaPath,
        [
            `saved_at=${new Date().toISOString()}`,
            `session_id=${args.sessionId || ""}`,
            `media_type=${mediaType}`,
            "",
            "user_request:",
            String(args.userText || "").trim(),
        ].join("\n"),
        "utf8",
    )
    return imagePath
}

export async function generateDeepThinkingDiagramImage(args: {
    userText: string
    globalConstraints: string
    processedFilesContext: string
    imageAttachments: ImageAttachment[]
    channel: AIChannel
}): Promise<string | null> {
    let promptText = ""
    try {
        const template = await getDiagramDeepThinkingImagePromptTemplate()
        promptText = buildDiagramDeepThinkingImagePrompt({
            userText: args.userText,
            globalConstraints: args.globalConstraints,
            processedFilesContext: args.processedFilesContext,
            template,
        })
    } catch (error) {
        console.warn(
            "[DeepThinking] Failed to load prompt file, using fallback prompt:",
            error,
        )
        promptText = [
            "R - Role",
            "You are a final-quality flowchart image generation agent.",
            "I - Instructions",
            "Generate one polished, production-ready, directly usable final diagram image.",
            "Input",
            `User request:\n${String(args.userText || "").trim() || "(empty)"}`,
            `Global constraints:\n${String(args.globalConstraints || "").trim() || "(none)"}`,
            `Processed file content:\n${String(args.processedFilesContext || "").trim() || "(none)"}`,
            "S - Steps",
            "1. Understand the requested diagram and any constraints.",
            "2. Build a coherent, readable final composition.",
            "3. Generate one polished final diagram image.",
            "E - End Goal",
            "Produce one refined diagram image suitable for downstream XML generation.",
            "N - Narrowing",
            "Do not generate a sketch, wireframe, draft, poster, or UI mockup. Prioritize clear structure, readable labels, complete coverage, balanced spacing, and unambiguous connectors.",
        ].join("\n\n")
    }

    return await generateImage({
        channel: args.channel,
        prompt: promptText,
        referenceImageUrl: args.imageAttachments[0]?.url,
        additionalReferenceImageUrls: args.imageAttachments
            .slice(1)
            .map((item) => item.url)
            .filter(Boolean),
    })
}
