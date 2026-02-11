import {
    APICallError,
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    generateText,
    LoadAPIKeyError,
    stepCountIs,
    streamText,
} from "ai"
import { appendFile } from "fs/promises"
import path from "path"
import { z } from "zod"
import { extractText, getDocumentProxy } from "unpdf"
import mammoth from "mammoth"
import {
    getAIModel,
    supportsPromptCaching,
} from "../next/lib/ai-providers"
import {
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "../next/lib/langfuse"
import { getSystemPrompt } from "../next/lib/system-prompts"

export const maxDuration = 300

// File upload limits (must match client-side)
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_FILES = 5

const SUMMARY_CONCURRENCY = 50
const CHUNK_TOKEN_TARGET = 2500
const RECURSIVE_THRESHOLD_TOKENS = 50000

type UploadedFilePayload = {
    name: string
    mediaType?: string
    dataUrl: string
    extractedText?: string
}

function estimateTokens(text: string): number {
    return Math.ceil(String(text || "").length / 4)
}

function cleanExtractedText(input: string): string {
    const text = String(input || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    return text
        .split("\n")
        .filter((line) => {
            const l = line.trim()
            if (!l) return false
            if (/^arXiv:\d{4}\.\d{4,5}/i.test(l)) return false
            if (/^\[\d+\]\s*$/.test(l)) return false
            if (/^Page\s+\d+(\s+of\s+\d+)?$/i.test(l)) return false
            return true
        })
        .join("\n")
        .trim()
}

function splitByApproxTokens(text: string, chunkTokens: number): string[] {
    const chunkChars = Math.max(2000, chunkTokens * 4)
    const overlapChars = Math.floor(chunkChars * 0.1)
    const normalized = String(text || "").trim()
    if (!normalized) return []
    const chunks: string[] = []
    let start = 0
    while (start < normalized.length) {
        const end = Math.min(start + chunkChars, normalized.length)
        chunks.push(normalized.slice(start, end))
        if (end >= normalized.length) break
        start = Math.max(0, end - overlapChars)
    }
    return chunks
}

async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return []
    const results = new Array<R>(items.length)
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }).map(
        async () => {
            while (true) {
                const idx = cursor
                cursor += 1
                if (idx >= items.length) return
                results[idx] = await worker(items[idx], idx)
            }
        },
    )
    await Promise.all(runners)
    return results
}

function getFileExtension(name: string): string {
    const n = String(name || "")
    const i = n.lastIndexOf(".")
    return i >= 0 ? n.slice(i).toLowerCase() : ""
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
    const raw = String(dataUrl || "")
    const m = raw.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) throw new Error("Invalid data URL")
    return { mediaType: m[1], base64: m[2] }
}

