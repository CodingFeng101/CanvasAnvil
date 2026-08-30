import {
    APICallError,
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    LoadAPIKeyError,
    stepCountIs,
    streamText,
} from "ai"
import { appendFile, readFile } from "fs/promises"
import path from "path"
import { z } from "zod"
import { getImageChannel, getTextChannel, normalizeAIConfig } from "../../ai/config"
import { getChatModel } from "../../ai/server-model"
import { formatAvailableShapeLibraries } from "../chat/shape-library"
import { getSystemPrompt } from "../chat/system-prompt"
import {
    RECURSIVE_THRESHOLD_TOKENS,
    SUMMARY_CONCURRENCY,
    type UploadedFilePayload,
    estimateTokens,
    extractUploadedFileText,
    runWithConcurrency,
    validateFileParts,
    validateUploadedFiles,
} from "../chat/files"
import { summarizeBlockMethod, summarizeRecursiveMethod } from "../chat/summarize"
import { classifyFlowRequest, shouldRunDeepThinking } from "../chat/intent"
import { fixToolCallInputs, replaceHistoricalToolInputs } from "../chat/messages"
import {
    type ImageAttachment,
    cleanImageReferenceUrl,
    generateDeepThinkingDiagramImage,
    saveDeepThinkingImageDebugArtifact,
} from "../chat/deep-thinking"
import {
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "../telemetry/langfuse"

export const maxDuration = 300

/**
 * Streaming chat endpoint for the Flow workspace.
 *
 * The turn runs as a pipeline: validate the payload, resolve the model
 * channel from the request, summarise any uploads, optionally draft a
 * reference image, assemble the system prompt and history, then stream the
 * model's tool calls back to the browser. Each stage lives in ../chat/.
 */

async function handleChatRequest(req: Request): Promise<Response> {
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
    const deepThinkingEnabled = Boolean(payload?.deepThinkingEnabled)

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

    const normalizedClientConfig = normalizeAIConfig(
        typeof bodyAIConfig === "object" && bodyAIConfig ? bodyAIConfig : {},
    )
    // Settings arrive in the request body; headers stay supported so an
    // embedding host can override them without rewriting the payload.
    const header = (name: string) => req.headers.get(name) || ""
    const textChannel = {
        ...getTextChannel(normalizedClientConfig),
        ...(header("x-ai-base-url") ? { baseUrl: header("x-ai-base-url") } : {}),
        ...(header("x-ai-api-key") ? { apiKey: header("x-ai-api-key") } : {}),
    }
    const headerModel = header("x-ai-model") || header("x-ai-chat-model")
    if (headerModel) textChannel.model = headerModel

    const imageChannel = getImageChannel(normalizedClientConfig)
    const imageModelId = header("x-ai-image-model") || imageChannel.model || null

    const { model, modelId } = getChatModel(textChannel)

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
                        ? await summarizeRecursiveMethod({ model, text: extracted })
                        : await summarizeBlockMethod({ model, text: extracted })
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
    const imageAttachments: ImageAttachment[] = fileParts
        .map((part: any) => {
            const url =
                part?.url || part?.image || part?.image_url?.url || ""
            const mediaType = part?.mediaType || part?.mimeType || ""
            const safeUrl = cleanImageReferenceUrl(url)
            return safeUrl ? { url: safeUrl, mediaType } : null
        })
        .filter((item): item is ImageAttachment => Boolean(item))

    const flowRequestRoute = classifyFlowRequest({
        xml: String(xml || ""),
        userText: lastMessageText,
    })

    const shouldUseDeepThinking = shouldRunDeepThinking({
        deepThinkingEnabled,
        route: flowRequestRoute,
    })

    console.log("[FlowRoute]", {
        route: flowRequestRoute,
        deepThinkingEnabled,
        shouldUseDeepThinking,
    })

    let deepThinkingImageDataUrl: string | null = null
    if (shouldUseDeepThinking) {
        const deepThinkingImageModel = String(imageModelId || "").trim()

        const effectiveImageChannel = {
            ...imageChannel,
            model: deepThinkingImageModel || imageChannel.model,
        }

        if (
            effectiveImageChannel.baseUrl &&
            effectiveImageChannel.apiKey &&
            effectiveImageChannel.model
        ) {
            try {
                deepThinkingImageDataUrl = await generateDeepThinkingDiagramImage({
                    userText: lastMessageText,
                    globalConstraints: globalConstraintsRaw,
                    processedFilesContext: parsedFilesContext,
                    imageAttachments,
                    channel: effectiveImageChannel,
                })
                console.log(
                    "[DeepThinking] Generated draft image:",
                    Boolean(deepThinkingImageDataUrl),
                )
                if (deepThinkingImageDataUrl) {
                    try {
                        const savedPath =
                            await saveDeepThinkingImageDebugArtifact({
                                dataUrl: deepThinkingImageDataUrl,
                                sessionId: validSessionId,
                                userText: lastMessageText,
                            })
                        if (savedPath) {
                            console.log(
                                "[DeepThinking] Saved debug image to:",
                                savedPath,
                            )
                        }
                    } catch (error) {
                        console.warn(
                            "[DeepThinking] Failed to save debug image locally:",
                            error,
                        )
                    }
                }
            } catch (error) {
                console.warn("[DeepThinking] Failed to generate draft image:", error)
            }
        } else {
            console.warn(
                "[DeepThinking] Skipped because image model configuration is incomplete",
            )
        }
    }

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${lastMessageText}
"""
${parsedFilesContext ? `\n\nParsed file summaries:\n"""md\n${parsedFilesContext}\n"""` : ""}${
        deepThinkingImageDataUrl
            ? `\n\nReference image:\nAn optional reference image generated by the deep-thinking stage is attached below. Use it to infer structure, composition, grouping, and layout. If it conflicts with the user's request, follow the user's request.`
            : ""
    }`

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
            return { ...message, parts: [] }
        }
        
        // Fallback: create default message structure
        return { role: 'user', parts: [{ type: 'text', text: '' }] }
    })

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = convertToModelMessages(normalizedMessages)

    // Fix tool call inputs for Bedrock API (requires JSON objects, not strings)
    const fixedMessages = fixToolCallInputs(modelMessages)

    // Replace historical tool call XML with placeholders to reduce tokens
    // Disabled by default - some models (e.g. minimax) copy placeholders instead of generating XML
    const enableHistoryReplace =
        process.env.ENABLE_HISTORY_XML_REPLACE === "true"
    const placeholderMessages = enableHistoryReplace
        ? replaceHistoricalToolInputs(fixedMessages)
        : fixedMessages

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    let enhancedMessages = placeholderMessages.filter(
        (msg: any) => {
            // Check for both content and parts arrays since messages can have either format
            const hasValidContent = (msg.content && Array.isArray(msg.content) && msg.content.length > 0) ||
                                   (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0)
            
            if (!hasValidContent) {
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
                    return false
                }
            }

            return true
        }
    )

    // Update the last message with user input only (XML moved to separate cached system message)
    if (enhancedMessages.length >= 1) {
        const lastModelMessage = enhancedMessages[enhancedMessages.length - 1]
        if (lastModelMessage.role === "user") {
            // Check if this user message is effectively empty (no text content and no files)
            // This acts as a final safety net if the filter above missed it
            const isTextEmpty = !lastMessageText || lastMessageText.trim() === ''
            const hasFiles = fileParts.length > 0
            
            if (isTextEmpty && !hasFiles) {
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

                if (deepThinkingImageDataUrl) {
                    contentParts.push({
                        type: "image",
                        image: deepThinkingImageDataUrl,
                        mimeType: "image/png",
                    })
                }

                enhancedMessages = [
                    ...enhancedMessages.slice(0, -1),
                    { ...lastModelMessage, content: contentParts },
                ]
            }
        }
    }

    // Two system messages rather than one: the instructions are stable across a
    // conversation while the diagram XML changes every turn, so keeping them
    // apart lets the provider reuse the cached instruction prefix.
    const systemMessages = [
        {
            role: "system" as const,
            content: systemMessage,
        },
        {
            role: "system" as const,
            content: `${previousXml ? `Previous diagram XML (before user's last message):\n"""xml\n${previousXml}\n"""\n\n` : ""}Current diagram XML (AUTHORITATIVE - the source of truth):\n"""xml\n${xml || ""}\n"""\n\nIMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed. When using edit_diagram, COPY search patterns exactly from the CURRENT XML - attribute order matters!`,
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

    // Off unless PROMPT_LOG_DIR is set: this is the entire prompt, inline
    // images and all, and it is the user's content.
    if (process.env.PROMPT_LOG_DIR) {
        try {
            const logPath = path.join(process.env.PROMPT_LOG_DIR, "llm-prompts.log")
            await appendFile(logPath, JSON.stringify(promptPayload, null, 2) + "\n")
        } catch (error) {
            console.error("[PROMPT] Failed to write prompt log:", error)
        }
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
                            description: `Display a new diagram on draw.io.

Preferred output: mxCell elements only. The app will wrap them into the full mxfile structure automatically.

Rules:
1. All mxCell elements must be direct children of root
2. Every mxCell needs a unique id
3. Every mxCell must have a valid parent attribute
4. Edge source/target must reference existing cell ids
5. Escape special characters inside XML attribute values`,
                            inputSchema: z.object({
                                xml: z
                                    .string()
                                    .describe(
                                        "XML string to be displayed on draw.io",
                                    ),
                            }),
                        },
                        edit_diagram: {
                            description: `Edit the current diagram by applying node-level operations.

Operations:
- update: replace an existing mxCell by id
- add: append one new mxCell by id
- delete: remove one mxCell by id; descendants and connected edges are removed automatically

Rules:
- For update/add, new_xml must contain exactly one mxCell element
- The mxCell id inside new_xml must match cell_id
- Use display_diagram instead if the change is effectively a redraw`,
                            inputSchema: z.object({
                                operations: z
                                    .array(
                                        z.object({
                                            operation: z
                                                .string()
                                                .describe(
                                                    'Operation to perform: "update", "add", or "delete"',
                                                ),
                                            cell_id: z
                                                .string()
                                                .describe(
                                                    "Target mxCell id. For add/update, it must match the id in new_xml.",
                                                ),
                                            new_xml: z
                                                .string()
                                                .optional()
                                                .describe(
                                                    "Complete mxCell XML element for add/update.",
                                                ),
                                        }),
                                    )
                                    .describe(
                                        "Array of diagram operations to apply sequentially",
                                    ),
                            }),
                        },
                        append_diagram: {
                            description: `Continue generating diagram XML after display_diagram was truncated.

Rules:
- Continue from the exact point where the previous fragment ended
- Do not repeat previously emitted cells
- Do not emit wrapper tags`,
                            inputSchema: z.object({
                                xml: z
                                    .string()
                                    .describe(
                                        "Continuation XML fragment to append",
                                    ),
                            }),
                        },
                        get_shape_library: {
                            description: `Load a shape/icon library Markdown reference before creating specialized icon-library diagrams.`,
                            inputSchema: z.object({
                                library: z
                                    .string()
                                    .describe(
                                        `Library name. Available first-pass libraries: ${formatAvailableShapeLibraries()}`,
                                    ),
                            }),
                            execute: async ({ library }) => {
                                const sanitizedLibrary = String(library || "")
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_-]/g, "")

                                if (!sanitizedLibrary) {
                                    return `Invalid library name. Available: ${formatAvailableShapeLibraries()}`
                                }

                                const baseDir = path.join(
                                    process.cwd(),
                                    "docs",
                                    "shape-libraries",
                                )
                                const filePath = path.join(
                                    baseDir,
                                    `${sanitizedLibrary}.md`,
                                )
                                const resolvedPath = path.resolve(filePath)
                                if (!resolvedPath.startsWith(path.resolve(baseDir))) {
                                    return "Invalid library path."
                                }

                                try {
                                    return await readFile(resolvedPath, "utf8")
                                } catch (error) {
                                    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                                        return `Library "${library}" not found. Available: ${formatAvailableShapeLibraries()}`
                                    }
                                    return `Failed to load library "${library}".`
                                }
                            },
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
