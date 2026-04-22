"use client"

import { useChat } from "@ai-sdk/react"
import {
    PanelRightClose,
    PanelRightOpen,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Toaster, toast } from "sonner"
import { ButtonWithTooltip } from "@/workspaces/flow/next/components/button-with-tooltip"
import { ChatInput } from "@/workspaces/flow/next/components/chat-input"
import { STORAGE_GLOBAL_CONSTRAINTS_KEY } from "@/workspaces/flow/next/components/global-constraints-dialog"
import { useDiagram } from "@/workspaces/flow/next/contexts/diagram-context"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"
import { getAIConfig } from "@/workspaces/flow/next/lib/ai-config"
import {
    extractPdfText,
    extractWordText,
    extractTextFileContent,
    isPdfFile,
    isWordFile,
    isTextFile,
} from "@/workspaces/flow/next/lib/pdf-utils"
import { type FileData, useFileProcessor } from "@/workspaces/flow/next/lib/use-file-processor"
import { useQuotaManager } from "@/workspaces/flow/next/lib/use-quota-manager"
import { applyDiagramOperations, isMxCellXmlComplete, type DiagramOperation } from "@/workspaces/flow/next/lib/diagram-operations"
import { formatXML, validateAndFixXml, wrapWithMxFile } from "@/workspaces/flow/next/lib/utils"
import { ChatMessageDisplay } from "./chat-message-display"

// localStorage keys for persistence
const STORAGE_MESSAGES_KEY = "next-ai-draw-io-messages"
const STORAGE_XML_SNAPSHOTS_KEY = "next-ai-draw-io-xml-snapshots"
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"
export const STORAGE_DIAGRAM_XML_KEY = "next-ai-draw-io-diagram-xml"
const STORAGE_DEEP_THINKING_KEY = "next-ai-draw-io-deep-thinking"

// Type for message parts (tool calls and their states)
interface MessagePart {
    type: string
    state?: string
    toolName?: string
    [key: string]: unknown
}

interface ChatMessage {
    role: string
    parts?: MessagePart[]
    [key: string]: unknown
}

interface ChatPanelProps {
    isVisible: boolean
    onToggleVisibility: () => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    darkMode: boolean
    onToggleDarkMode: () => void
    isMobile?: boolean
    onCloseProtectionChange?: (enabled: boolean) => void
}

// Constants for tool states
const TOOL_ERROR_STATE = "output-error" as const
const DEBUG =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    Boolean(import.meta.env.DEV)
const MAX_AUTO_RETRY_COUNT = 3

/**
 * Check if auto-resubmit should happen based on tool errors.
 * Does NOT handle retry count or quota - those are handled by the caller.
 */
function hasToolErrors(messages: ChatMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
        return false
    }

    const toolParts =
        (lastMessage.parts as MessagePart[] | undefined)?.filter((part) =>
            part.type?.startsWith("tool-"),
        ) || []

    if (toolParts.length === 0) {
        return false
    }

    return toolParts.some((part) => part.state === TOOL_ERROR_STATE)
}