async function extractUploadedFileText(file: UploadedFilePayload): Promise<string> {
    const providedText =
        typeof file.extractedText === "string"
            ? cleanExtractedText(file.extractedText)
            : ""

    const { mediaType, base64 } = parseDataUrl(file.dataUrl)
    const buffer = Buffer.from(base64, "base64")
    const ext = getFileExtension(file.name)
    const mt = String(file.mediaType || mediaType || "").toLowerCase()

    if (mt.includes("pdf") || ext === ".pdf") {
        // If client already extracted enough text, trust it.
        if (providedText.length >= 200) return providedText

        const pdf = await getDocumentProxy(new Uint8Array(buffer))
        const { text } = await extractText(pdf, { mergePages: true })
        const parsed = cleanExtractedText(String(text || ""))
        return parsed.length >= providedText.length ? parsed : providedText
    }

    if (mt.includes("wordprocessingml.document") || ext === ".docx") {
        if (providedText) return providedText
        const result = await mammoth.extractRawText({ buffer })
        return cleanExtractedText(String(result.value || ""))
    }

    if (
        mt.startsWith("text/") ||
        [".txt", ".md", ".markdown", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml", ".py", ".js", ".ts"].includes(ext)
    ) {
        if (providedText) return providedText
        return cleanExtractedText(buffer.toString("utf8"))
    }

    return providedText || cleanExtractedText(buffer.toString("utf8"))
}

async function summarizeChunk(
    model: any,
    providerOptions: any,
    headers: any,
    chunk: string,
): Promise<string> {
    return generateSummaryWithRetry({
        model,
        providerOptions,
        headers,
        system:
            "You are a strict summarizer. Output only direct summary text, no questions, no instructions.",
        user: `任务：仅根据下述文本输出摘要（<=300字）。禁止提问、禁止让用户补充内容、禁止输出模板化客套。\n\n文本：\n${chunk}`,
        maxOutputTokens: 600,
        maxChars: 300,
        fallbackSource: chunk,
    })
}

function extractiveFallbackSummary(source: string, maxChars: number): string {
    const cleaned = cleanExtractedText(String(source || ""))
        .replace(/\s+/g, " ")
        .trim()
    if (!cleaned) return ""
    const sentences = cleaned
        .split(/(?<=[。！？.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    const out: string[] = []
    let total = 0
    for (const s of sentences) {
        if (s.length < 10) continue
        if (total + s.length > maxChars) break
        out.push(s)
        total += s.length + 1
        if (out.length >= 6) break
    }
    if (out.length > 0) return out.join(" ")
    return cleaned.slice(0, maxChars)
}

function sanitizeSummaryText(summary: string, fallbackSource: string, maxChars: number): string {
    const text = String(summary || "").trim()
    if (!text) return extractiveFallbackSummary(fallbackSource, maxChars)
    const bannedPatterns = [
        /请提供/i,
        /请粘贴/i,
        /需要合并/i,
        /如有偏好/i,
        /目标读者/i,
        /是否保留术语/i,
        /是否需要强调/i,
        /I can|please provide|paste|preference/i,
    ]
    if (bannedPatterns.some((p) => p.test(text))) {
        return extractiveFallbackSummary(fallbackSource, maxChars)
    }
    return text.slice(0, Math.max(120, maxChars))
}

function isBadSummaryText(text: string): boolean {
    const t = String(text || "").trim()
    if (!t) return true
    return [
        /请提供/i,
        /请粘贴/i,
        /需要合并/i,
        /如有偏好/i,
        /是否保留术语/i,
        /please provide|paste/i,
    ].some((p) => p.test(t))
}

async function generateSummaryWithRetry(args: {
    model: any
    providerOptions: any
    headers: any
    system: string
    user: string
    maxOutputTokens: number
    maxChars: number
    fallbackSource: string
}): Promise<string> {
    for (let i = 0; i < 2; i++) {
        const r = await generateText({
            model: args.model,
            messages: [
                { role: "system" as const, content: args.system },
                { role: "user" as const, content: args.user },
            ],
            ...(args.providerOptions && { providerOptions: args.providerOptions }),
            ...(args.headers && { headers: args.headers }),
            maxOutputTokens: args.maxOutputTokens,
        })
        const text = sanitizeSummaryText(
            String(r.text || "").trim(),
            args.fallbackSource,
            args.maxChars,
        )
        if (!isBadSummaryText(text)) return text
    }
    return extractiveFallbackSummary(args.fallbackSource, args.maxChars)
}

async function summarizeBlockMethod(args: {
    model: any
    providerOptions: any
    headers: any
    text: string
}): Promise<string> {
    const chunks = splitByApproxTokens(args.text, CHUNK_TOKEN_TARGET)
    const partial = await runWithConcurrency(
        chunks,
        SUMMARY_CONCURRENCY,
        (chunk) => summarizeChunk(args.model, args.providerOptions, args.headers, chunk),
    )
    const merged = partial.filter(Boolean).join("\n")
    return generateSummaryWithRetry({
        model: args.model,
        providerOptions: args.providerOptions,
        headers: args.headers,
        system:
            "You produce concise, faithful merged summaries. Output only summary text.",
        user: `任务：将以下分块摘要合并为完整摘要（<=1000字）。禁止提问、禁止请求补充材料，仅输出摘要正文。\n\n${merged}`,
        maxOutputTokens: 1800,
        maxChars: 1000,
        fallbackSource: merged,
    })
}

async function summarizeRecursiveMethod(args: {
    model: any
    providerOptions: any
    headers: any
    text: string
}): Promise<string> {
    const baseChunks = splitByApproxTokens(args.text, 3000)
    let level = await runWithConcurrency(
        baseChunks,
        SUMMARY_CONCURRENCY,
        (chunk) => summarizeChunk(args.model, args.providerOptions, args.headers, chunk),
    )
    level = level.filter(Boolean)

    while (level.length > 2) {
        const groups: string[] = []
        for (let i = 0; i < level.length; i += 5) {
            groups.push(level.slice(i, i + 5).join("\n"))
        }
        level = await runWithConcurrency(
            groups,
            SUMMARY_CONCURRENCY,
            async (group) =>
                generateSummaryWithRetry({
                    model: args.model,
                    providerOptions: args.providerOptions,
                    headers: args.headers,
                    system:
                        "You merge summaries into a higher-level summary. Output only summary text.",
                    user: `任务：把这组摘要提炼成更高层摘要（<=350字）。禁止提问、禁止让用户补充，只输出摘要。\n\n${group}`,
                    maxOutputTokens: 800,
                    maxChars: 350,
                    fallbackSource: group,
                }),
        )
        level = level.filter(Boolean)
    }

    return generateSummaryWithRetry({
        model: args.model,
        providerOptions: args.providerOptions,
        headers: args.headers,
        system:
            "You produce final executive summaries with hierarchical fidelity and no hallucination. Output only summary text.",
        user: `任务：输出最终摘要（<=1000字）。禁止提问、禁止请求更多信息，仅输出摘要正文。\n\n${level.join("\n")}`,
        maxOutputTokens: 1800,
        maxChars: 1000,
        fallbackSource: level.join("\n"),
    })
}

function validateUploadedFiles(uploadedFiles: UploadedFilePayload[]): {
    valid: boolean
    error?: string
} {
    if (uploadedFiles.length > MAX_FILES) {
        return {
            valid: false,
            error: `Too many files. Maximum ${MAX_FILES} allowed.`,
        }
    }
    for (const f of uploadedFiles) {
        try {
            const { base64 } = parseDataUrl(f.dataUrl)
            const sizeInBytes = Math.ceil((base64.length * 3) / 4)
            if (sizeInBytes > MAX_FILE_SIZE) {
                return {
                    valid: false,
                    error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                }
            }
        } catch {
            return {
                valid: false,
                error: `Invalid uploaded file payload: ${f.name || "unknown"}`,
            }
        }
    }
    return { valid: true }
}

// Helper function to validate file parts in messages
function validateFileParts(messages: any[]): {
    valid: boolean
    error?: string
} {
    const lastMessage = messages[messages.length - 1]
    const fileParts =
        lastMessage?.parts?.filter((p: any) => p.type === "file") || []

    if (fileParts.length > MAX_FILES) {
        return {
            valid: false,
            error: `Too many files. Maximum ${MAX_FILES} allowed.`,
        }
    }

    for (const filePart of fileParts) {
        // Data URLs format: data:image/png;base64,<data>
        // Base64 increases size by ~33%, so we check the decoded size
        if (filePart.url?.startsWith("data:")) {
            const base64Data = filePart.url.split(",")[1]
            if (base64Data) {
                const sizeInBytes = Math.ceil((base64Data.length * 3) / 4)
                if (sizeInBytes > MAX_FILE_SIZE) {
                    return {
                        valid: false,
                        error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                    }
                }
            }
        }
    }

    return { valid: true }
}

// Helper function to check if diagram is minimal/empty
function isMinimalDiagram(xml: string): boolean {
    const stripped = xml.replace(/\s/g, "")
    return !stripped.includes('id="2"')
}

// Helper function to replace historical tool call XML with placeholders
// This reduces token usage and forces LLM to rely on the current diagram XML (source of truth)
function replaceHistoricalToolInputs(messages: any[]): any[] {
    return messages.map((msg) => {
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
            return msg
        }
        const replacedContent = msg.content.map((part: any) => {
            if (part.type === "tool-call") {
                const toolName = part.toolName
                if (
                    toolName === "display_diagram" ||
                    toolName === "edit_diagram"
                ) {
                    return {
                        ...part,
                        input: {
                            placeholder:
                                "[XML content replaced - see current diagram XML in system context]",
                        },
                    }
                }
            }
            return part
        })
        return { ...msg, content: replacedContent }
    })
}

// Helper function to fix tool call inputs for Bedrock API
// Bedrock requires toolUse.input to be a JSON object, not a string
function fixToolCallInputs(messages: any[]): any[] {
    return messages.map((msg) => {
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
            return msg
        }
        const fixedContent = msg.content.map((part: any) => {
            if (part.type === "tool-call") {
                if (typeof part.input === "string") {
                    try {
                        const parsed = JSON.parse(part.input)
                        return { ...part, input: parsed }
                    } catch {
                        // If parsing fails, wrap the string in an object
                        return { ...part, input: { rawInput: part.input } }
                    }
                }
                // Input is already an object, but verify it's not null/undefined
                if (part.input === null || part.input === undefined) {
                    return { ...part, input: {} }
                }
            }
            return part
        })
        return { ...msg, content: fixedContent }
    })
}

// Inner handler function
async function handleChatRequest(req: Request): Promise<Response> {
    console.log('[EARLY DEBUG] handleChatRequest executed')
    // Check for access code
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length > 0) {
        const accessCodeHeader = req.headers.get("x-access-code")
        if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
            return Response.json(
                {
                    error: "Invalid or missing access code. Please configure it in Settings.",
                },
                { status: 401 },
            )
        }
    }

    const payload = await req.json()
    const { messages, xml, previousXml, sessionId } = payload || {}
    const uploadedFiles: UploadedFilePayload[] = Array.isArray(payload?.uploadedFiles)
        ? payload.uploadedFiles
        : []
    const bodyAIConfig = payload?.aiConfig || {}

    // Debug: log the actual message structure received
    console.log("[DEBUG] Received messages:", JSON.stringify(messages, null, 2))
    console.log("[DEBUG] First message structure:", messages?.[0] ? JSON.stringify(messages[0], null, 2) : "No messages")

    // Validate messages array
    if (!messages || !Array.isArray(messages)) {
        return Response.json(
            { error: "Messages must be an array" },
            { status: 400 }
        )
    }

    // Get user IP for Langfuse tracking
    const forwardedFor = req.headers.get("x-forwarded-for")
    const userId = forwardedFor?.split(",")[0]?.trim() || "anonymous"

    // Validate sessionId for Langfuse (must be string, max 200 chars)
    const validSessionId =
        sessionId && typeof sessionId === "string" && sessionId.length <= 200
            ? sessionId
            : undefined

    // Extract user input text for Langfuse trace
    const currentMessage = messages[messages.length - 1]
    const userInputText =
        currentMessage?.parts?.find((p: any) => p.type === "text")?.text || ""

    // Update Langfuse trace with input, session, and user
    setTraceInput({
        input: userInputText,
        sessionId: validSessionId,
        userId: userId,
    })

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    const uploadedValidation = validateUploadedFiles(uploadedFiles)
    if (!uploadedValidation.valid) {
        return Response.json({ error: uploadedValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // Read client AI provider overrides from headers first, then body fallback.
    const clientOverrides = {
        provider:
            req.headers.get("x-ai-provider") ||
            (typeof bodyAIConfig.provider === "string"
                ? bodyAIConfig.provider
                : null),
        baseUrl:
            req.headers.get("x-ai-base-url") ||
            (typeof bodyAIConfig.baseUrl === "string"
                ? bodyAIConfig.baseUrl
                : null),
        apiKey:
            req.headers.get("x-ai-api-key") ||
            (typeof bodyAIConfig.apiKey === "string"
                ? bodyAIConfig.apiKey
                : null),
        modelId:
            req.headers.get("x-ai-model") ||
            req.headers.get("x-ai-chat-model") ||
            (typeof bodyAIConfig.chatModel === "string"
                ? bodyAIConfig.chatModel
                : typeof bodyAIConfig.modelId === "string"
                  ? bodyAIConfig.modelId
                  : null),
    }

    // Get AI model with optional client overrides
    const { model, providerOptions, headers, modelId } =
        getAIModel(clientOverrides)

    // Check if model supports prompt caching
    const shouldCache = supportsPromptCaching(modelId)
    console.log(
        `[Prompt Caching] ${shouldCache ? "ENABLED" : "DISABLED"} for model: ${modelId}`,
    )

    let parsedFilesContext = ""
    if (uploadedFiles.length > 0) {
        const fileSummaries = await runWithConcurrency(
            uploadedFiles,
            SUMMARY_CONCURRENCY,
            async (file) => {
                const extracted = await extractUploadedFileText(file)
                const tokens = estimateTokens(extracted)
                const method =
                    tokens >= RECURSIVE_THRESHOLD_TOKENS ? "recursive" : "chunk"
                const summary =
                    method === "recursive"
                        ? await summarizeRecursiveMethod({
                              model,
                              providerOptions,
                              headers,
                              text: extracted,
                          })
                        : await summarizeBlockMethod({
                              model,
                              providerOptions,
                              headers,
                              text: extracted,
                          })
                return { name: file.name, tokens, method, summary }
            },
        )

        parsedFilesContext = fileSummaries
            .map(
                (item, idx) =>
                    `[Parsed File ${idx + 1}: ${item.name}]\nmethod=${item.method}; estimated_tokens=${item.tokens}\n${item.summary}`,
            )
            .join("\n\n")
    }

    // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
    let systemMessage = getSystemPrompt(modelId)

    // Append global constraints if present
    const globalConstraintsHeader = req.headers.get("x-ai-constraints")
    const globalConstraintsBody =
        typeof payload?.aiConstraints === "string"
            ? payload.aiConstraints
            : ""
    const globalConstraintsRaw =
        globalConstraintsHeader || globalConstraintsBody
    if (globalConstraintsRaw) {
        const globalConstraints = globalConstraintsHeader
            ? decodeURIComponent(globalConstraintsRaw)
            : globalConstraintsRaw
        systemMessage += `\n\n=== GLOBAL CONSTRAINTS ===\nThe user has set the following global constraints which MUST be followed for every response:\n${globalConstraints}\n==========================\n`
    }

    const lastMessage = messages[messages.length - 1]

    // Handle case where messages array is empty
    if (!lastMessage) {
        return Response.json(
            { error: "No messages provided" },
            { status: 400 }
        )
    }

    // Extract text from the last message parts or content
    let lastMessageText = ""
    if (lastMessage.content && typeof lastMessage.content === "string") {
        lastMessageText = lastMessage.content
    } else if (Array.isArray(lastMessage.content)) {
        lastMessageText = lastMessage.content
            .filter((part: any) => part.type === "text" || typeof part === "string")
            .map((part: any) => (typeof part === "string" ? part : part.text || ""))
            .join("")
    } else {
        lastMessageText =
            lastMessage.parts?.find((part: any) => part.type === "text")?.text || ""
    }

    // Extract file parts (images) from the last message
    // Note: If using standard 'content' array with images, they might need different handling
    // but for now we primarily support our custom 'parts' format for files
    const partsFileParts =
        lastMessage.parts?.filter((part: any) => part.type === "file") || []
    const contentImageParts = Array.isArray(lastMessage.content)
        ? lastMessage.content.filter(
              (part: any) =>
                  part?.type === "image_url" ||
                  part?.type === "image" ||
                  part?.type === "file",
          )
        : []
    const fileParts = [...partsFileParts, ...contentImageParts]

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${lastMessageText}
"""
${parsedFilesContext ? `\n\nParsed file summaries:\n"""md\n${parsedFilesContext}\n"""` : ""}`

    // Validate messages structure before conversion
    if (!messages || !Array.isArray(messages)) {
        return Response.json(
            { error: "Invalid messages format: expected array" },
            { status: 400 }
        )
    }

    // Validate each message has required structure
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        console.log(`[DEBUG] Validating message ${i}:`, JSON.stringify(message, null, 2))
        
        if (!message || typeof message !== 'object') {
            return Response.json(
                { error: `Invalid message format: expected object at index ${i}` },
                { status: 400 }
            )
        }
        if (!message.role || typeof message.role !== 'string') {
            return Response.json(
                { error: `Invalid message format: missing role at index ${i}` },
                { status: 400 }
            )
        }
        // Vercel AI SDK can send messages with different content formats
        // - messages with parts array (our custom format)
        // - messages with content array (standard format)
        // - messages with content string (standard format)
        if (!message.parts && !message.content) {
            return Response.json(
                { error: `Invalid message format: missing content or parts at index ${i}, message: ${JSON.stringify(message)}` },
                { status: 400 }
            )
        }
        if (message.parts && !Array.isArray(message.parts)) {
            return Response.json(
                { error: `Invalid message format: parts must be array at index ${i}` },
                { status: 400 }
            )
        }
        if (message.content && typeof message.content !== 'string' && !Array.isArray(message.content)) {
            return Response.json(
                { error: `Invalid message format: content must be string or array at index ${i}` },
                { status: 400 }
            )
        }
    }

    // Normalize messages to expected format (convert content to parts if needed)
    const normalizedMessages = messages.map((message: any, index: number) => {
        // Handle completely malformed messages
        if (!message) {
            console.log(`[DEBUG] Message ${index} is null/undefined, creating default structure`)
            return { role: 'user', parts: [{ type: 'text', text: '' }] }
        }
        
        // If message already has parts, keep it as is
        if (message.parts && Array.isArray(message.parts)) {
            return message
        }
        
        // If message has content, convert to parts format
        if (message.content) {
            let parts: any[] = []
            
            if (typeof message.content === 'string') {
                // Convert string content to text part
                parts = [{ type: 'text', text: message.content }]
            } else if (Array.isArray(message.content)) {
                // Convert content array to parts array
                parts = message.content.map((item: any) => {
                    if (typeof item === 'string') {
                        return { type: 'text', text: item }
                    } else if (item.type === 'text') {
                        return { type: 'text', text: item.text || '' }
                    } else if (item.type === 'image') {
                        return { type: 'image', image: item.image || item.url, mimeType: item.mimeType }
                    } else if (item.type === "image_url") {
                        return {
                            type: "image",
                            image: item.image_url?.url || item.url || "",
                            mimeType: item.mimeType,
                        }
                    } else if (item.type === "file") {
                        return {
                            type: "image",
                            image: item.url || item.image || "",
                            mimeType: item.mediaType || item.mimeType,
                        }
                    }
                    return { type: 'text', text: String(item) }
                })
            }
            
            return { ...message, parts, content: undefined }
        }
        
        // Handle messages with no content and no parts but have role
        if (message.role) {
            console.log(`[DEBUG] Message ${index} has role but no content/parts, adding empty parts`)
            return { ...message, parts: [] }
        }
        
        // Fallback: create default message structure
        console.log(`[DEBUG] Message ${index} is malformed, creating default structure:`, JSON.stringify(message))
        return { role: 'user', parts: [{ type: 'text', text: '' }] }
    })

    // Convert UIMessages to ModelMessages and add system message
    console.log('[DEBUG] Before convertToModelMessages - normalizedMessages:', JSON.stringify(normalizedMessages, null, 2))
    const modelMessages = convertToModelMessages(normalizedMessages)
    console.log('[DEBUG] After convertToModelMessages - modelMessages:', JSON.stringify(modelMessages, null, 2))

    // Fix tool call inputs for Bedrock API (requires JSON objects, not strings)
    console.log('[DEBUG] Before fixToolCallInputs - modelMessages:', JSON.stringify(modelMessages, null, 2))
    const fixedMessages = fixToolCallInputs(modelMessages)
    console.log('[DEBUG] After fixToolCallInputs - fixedMessages:', JSON.stringify(fixedMessages, null, 2))

    // Replace historical tool call XML with placeholders to reduce tokens
    // Disabled by default - some models (e.g. minimax) copy placeholders instead of generating XML
    const enableHistoryReplace =
        process.env.ENABLE_HISTORY_XML_REPLACE === "true"
    const placeholderMessages = enableHistoryReplace
        ? replaceHistoricalToolInputs(fixedMessages)
        : fixedMessages

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    console.log('[DEBUG] Before filtering - placeholderMessages:', JSON.stringify(placeholderMessages, null, 2))
    let enhancedMessages = placeholderMessages.filter(
        (msg: any) => {
            // Check for both content and parts arrays since messages can have either format
            const hasValidContent = (msg.content && Array.isArray(msg.content) && msg.content.length > 0) ||
                                   (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0)
            
            if (!hasValidContent) {
                console.log(`[DEBUG] Message filtered (empty content/parts): role=${msg.role}`)
                return false
            }

            // Additional check for empty text-only messages from user
            // This prevents wrapping empty user input in the "User input: ..." block
            if (msg.role === 'user') {
                let parts: any[] = []
                if (msg.parts) {
                    parts = msg.parts
                } else if (Array.isArray(msg.content)) {
                    parts = msg.content
                } else if (typeof msg.content === 'string') {
                    // If content is a non-empty string, it's valid
                    if (msg.content.trim() !== '') {
                        return true
                    }
                    // If empty string, fall through to check logic (parts=[])
                }

                // Check if there is any non-empty text part
                const hasNonEmptyText = parts.some((p: any) => p.type === 'text' && p.text && p.text.trim() !== '')
                // Check if there are any non-text parts (like images, files)
                const hasOtherParts = parts.some((p: any) => p.type !== 'text')
                
                // If it has only text parts and all are empty, filter it out
                if (!hasNonEmptyText && !hasOtherParts) {
                    console.log(`[DEBUG] Message filtered (empty user text): role=${msg.role}`)
                    return false
                }
            }

            return true
        }
    )
    console.log('[DEBUG] After filtering - enhancedMessages:', JSON.stringify(enhancedMessages, null, 2))

    // Update the last message with user input only (XML moved to separate cached system message)
    if (enhancedMessages.length >= 1) {
        const lastModelMessage = enhancedMessages[enhancedMessages.length - 1]
        if (lastModelMessage.role === "user") {
            // Check if this user message is effectively empty (no text content and no files)
            // This acts as a final safety net if the filter above missed it
            const isTextEmpty = !lastMessageText || lastMessageText.trim() === ''
            const hasFiles = fileParts.length > 0
            
            if (isTextEmpty && !hasFiles) {
                 console.log('[DEBUG] Dropping empty user message from final payload (safety net)')
                 enhancedMessages = enhancedMessages.slice(0, -1)
            } else {
                // Build content array with user input text and file parts
                const contentParts: any[] = [
                    { type: "text", text: formattedUserInput },
                ]

                // Add image parts back
                for (const filePart of fileParts) {
                    const imageUrl =
                        filePart?.url ||
                        filePart?.image ||
                        filePart?.image_url?.url
                    if (!imageUrl) continue
                    contentParts.push({
                        type: "image",
                        image: imageUrl,
                        mimeType: filePart.mediaType || filePart.mimeType,
                    })
                }

                enhancedMessages = [
                    ...enhancedMessages.slice(0, -1),
                    { ...lastModelMessage, content: contentParts },
                ]
            }
        }
    }

    // Add cache point to the last assistant message in conversation history
    // This caches the entire conversation prefix for subsequent requests
    // Strategy: system (cached) + history with last assistant (cached) + new user message
    if (shouldCache && enhancedMessages.length >= 2) {
        // Find the last assistant message (should be second-to-last, before current user message)
        for (let i = enhancedMessages.length - 2; i >= 0; i--) {
            if (enhancedMessages[i].role === "assistant") {
                enhancedMessages[i] = {
                    ...enhancedMessages[i],
                    providerOptions: {
                        bedrock: { cachePoint: { type: "default" } },
                    },
                }
                break // Only cache the last assistant message
            }
        }
    }

    // System messages with multiple cache breakpoints for optimal caching:
    // - Breakpoint 1: Static instructions (~1500 tokens) - rarely changes
    // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
    // This allows: if only user message changes, both system caches are reused
    //              if XML changes, instruction cache is still reused
    const systemMessages = [
        {
            role: "system" as const,
            content: systemMessage,
            ...(shouldCache && {
                providerOptions: {
                    bedrock: { cachePoint: { type: "default" } },
                },
            }),
        },
        {
            role: "system" as const,
            content: `${previousXml ? `Previous diagram XML (before user's last message):\n"""xml\n${previousXml}\n"""\n\n` : ""}Current diagram XML (AUTHORITATIVE - the source of truth):\n"""xml\n${xml || ""}\n"""\n\nIMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed. When using edit_diagram, COPY search patterns exactly from the CURRENT XML - attribute order matters!`,
            ...(shouldCache && {
                providerOptions: {
                    bedrock: { cachePoint: { type: "default" } },
                },
            }),
        },
    ]

    const allMessages = [...systemMessages, ...enhancedMessages]

    const promptPayload = {
        timestamp: new Date().toISOString(),
        modelId,
        sessionId: validSessionId,
        userId,
        messages: allMessages,
    }

    const promptLog = JSON.stringify(promptPayload, null, 2)

    console.log("[PROMPT]", promptLog)

    try {
        const logDir = process.env.PROMPT_LOG_DIR || process.cwd()
        const logPath = path.join(logDir, "llm-prompts.log")
        await appendFile(logPath, `${promptLog}\n`)
    } catch (error) {
        console.error("[PROMPT] Failed to write prompt log:", error)
    }

    const stream = createUIMessageStream({
        execute: async ({ writer }) => {
            try {
                const maxTokensEnv = process.env.MAX_OUTPUT_TOKENS
                const parsedMaxTokens = maxTokensEnv
                    ? Number.parseInt(maxTokensEnv, 10)
                    : undefined
                const safeMaxTokens =
                    parsedMaxTokens && parsedMaxTokens > 0
                        ? parsedMaxTokens
                        : 8192

                const result = await streamText({
                        model,
                        stopWhen: stepCountIs(5),
                        messages: allMessages,
                        ...(safeMaxTokens && { maxTokens: safeMaxTokens }),
                        ...(providerOptions && { providerOptions }),
                    ...(headers && { headers }),
                    ...(getTelemetryConfig({ sessionId: validSessionId, userId }) && {
                        experimental_telemetry: getTelemetryConfig({
                            sessionId: validSessionId,
                            userId,
                        }),
                    }),
                    experimental_repairToolCall: async ({ toolCall }) => {
                        const rawJson =
                            typeof toolCall.input === "string"
                                ? toolCall.input
                                : null
                        if (rawJson) {
                            try {
                                const fixed = rawJson.replace(
                                    /([a-zA-Z])="(\d+)"/g,
                                    '$1=\\"$2\\"',
                                )
                                const parsed = JSON.parse(fixed)
                                return {
                                    type: "tool-call" as const,
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    input: JSON.stringify(parsed),
                                }
                            } catch {
                                // Ignore repair failure and fall through
                            }
                        }
                        return null
                    },
                    onFinish: ({ text, usage }) => {
                        setTraceOutput(text, {
                            promptTokens: usage?.inputTokens,
                            completionTokens: usage?.outputTokens,
                        })
                    },
                    tools: {
                        display_diagram: {
                            description: `Display a diagram on draw.io. Pass the XML content inside <root> tags.

VALIDATION RULES (XML will be rejected if violated):
1. All mxCell elements must be DIRECT children of <root> - never nested
2. Every mxCell needs a unique id
3. Every mxCell (except id="0") needs a valid parent attribute
4. Edge source/target must reference existing cell IDs
5. Escape special chars in values: &lt; &gt; &amp; &quot;
6. Always start with: <mxCell id="0"/><mxCell id="1" parent="0"/>

Example with swimlanes and edges (note: all mxCells are siblings):
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="step1" target="step2">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
</root>

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
`,
                            inputSchema: z.object({
                                xml: z
                                    .string()
                                    .describe(
                                        "XML string to be displayed on draw.io",
                                    ),
                            }),
                        },
                        edit_diagram: {
                            description: `Edit specific parts of the current diagram by replacing exact line matches. Use this tool to make targeted fixes without regenerating the entire XML.
CRITICAL: Copy-paste the EXACT search pattern from the "Current diagram XML" in system context. Do NOT reorder attributes or reformat - the attribute order in draw.io XML varies and you MUST match it exactly.
IMPORTANT: Keep edits concise:
- COPY the exact mxCell line from the current XML (attribute order matters!)
- Only include the lines that are changing, plus 1-2 surrounding lines for context if needed
- Break large changes into multiple smaller edits
- Each search must contain complete lines (never truncate mid-line)
- First match only - be specific enough to target the right element

鈿狅笍 JSON ESCAPING: Every " inside string values MUST be escaped as \\". Example: x=\\"100\\" y=\\"200\\" - BOTH quotes need backslashes!`,
                            inputSchema: z.object({
                                edits: z
                                    .array(
                                        z.object({
                                            search: z
                                                .string()
                                                .describe(
                                                    "EXACT lines copied from current XML (preserve attribute order!)",
                                                ),
                                            replace: z
                                                .string()
                                                .describe("Replacement lines"),
                                        }),
                                    )
                                    .describe(
                                        "Array of search/replace pairs to apply sequentially",
                                    ),
                            }),
                        },
                    },
                    ...(process.env.TEMPERATURE !== undefined && {
                        temperature: parseFloat(process.env.TEMPERATURE),
                    }),
                })

                const uiStream = result.toUIMessageStream()

                for await (const message of uiStream as any) {
                    const hasToolName =
                        (message as any)?.toolName ||
                        (Array.isArray((message as any)?.parts) &&
                            (message as any).parts.some(
                                (part: any) =>
                                    part.toolName ||
                                    (part.type &&
                                        String(part.type).includes("tool")),
                            ))

                    if (hasToolName) {
                        console.log(
                            "[TOOL EVENT]",
                            JSON.stringify(message, null, 2),
                        )
                    }

                    writer.write(message)
                }
            } catch (error) {
                console.error("[CRITICAL] streamText failed:", error)
                writer.write({
                    type: "error",
                    errorText:
                        error instanceof Error
                            ? error.message
                            : String(error),
                })
            }
        },
    })

    return createUIMessageStreamResponse({ stream })

}

// Helper to categorize errors and return appropriate response
function handleError(error: unknown): Response {
    console.error("Error in chat route:", error)

    const isDev = process.env.NODE_ENV === "development"

    // Check for specific AI SDK error types
    if (APICallError.isInstance(error)) {
        return Response.json(
            {
                error: error.message,
                ...(isDev && {
                    details: error.responseBody,
                    stack: error.stack,
                }),
            },
            { status: error.statusCode || 500 },
        )
    }

    if (LoadAPIKeyError.isInstance(error)) {
        return Response.json(
            {
                error: "Authentication failed. Please check your API key.",
                ...(isDev && {
                    stack: error.stack,
                }),
            },
            { status: 401 },
        )
    }

    // Fallback for other errors with safety filter
    const message =
        error instanceof Error ? error.message : "An unexpected error occurred"
    const status = (error as any)?.statusCode || (error as any)?.status || 500

    // Configuration errors should be explicit so users can fix settings quickly.
    if (
        message.includes("AI_MODEL environment variable is required") ||
        message.includes("API Key is missing")
    ) {
        return Response.json(
            {
                error: "AI configuration is missing. Please fill API Key and Chat Model in top settings.",
                ...(isDev && {
                    details: message,
                    stack: error instanceof Error ? error.stack : undefined,
                }),
            },
            { status: 400 },
        )
    }

    // Prevent leaking API keys, tokens, or other sensitive data
    const lowerMessage = message.toLowerCase()
    const safeMessage =
        lowerMessage.includes("key") ||
        lowerMessage.includes("token") ||
        lowerMessage.includes("sig") ||
        lowerMessage.includes("signature") ||
        lowerMessage.includes("secret") ||
        lowerMessage.includes("password") ||
        lowerMessage.includes("credential")
            ? "Authentication failed. Please check your credentials."
            : message

    return Response.json(
        {
            error: safeMessage,
            ...(isDev && {
                details: message,
                stack: error instanceof Error ? error.stack : undefined,
            }),
        },
        { status },
    )
}

// Wrap handler with error handling
async function safeHandler(req: Request): Promise<Response> {
    try {
        return await handleChatRequest(req)
    } catch (error) {
        return handleError(error)
    }
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}