export default function ChatPanel({
    isVisible,
    onToggleVisibility,
    drawioUi,
    onToggleDrawioUi,
    darkMode,
    onToggleDarkMode,
    isMobile = false,
    onCloseProtectionChange,
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        pushHistorySnapshot,
        resolverRef,
        chartXML,
        clearDiagram,
        isDrawioReady,
    } = useDiagram()
    
    const { t } = useLanguage()

    const onFetchChart = (saveToHistory = true) => {
        if (!isDrawioReady) {
            return Promise.reject(new Error("Draw.io editor is not ready yet. Please wait for it to load."))
        }

        return Promise.race([
            new Promise<string>((resolve, reject) => {
                if (resolverRef && "current" in resolverRef) {
                    resolverRef.current = resolve
                }
                const success = saveToHistory ? onExport() : handleExportWithoutHistory()
                if (!success) {
                    if (resolverRef && "current" in resolverRef) {
                        resolverRef.current = null
                    }
                    reject(new Error("Failed to trigger Draw.io export. Editor reference is missing."))
                }
            }),
            new Promise<string>((_, reject) =>
                setTimeout(
                    () => {
                        if (resolverRef && "current" in resolverRef) {
                            resolverRef.current = null
                        }
                        reject(
                            new Error(
                                "Chart export timed out after 10 seconds",
                            ),
                        )
                    },
                    10000,
                ),
            ),
        ])
    }

    // File processing using extracted hook
    const { files, pdfData, handleFileChange, setFiles } = useFileProcessor("flow")

    const [showHistory, setShowHistory] = useState(false)
    const [, setAccessCodeRequired] = useState(false)
    const [input, setInput] = useState("")
    const [dailyRequestLimit, setDailyRequestLimit] = useState(0)
    const [dailyTokenLimit, setDailyTokenLimit] = useState(0)
    const [tpmLimit, setTpmLimit] = useState(0)
    const [defaultModel, setDefaultModel] = useState("")
    const [isParsingFiles, setIsParsingFiles] = useState(false)
    const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(() => {
        if (typeof window === "undefined") return false
        return localStorage.getItem(STORAGE_DEEP_THINKING_KEY) === "true"
    })

    // Check config on mount
    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data) => {
                setAccessCodeRequired(data.accessCodeRequired)
                setDailyRequestLimit(data.dailyRequestLimit || 0)
                setDailyTokenLimit(data.dailyTokenLimit || 0)
                setTpmLimit(data.tpmLimit || 0)
                setDefaultModel(data.defaultModel || "")
            })
            .catch(() => {
                setAccessCodeRequired(false)
            })
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        localStorage.setItem(
            STORAGE_DEEP_THINKING_KEY,
            deepThinkingEnabled ? "true" : "false",
        )
    }, [deepThinkingEnabled])

    // Quota management using extracted hook
    const quotaManager = useQuotaManager({
        dailyRequestLimit,
        dailyTokenLimit,
        tpmLimit,
    })

    // Generate a unique session ID for Langfuse tracing (restore from localStorage if available)
    const [sessionId, setSessionId] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_SESSION_ID_KEY)
            if (saved) return saved
        }
        return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    })

    // Store XML snapshots for each user message (keyed by message index)
    const xmlSnapshotsRef = useRef<Map<number, string>>(new Map())

    // Flag to track if we've restored from localStorage
    const hasRestoredRef = useRef(false)

    // Ref to track latest chartXML for use in callbacks (avoids stale closure)
    const chartXMLRef = useRef(chartXML)
    useEffect(() => {
        chartXMLRef.current = chartXML
    }, [chartXML])

    // Ref to hold stop function for use in onToolCall (avoids stale closure)
    const stopRef = useRef<(() => void) | null>(null)

    // Ref to track consecutive auto-retry count (reset on user action)
    const autoRetryCountRef = useRef(0)

    // Persist processed tool call IDs so collapsing the chat doesn't replay old tool outputs
    const processedToolCallsRef = useRef<Set<string>>(new Set())
    const assembledDiagramXmlRef = useRef("")

    const chat: any = (useChat as any)({
        api: "/api/chat",
        onError: (error) => {
            setIsParsingFiles(false)
            console.error('[ChatPanel] useChat error:', error)
            const rawDetail =
                (error as any)?.message ||
                (error as any)?.cause?.message ||
                (error as any)?.cause?.error ||
                "未知错误"

            let detail = String(rawDetail)
            try {
                const parsed = JSON.parse(detail)
                if (parsed && typeof parsed.error === "string") {
                    detail = parsed.error
                }
            } catch {
                // Keep raw detail text when it is not JSON.
            }

            toast.error(`发送失败：${detail}`)
        },
        async onToolCall({ toolCall }) {
            if (DEBUG) {
                console.log(
                    `[onToolCall] Tool: ${toolCall.toolName}, CallId: ${toolCall.toolCallId}`,
                )
            }

            if (toolCall.toolName === "display_diagram") {
                const { xml } = toolCall.input as { xml: string }
                const rawXml = String(xml || "")
                assembledDiagramXmlRef.current = rawXml
                if (DEBUG) {
                    console.log(
                        `[display_diagram] Received XML length: ${rawXml.length}`,
                    )
                }

                if (!isMxCellXmlComplete(rawXml)) {
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `Output was truncated due to length limits. Continue with append_diagram from the exact point where this fragment stopped.

Your partial XML:
\`\`\`xml
${rawXml}
\`\`\`

Rules:
- Do not emit wrapper tags
- Do not restart from the beginning
- Continue from the exact next character`,
                    })
                    return
                }

                let xmlToDisplay = rawXml
                const { valid, error, fixed, fixes } = validateAndFixXml(
                    wrapWithMxFile(rawXml),
                )
                if (fixed) {
                    xmlToDisplay = fixed
                    if (DEBUG) {
                        console.log("[display_diagram] XML auto-fixed:", fixes)
                    }
                }
                if (!valid && error) {
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `${error}

Please fix the XML issues and call display_diagram again with corrected XML.

Your failed XML:
\`\`\`xml
${rawXml}
\`\`\``,
                    })
                    return
                }

                // Wrap raw XML with full mxfile structure for draw.io
                const fullXml = xmlToDisplay.includes("<mxfile")
                    ? xmlToDisplay
                    : wrapWithMxFile(xmlToDisplay)

                // loadDiagram validates and returns error if invalid
                const validationError = onDisplayChart(fullXml)

                if (validationError) {
                    console.warn(
                        "[display_diagram] Validation error:",
                        validationError,
                    )
                    // Return error to model - sendAutomaticallyWhen will trigger retry
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Adding tool output with state: output-error",
                        )
                    }
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `${validationError}

${isMxCellXmlComplete(xml) ? "Please fix the XML issues and call display_diagram again with corrected XML." : "The XML appears truncated. Continue with append_diagram from the exact point where this fragment stopped."}

Your failed XML:
\`\`\`xml
${xml}
\`\`\``,
                    })
                } else {
                    // Success - diagram will be rendered by chat-message-display
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Success! Adding tool output with state: output-available",
                        )
                    }
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: "Successfully displayed the diagram.",
                    })
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Tool output added. Diagram should be visible now.",
                        )
                    }
                }
            } else if (toolCall.toolName === "append_diagram") {
                const { xml } = toolCall.input as { xml: string }
                const appendXml = String(xml || "")
                const trimmedAppend = appendXml.trim()

                if (
                    trimmedAppend.startsWith("<mxGraphModel") ||
                    trimmedAppend.startsWith("<root") ||
                    trimmedAppend.startsWith("<mxfile") ||
                    trimmedAppend.startsWith('<mxCell id="0"') ||
                    trimmedAppend.startsWith('<mxCell id="1"')
                ) {
                    addToolOutput({
                        tool: "append_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `Do not restart the diagram in append_diagram.

Continue from the exact point where the previous fragment stopped:
\`\`\`
${assembledDiagramXmlRef.current.slice(-500)}
\`\`\`

Do not emit wrapper tags or root cells.`,
                    })
                    return
                }

                const combinedXml = `${assembledDiagramXmlRef.current}${appendXml}`
                assembledDiagramXmlRef.current = combinedXml
                if (DEBUG) {
                    console.log(
                        `[append_diagram] Combined XML length=${combinedXml.length}`,
                    )
                }

                if (!isMxCellXmlComplete(combinedXml)) {
                    addToolOutput({
                        tool: "append_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `The combined XML still appears truncated. Continue with append_diagram from the exact point where this fragment stopped.

Current ending:
\`\`\`
${combinedXml.slice(-500)}
\`\`\``,
                    })
                    return
                }

                let xmlToDisplay = combinedXml
                const { valid, error, fixed, fixes } = validateAndFixXml(
                    wrapWithMxFile(combinedXml),
                )
                if (fixed) {
                    xmlToDisplay = fixed
                    if (DEBUG) {
                        console.log("[append_diagram] XML auto-fixed:", fixes)
                    }
                }
                if (!valid && error) {
                    addToolOutput({
                        tool: "append_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `${error}

Please fix the appended XML and continue only if more cells are still missing.`,
                    })
                    return
                }

                const fullXml = xmlToDisplay.includes("<mxfile")
                    ? xmlToDisplay
                    : wrapWithMxFile(xmlToDisplay)
                const validationError = onDisplayChart(fullXml)

                if (validationError) {
                    addToolOutput({
                        tool: "append_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `${validationError}

${isMxCellXmlComplete(combinedXml) ? "Please fix the appended XML and continue only if more cells are still missing." : "The combined XML still appears truncated. Continue with append_diagram from the exact point where this fragment stopped."}`,
                    })
                } else {
                    assembledDiagramXmlRef.current = ""
                    addToolOutput({
                        tool: "append_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: "Successfully appended the remaining diagram XML.",
                    })
                }
            } else if (toolCall.toolName === "edit_diagram") {
                const { operations } = toolCall.input as {
                    operations: DiagramOperation[]
                }

                let currentXml = ""
                try {
                    console.log("[edit_diagram] Starting...")
                    // Prefer cached chart XML to avoid exporting from draw.io each time.
                    // This is more stable in remote iframe environments.
                    const cachedXML = chartXMLRef.current
                    if (cachedXML) {
                        currentXml = cachedXML
                        console.log(
                            "[edit_diagram] Using cached chartXML, length:",
                            currentXml.length,
                        )
                    } else {
                        // Fallback: export full XML from draw.io iframe.
                        console.log(
                            "[edit_diagram] No cached XML, fetching from DrawIO...",
                        )
                        currentXml = await onFetchChart(false)
                        console.log(
                            "[edit_diagram] Got XML from export, length:",
                            currentXml.length,
                        )
                    }

                    const editedXml = applyDiagramOperations(currentXml, operations)

                    // Reload edited XML and validate.
                    const validationError = onDisplayChart(editedXml)
                    if (validationError) {
                        // If XML is invalid, surface the error in chat.
                        console.warn(
                            "[edit_diagram] Validation error:",
                            validationError,
                        )
                        addToolOutput({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            state: "output-error",
                            errorText: `${validationError}

Please fix the XML issues. Ensure cell_id values exist in the current XML and that each new_xml contains exactly one valid mxCell.`,
                        })
                    } else {
                        // Success: update cache and log completion.
                        chartXMLRef.current = editedXml
                        assembledDiagramXmlRef.current = ""
                        addToolOutput({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: "Successfully edited the diagram.",
                        })
                    }
                } catch (error) {
                    // Catch any runtime failure (search miss, replace failure, etc.).
                    console.error("[edit_diagram] Error:", error)
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `Failed to edit diagram: ${error instanceof Error ? error.message : "Unknown error"}`,
                    })
                }
            }
        },
        sendAutomaticallyWhen: ({ messages }) => {
            const shouldRetry = hasToolErrors(
                messages as unknown as ChatMessage[],
            )

            if (!shouldRetry) {
                // No error, reset retry count
                autoRetryCountRef.current = 0
                if (DEBUG) {
                    console.log("[sendAutomaticallyWhen] No errors, stopping")
                }
                return false
            }

            // Check retry count limit
            if (autoRetryCountRef.current >= MAX_AUTO_RETRY_COUNT) {
                if (DEBUG) {
                    console.log(
                        `[sendAutomaticallyWhen] Max retry count (${MAX_AUTO_RETRY_COUNT}) reached, stopping`,
                    )
                }
                toast.error(
                    `自动重试已达到上限（${MAX_AUTO_RETRY_COUNT} 次），请手动重试。`,
                )
                autoRetryCountRef.current = 0
                return false
            }

            // Check quota limits before auto-retry
            const tokenLimitCheck = quotaManager.checkTokenLimit()
            if (!tokenLimitCheck.allowed) {
                if (DEBUG) {
                    console.log(
                        "[sendAutomaticallyWhen] Token limit exceeded, stopping",
                    )
                }
                quotaManager.showTokenLimitToast(tokenLimitCheck.used)
                autoRetryCountRef.current = 0
                return false
            }

            const tpmCheck = quotaManager.checkTPMLimit()
            if (!tpmCheck.allowed) {
                if (DEBUG) {
                    console.log(
                        "[sendAutomaticallyWhen] TPM limit exceeded, stopping",
                    )
                }
                quotaManager.showTPMLimitToast()
                autoRetryCountRef.current = 0
                return false
            }

            // Increment retry count and allow retry
            autoRetryCountRef.current++
            if (DEBUG) {
                console.log(
                    `[sendAutomaticallyWhen] Retrying (${autoRetryCountRef.current}/${MAX_AUTO_RETRY_COUNT})`,
                )
            }
            return true
        },
    } as any)

    const {
        messages,
        addToolOutput,
        stop,
        status,
        error,
        setMessages,
    } = chat as any

    // Runtime compatibility fix: use sendMessage if append is missing
    // The installed version of @ai-sdk/react seems to expose sendMessage instead of append
    const appendMessage = chat.append || (chat as any).sendMessage

    useEffect(() => {
        if (typeof appendMessage !== 'function') {
            console.error('[ChatPanel] appendMessage (append/sendMessage) is not a function!', chat)
        }
    }, [chat, appendMessage])

    // Update stopRef so onToolCall can access it
    stopRef.current = stop

    // Ref to track latest messages for unload persistence
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    useEffect(() => {
        if (!messages.length) {
            assembledDiagramXmlRef.current = ""
        }
    }, [messages.length])

    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Restore messages and XML snapshots from localStorage on mount
    useEffect(() => {
        if (hasRestoredRef.current) return
        hasRestoredRef.current = true

        try {
            // Restore messages
            const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY)
            if (savedMessages) {
                const parsed = JSON.parse(savedMessages)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMessages(parsed)
                }
            }

            // Restore XML snapshots
            const savedSnapshots = localStorage.getItem(
                STORAGE_XML_SNAPSHOTS_KEY,
            )
            if (savedSnapshots) {
                const parsed = JSON.parse(savedSnapshots)
                xmlSnapshotsRef.current = new Map(parsed)
            }
        } catch (error) {
            console.error("Failed to restore from localStorage:", error)
        }
    }, [setMessages])

    // Restore diagram XML when DrawIO becomes ready
    const hasDiagramRestoredRef = useRef(false)
    const [canSaveDiagram, setCanSaveDiagram] = useState(false)
    useEffect(() => {
        // Reset restore flag when DrawIO is not ready (e.g., theme/UI change remounts it)
        if (!isDrawioReady) {
            hasDiagramRestoredRef.current = false
            setCanSaveDiagram(false)
            return
        }
        if (hasDiagramRestoredRef.current) return
        hasDiagramRestoredRef.current = true

        try {
            const savedDiagramXml = localStorage.getItem(
                STORAGE_DIAGRAM_XML_KEY,
            )
            console.log(
                "[ChatPanel] Restoring diagram, has saved XML:",
                !!savedDiagramXml,
            )
            if (savedDiagramXml) {
                console.log(
                    "[ChatPanel] Loading saved diagram XML, length:",
                    savedDiagramXml.length,
                )
                // Skip validation for trusted saved diagrams
                onDisplayChart(savedDiagramXml, true)
                chartXMLRef.current = savedDiagramXml
            }
        } catch (error) {
            console.error("Failed to restore diagram from localStorage:", error)
        }

        // Allow saving after restore is complete
        setTimeout(() => {
            console.log("[ChatPanel] Enabling diagram save")
            setCanSaveDiagram(true)
        }, 500)
    }, [isDrawioReady, onDisplayChart])

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (!hasRestoredRef.current) return
        try {
            localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages))
        } catch (error) {
            console.error("Failed to save messages to localStorage:", error)
        }
    }, [messages])

    // Save diagram XML to localStorage whenever it changes
    useEffect(() => {
        if (!canSaveDiagram) return
        if (chartXML && chartXML.length > 300) {
            localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, chartXML)
        }
    }, [chartXML, canSaveDiagram])

    // Save XML snapshots to localStorage whenever they change
    const saveXmlSnapshots = useCallback(() => {
        try {
            const snapshotsArray = Array.from(xmlSnapshotsRef.current.entries())
            localStorage.setItem(
                STORAGE_XML_SNAPSHOTS_KEY,
                JSON.stringify(snapshotsArray),
            )
        } catch (error) {
            console.error(
                "Failed to save XML snapshots to localStorage:",
                error,
            )
        }
    }, [])

    // Save session ID to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
    }, [sessionId])

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    useEffect(() => {
        if (status === "streaming" && isParsingFiles) {
            setIsParsingFiles(false)
        }
    }, [status, isParsingFiles])

    // Save state right before page unload (refresh/close)
    useEffect(() => {
        const handleBeforeUnload = () => {
            try {
                localStorage.setItem(
                    STORAGE_MESSAGES_KEY,
                    JSON.stringify(messagesRef.current),
                )
                localStorage.setItem(
                    STORAGE_XML_SNAPSHOTS_KEY,
                    JSON.stringify(
                        Array.from(xmlSnapshotsRef.current.entries()),
                    ),
                )
                const xml = chartXMLRef.current
                if (xml && xml.length > 300) {
                    localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, xml)
                }
                localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
            } catch (error) {
                console.error("Failed to persist state before unload:", error)
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [sessionId])

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const isProcessing = status === "streaming" || status === "submitted"
        if (input.trim() && !isProcessing) {
            let chartXml = chartXML || ""
            try {
                if (isDrawioReady) {
                    try {
                        chartXml = await onFetchChart(false)
                    } catch (error) {
                        console.warn("Failed to fetch chart data, using current state:", error)
                    }
                }
                
                chartXml = formatXML(chartXml)
                pushHistorySnapshot(chartXml)

                // Update ref directly to avoid race condition with React's async state update
                // This ensures edit_diagram has the correct XML before AI responds
                chartXMLRef.current = chartXml

                // Build user text by concatenating input with pre-extracted text
                // (Backend only reads first text part, so we must combine them)
                const hasExtractableFiles = files.some(
                    (file) =>
                        isPdfFile(file) || isTextFile(file) || isWordFile(file),
                )
                setIsParsingFiles(hasExtractableFiles)
                const parts: any[] = []
                const { userText, uploadedFiles } = await processFilesAndAppendContent(
                    input,
                    files,
                    pdfData,
                    parts,
                )

                // Add the combined text as the first part
                parts.unshift({ type: "text", text: userText })

                // Get previous XML from the last snapshot (before this message)
                const snapshotKeys = Array.from(
                    xmlSnapshotsRef.current.keys(),
                ).sort((a, b) => b - a)
                const previousXml =
                    snapshotKeys.length > 0
                        ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
                        : ""

                // Save XML snapshot for this message (will be at index = current messages.length)
                const messageIndex = messages.length
                xmlSnapshotsRef.current.set(messageIndex, chartXml)
                saveXmlSnapshots()

                // Check all quota limits
                if (!checkAllQuotaLimits()) {
                    setIsParsingFiles(false)
                    return
                }

                sendChatMessage(parts, chartXml, previousXml, sessionId, uploadedFiles)

                // Token count is tracked in onFinish with actual server usage
                setInput("")
                setFiles([])
            } catch (error) {
                console.error("Error fetching chart data:", error)
                setIsParsingFiles(false)
            }
        }
    }

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        setInput(e.target.value)
    }

    const normalizeMessageToParts = (message: any): any[] => {
        if (Array.isArray(message?.parts)) return message.parts
        if (typeof message?.content === "string") {
            return [{ type: "text", text: message.content }]
        }
        if (Array.isArray(message?.content)) {
            return message.content
                .map((item: any) => {
                    if (typeof item === "string") return { type: "text", text: item }
                    if (item?.type === "text") return { type: "text", text: item.text || "" }
                    if (item?.type === "image_url" && item?.image_url?.url) {
                        return { type: "file", url: item.image_url.url, mediaType: "image/*" }
                    }
                    if (item?.type === "image" && (item?.url || item?.image)) {
                        return {
                            type: "file",
                            url: item.url || item.image,
                            mediaType: item.mediaType || item.mimeType || "image/*",
                        }
                    }
                    if (item?.type === "file" && item?.url) {
                        return {
                            type: "file",
                            url: item.url,
                            mediaType: item.mediaType || item.mimeType || "",
                        }
                    }
                    return null
                })
                .filter(Boolean)
        }
        return []
    }

    const extractFileBlocksFromText = (text: string): string[] => {
        const blocks: string[] = []
        const pattern = /\[(PDF|File):\s*[^\]]+\][\s\S]*?(?=\n\n\[(PDF|File):|$)/g
        let m: RegExpExecArray | null
        while ((m = pattern.exec(String(text || ""))) !== null) {
            blocks.push(String(m[0] || "").trim())
        }
        return blocks
    }

    const getMessageTextForEdit = (message: any): string => {
        const parts = normalizeMessageToParts(message)
        return parts
            .filter((p: any) => p?.type === "text")
            .map((p: any) => String(p?.text || ""))
            .join("\n")
    }

    // Helper functions for message actions (regenerate/edit)
    // Extract previous XML snapshot before a given message index
    const getPreviousXml = (beforeIndex: number): string => {
        const snapshotKeys = Array.from(xmlSnapshotsRef.current.keys())
            .filter((k) => k < beforeIndex)
            .sort((a, b) => b - a)
        return snapshotKeys.length > 0
            ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
            : ""
    }

    // Restore diagram from snapshot and update ref
    const restoreDiagramFromSnapshot = (savedXml: string) => {
        onDisplayChart(savedXml, true) // Skip validation for trusted snapshots
        chartXMLRef.current = savedXml
    }

    // Clean up snapshots after a given message index
    const cleanupSnapshotsAfter = (messageIndex: number) => {
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()
    }

    // Check all quota limits (daily requests, tokens, TPM)
    const checkAllQuotaLimits = (): boolean => {
        const limitCheck = quotaManager.checkDailyLimit()
        if (!limitCheck.allowed) {
            quotaManager.showQuotaLimitToast()
            return false
        }

        const tokenLimitCheck = quotaManager.checkTokenLimit()
        if (!tokenLimitCheck.allowed) {
            quotaManager.showTokenLimitToast(tokenLimitCheck.used)
            return false
        }

        const tpmCheck = quotaManager.checkTPMLimit()
        if (!tpmCheck.allowed) {
            quotaManager.showTPMLimitToast()
            return false
        }

        return true
    }

    // Send chat message with headers and increment quota
    const sendChatMessage = (
        parts: any,
        xml: string,
        previousXml: string,
        sessionId: string,
        uploadedFiles: Array<{
            name: string
            mediaType: string
            dataUrl: string
            extractedText?: string
        }> = [],
    ) => {
        // Reset auto-retry count on user-initiated message
        autoRetryCountRef.current = 0

        const config = getAIConfig()
        const modelToUse = String(config.aiModel || defaultModel || "").trim()
        const imageModelToUse = String(
            (config as { aiImageModel?: string }).aiImageModel || "",
        ).trim()
        const globalConstraints = localStorage.getItem(STORAGE_GLOBAL_CONSTRAINTS_KEY) || ""

        // Safe parts access
        const safeParts = Array.isArray(parts) ? parts : []

        // Extract the text content from parts for sendMessage
        const textPart = safeParts.find((p: any) => p.type === 'text')
        const userInput = textPart?.text || ''

        // Extract image attachments from parts
        const imageAttachments = safeParts
            .map((p: any) => {
                if (p?.type === "file" && p?.url) {
                    return { url: p.url, contentType: p.mediaType || p.mimeType || "" }
                }
                if (p?.type === "image" && (p?.url || p?.image)) {
                    return { url: p.url || p.image, contentType: p.mediaType || p.mimeType || "" }
                }
                if (p?.type === "image_url" && p?.image_url?.url) {
                    return { url: p.image_url.url, contentType: p.mediaType || p.mimeType || "" }
                }
                return null
            })
            .filter((x: any) => x?.url && String(x.url).startsWith("data:image/"))

        const messageContent: any[] = []
        for (const attachment of imageAttachments) {
            messageContent.push({
                type: "image_url",
                image_url: { url: attachment.url },
            })
        }
        messageContent.push({ type: "text", text: userInput })

        const message: any = {
            role: "user",
            content: messageContent,
        }

        console.log('[sendChatMessage] calling appendMessage', { message, appendMessage })
        
        if (typeof appendMessage !== 'function') {
            console.error('[sendChatMessage] appendMessage is not a function!', appendMessage)
            toast.error("内部错误：聊天初始化失败，请刷新页面后重试。")
            return
        }

        if (!modelToUse) {
            toast.error("未配置模型。请在顶部设置填写模型，或在服务端配置 AI_MODEL。")
            return
        }

        appendMessage(
            message,
            {
                body: {
                    xml,
                    previousXml,
                    sessionId,
                    uploadedFiles,
                    deepThinkingEnabled,
                    aiConfig: {
                        provider: config.aiProvider,
                        baseUrl: config.aiBaseUrl,
                        apiKey: config.aiApiKey,
                        chatModel: modelToUse,
                        imageModel: imageModelToUse,
                        textProvider: config.aiProvider,
                        textBaseUrl: config.aiBaseUrl,
                        textApiKey: config.aiApiKey,
                        textModel: modelToUse,
                        imageProvider:
                            (config as { aiImageProvider?: string }).aiImageProvider ||
                            config.aiProvider,
                        imageBaseUrl:
                            (config as { aiImageBaseUrl?: string }).aiImageBaseUrl ||
                            config.aiBaseUrl,
                        imageApiKey:
                            (config as { aiImageApiKey?: string }).aiImageApiKey ||
                            config.aiApiKey,
                    },
                    aiConstraints: globalConstraints,
                },
                headers: {
                    "x-access-code": config.accessCode,
                    ...(config.aiProvider && {
                        "x-ai-provider": config.aiProvider,
                    }),
                    ...(config.aiBaseUrl && {
                        "x-ai-base-url": config.aiBaseUrl,
                    }),
                    ...(config.aiApiKey && { "x-ai-api-key": config.aiApiKey }),
                    ...(modelToUse && { "x-ai-model": modelToUse }),
                    ...(modelToUse && { "x-ai-chat-model": modelToUse }),
                    ...(imageModelToUse && {
                        "x-ai-image-model": imageModelToUse,
                    }),
                    ...(globalConstraints && {
                        "x-ai-constraints": encodeURIComponent(globalConstraints),
                    }),
                },

            },
        )
        quotaManager.incrementRequestCount()
    }

    // Process files and append content to user text (handles PDF, text, and optionally images)
    const processFilesAndAppendContent = async (
        baseText: string,
        files: File[],
        pdfData: Map<File, FileData>,
        imageParts?: any[],
    ): Promise<{
        userText: string
        uploadedFiles: Array<{
            name: string
            mediaType: string
            dataUrl: string
            extractedText?: string
        }>
    }> => {
        // Remove previously appended file blocks (legacy or previous retries)
        // to avoid duplicating [File: ...] sections in a new send.
        let userText = String(baseText || "")
            .replace(/\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/i, "")
            .trim()
        const uploadedFiles: Array<{
            name: string
            mediaType: string
            dataUrl: string
            extractedText?: string
        }> = []

        const seenFileKeys = new Set<string>()
        for (const file of files) {
            const dedupeKey = `${file.name}__${file.size}__${file.lastModified}`
            if (seenFileKeys.has(dedupeKey)) continue
            seenFileKeys.add(dedupeKey)

            const reader = new FileReader()
            const dataUrl = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string)
                reader.readAsDataURL(file)
            })
            if (file.type.startsWith("image/") && imageParts) {
                imageParts.push({
                    type: "file",
                    url: dataUrl,
                    mediaType: file.type,
                })
                continue
            }
            if (isPdfFile(file) || isTextFile(file) || isWordFile(file)) {
                const extracted = pdfData.get(file)
                let extractedText =
                    extracted && !extracted.isExtracting && extracted.text
                        ? extracted.text
                        : undefined

                // Ensure PDF/TXT content is available before sending.
                // This avoids relying on backend PDF parsing when client-side extraction is ready.
                if (!extractedText) {
                    try {
                        if (isPdfFile(file)) {
                            extractedText = await extractPdfText(file)
                        } else if (isWordFile(file)) {
                            extractedText = await extractWordText(file)
                        } else if (isTextFile(file)) {
                            extractedText = await extractTextFileContent(file)
                        }
                    } catch (error) {
                        console.warn(
                            `[processFilesAndAppendContent] Failed to pre-extract ${file.name}:`,
                            error,
                        )
                    }
                }

                uploadedFiles.push({
                    name: file.name,
                    mediaType: file.type || "application/octet-stream",
                    dataUrl,
                    extractedText,
                })
                const normalizedExtracted = String(extractedText || "").trim()
                userText += `\n\n[File: ${file.name}]\n${
                    normalizedExtracted || "(Failed to read content)"
                }`
            }
        }

        return { userText, uploadedFiles }
    }

    const handleRegenerate = async (messageIndex: number) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) {
            toast.warning(t("common.busy"))
            return
        }

        // Find the user message before this assistant message
        let userMessageIndex = messageIndex - 1
        while (
            userMessageIndex >= 0 &&
            messages[userMessageIndex].role !== "user"
        ) {
            userMessageIndex--
        }

        if (userMessageIndex < 0) {
            console.error("Could not find preceding user message for index:", messageIndex)
            toast.error(t("common.regenerate_error"))
            return
        }

        const userMessage = messages[userMessageIndex]
        
        // Ensure userParts is a valid array, constructing from content if necessary
        const userParts = normalizeMessageToParts(userMessage)

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(userMessageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                userMessageIndex,
            )
            toast.error(t("common.regenerate_error"))
            return
        }

        // Get previous XML and restore diagram state
        const previousXml = getPreviousXml(userMessageIndex)
        restoreDiagramFromSnapshot(savedXml)

        // Clean up snapshots for messages after the user message (they will be removed)
        cleanupSnapshotsAfter(userMessageIndex)

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, userMessageIndex)
        setMessages(newMessages)

        // Check all quota limits
        if (!checkAllQuotaLimits()) return

        // Wait for state update to settle before sending
        // This avoids race conditions where append uses old state or fails
        setTimeout(() => {
             sendChatMessage(userParts, savedXml, previousXml, sessionId)
        }, 0)

        // Token count is tracked in onFinish with actual server usage
    }

    const handleEditMessage = async (messageIndex: number, newText: string) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) return

        const message = messages[messageIndex]
        if (!message || message.role !== "user") return

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(messageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                messageIndex,
            )
            return
        }

        // Get previous XML and restore diagram state
        const previousXml = getPreviousXml(messageIndex)
        restoreDiagramFromSnapshot(savedXml)

        // Clean up snapshots for messages after the user message (they will be removed)
        cleanupSnapshotsAfter(messageIndex)

        // Create new parts with updated text
        const currentParts = normalizeMessageToParts(message)
        const existingText = getMessageTextForEdit(message as any)
        const preservedFileBlocks = extractFileBlocksFromText(existingText)
        const mergedEditedText =
            preservedFileBlocks.length > 0
                ? `${newText.trim()}\n\n${preservedFileBlocks.join("\n\n")}`
                : newText
        const newParts =
            currentParts.length > 0
                ? currentParts.map((part: any) =>
                      part.type === "text"
                          ? { ...part, text: mergedEditedText }
                          : part,
                  )
                : [{ type: "text", text: mergedEditedText }]

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, messageIndex)
        setMessages(newMessages)

        // Check all quota limits
        if (!checkAllQuotaLimits()) return

        // Wait for state update to settle before sending
        // This avoids race conditions where append uses old state or fails
        setTimeout(() => {
             sendChatMessage(newParts, savedXml, previousXml, sessionId)
        }, 0)
        // Token count is tracked in onFinish with actual server usage
    }

    // Collapsed view (desktop only)
    if (!isVisible && !isMobile) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl">
                <ButtonWithTooltip
                    tooltipContent={t("chat.panel.show")}
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="hover:bg-accent transition-colors"
                >
                    <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
            </div>
        )
    }

    // Full view
    return (
        <div className="h-full flex flex-col bg-card shadow-soft animate-slide-in-right rounded-xl border border-border/30 relative">
            <Toaster
                position="top-center"
                richColors
                expand
                toastOptions={{
                    style: {
                        maxWidth: "480px",
                    },
                }}
            />
            {/* Header */}
            <header
                className={`${isMobile ? "px-3 py-2" : "px-5 py-4"} border-b border-border/50`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-semibold tracking-tight whitespace-nowrap">
                            {t("chat.panel.title")}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {!isMobile && (
                            <ButtonWithTooltip
                                tooltipContent={t("chat.panel.hide")}
                                variant="ghost"
                                size="icon"
                                onClick={onToggleVisibility}
                                className="hover:bg-accent"
                            >
                                <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                            </ButtonWithTooltip>
                        )}
                    </div>
                </div>
            </header>

            {/* Messages */}
            <main className="flex-1 w-full overflow-hidden min-h-0">
                <ChatMessageDisplay
                    messages={messages}
                    setInput={setInput}
                    setFiles={handleFileChange}
                    processedToolCallsRef={processedToolCallsRef}
                    sessionId={sessionId}
                    onRegenerate={handleRegenerate}
                    status={status}
                    isParsingFiles={isParsingFiles}
                    onEditMessage={handleEditMessage}
                />
            </main>

            {/* Input */}
            <footer
                className={`${isMobile ? "p-2" : "p-4"} border-t border-border/50 bg-card/50`}
            >
                <ChatInput
                    input={input}
                    status={status}
                    onStop={stop}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => {
                        setMessages([])
                        clearDiagram()
                        const newSessionId = `session-${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`
                        setSessionId(newSessionId)
                        xmlSnapshotsRef.current.clear()
                        // Clear localStorage
                        localStorage.removeItem(STORAGE_MESSAGES_KEY)
                        localStorage.removeItem(STORAGE_XML_SNAPSHOTS_KEY)
                        localStorage.removeItem(STORAGE_DIAGRAM_XML_KEY)
                        localStorage.setItem(
                            STORAGE_SESSION_ID_KEY,
                            newSessionId,
                        )
                    }}
                    files={files}
                    onFileChange={handleFileChange}
                    pdfData={pdfData}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                    error={error}
                    deepThinkingEnabled={deepThinkingEnabled}
                    onToggleDeepThinking={() =>
                        setDeepThinkingEnabled((prev) => !prev)
                    }
                />
            </footer>
        </div>
    )
}

