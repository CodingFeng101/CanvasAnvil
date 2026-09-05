"use client"

import remarkGfm from "remark-gfm"
import { cn } from "@/shared/lib/utils"
import {
    getMessageTextContent,
    getUserOriginalText,
    isFencedCode,
    splitTextIntoFileSections,
    type TextSection,
} from "@/shared/chat/message-content"

/**
 * A message as the chat hook hands it over. `parts` is deliberately loose:
 * the AI SDK streams tool calls, files and reasoning blocks whose shapes vary
 * by provider, and this component narrows each part where it reads it.
 */
interface UIMessagePart {
    type: string
    [key: string]: any
}

type UIMessage = {
    id: string
    role: "user" | "assistant" | "system"
    /** A plain string, or the multimodal part array the model was sent. */
    content?: string | UIMessagePart[]
    parts?: UIMessagePart[]
}

import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Cpu,
    FileCode,
    FileText,
    Pencil,
    Play,
    RotateCcw,
    X,
} from "lucide-react"
import Image from "@/shared/ui/image"
import type { MutableRefObject } from "react"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
    Shimmer,
} from "@/shared/chat"
import { ScrollArea } from "@/shared/ui/scroll-area"
import { useFlowT } from "@/workspaces/flow/lib/translations"
import {
    applyDiagramOperations,
    isMxCellXmlComplete,
    type DiagramOperation,
} from "@/workspaces/flow/lib/diagram-operations"
import { convertToLegalXml, replaceNodes, validateMxCellStructure } from "@/workspaces/flow/lib/drawio-xml"
import { CodeBlock } from "./code-block"

// Tool part interface for type safety
interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: { xml?: string; operations?: DiagramOperation[] } & Record<string, unknown>
    output?: string
}

function OperationsDisplay({ operations }: { operations: DiagramOperation[] }) {
    return (
        <div className="space-y-3">
            {operations.map((operation, index) => (
                <div
                    key={`${operation.operation}-${operation.cell_id}-${index}`}
                    className="rounded-lg border border-border/50 overflow-hidden bg-background/50"
                >
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase">
                            {operation.operation}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                            cell_id: {operation.cell_id}
                        </span>
                    </div>
                    {operation.new_xml && (
                        <div className="px-3 py-2">
                            <pre className="text-[11px] font-mono text-foreground bg-muted/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {operation.new_xml}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

import { useDiagram } from "@/workspaces/flow/state/diagram-context"

// Helper to split text content into regular text and file sections (PDF or text files)
function extractFileSectionsFromText(text: string): TextSection[] {
    return splitTextIntoFileSections(text).filter(
        (s) => s.type === "file",
    ) as TextSection[]
}

function stripFileSectionsFromText(text: string): string {
    const sections = splitTextIntoFileSections(text).filter(
        (s) => s.type === "text",
    )
    return sections.map((s) => s.content).join("\n\n").trim()
}

// Get only the user's original text, excluding appended file content
interface ChatMessageDisplayProps {
    messages: UIMessage[]
    processedToolCallsRef: MutableRefObject<Set<string>>
    onRegenerate?: (messageIndex: number) => void
    onEditMessage?: (messageIndex: number, newText: string) => void
    status?: "streaming" | "submitted" | "idle" | "error" | "ready"
    isParsingFiles?: boolean
}

export function ChatMessageDisplay({
    messages,
    processedToolCallsRef,
    onRegenerate,
    onEditMessage,
    status = "idle",
    isParsingFiles = false,
}: ChatMessageDisplayProps) {
    const t = useFlowT()
    const { chartXML, loadDiagram: onDisplayChart } = useDiagram()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const previousXML = useRef<string>("")
    const assembledXmlRef = useRef<string>("")
    const processedToolCalls = processedToolCallsRef
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
        {},
    )
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [copyFailedMessageId, setCopyFailedMessageId] = useState<
        string | null
    >(null)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    )
    const editTextareaRef = useRef<HTMLTextAreaElement>(null)
    const [editText, setEditText] = useState<string>("")
    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text)

            setCopiedMessageId(messageId)
            setTimeout(() => setCopiedMessageId(null), 2000)
        } catch (_err) {
            // Fallback for non-secure contexts (HTTP) or permission denied
            const textarea = document.createElement("textarea")
            textarea.value = text
            textarea.style.position = "fixed"
            textarea.style.left = "-9999px"
            textarea.style.opacity = "0"
            document.body.appendChild(textarea)

            try {
                textarea.select()
                const success = document.execCommand("copy")
                if (!success) {
                    throw new Error("Copy command failed")
                }
                setCopiedMessageId(messageId)
                setTimeout(() => setCopiedMessageId(null), 2000)
            } catch (fallbackErr) {
                console.error("Failed to copy message:", fallbackErr)
                setCopyFailedMessageId(messageId)
                setTimeout(() => setCopyFailedMessageId(null), 2000)
            } finally {
                document.body.removeChild(textarea)
            }
        }
    }

    const applyCodeToDiagram = useCallback(
        async (code: string, language: "xml" | "json"): Promise<boolean> => {
            const raw = String(code || "").trim()
            if (!raw) return false
            const baseXML =
                chartXML ||
                `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
            try {
                if (language === "xml") {
                    const nextXml = raw.includes("<mxfile")
                        ? raw
                        : replaceNodes(baseXML, convertToLegalXml(raw))
                    const err = onDisplayChart(nextXml, true)
                    return !err
                }

                const parsed = JSON.parse(raw)
                if (parsed?.type === "flow_patch") {
                    if (String(parsed?.mode || "").trim() === "replace" && typeof parsed?.full === "string") {
                        const nextXml = String(parsed.full).trim()
                        if (!nextXml) return false
                        const err = onDisplayChart(nextXml, true)
                        return !err
                    }
                    if (Array.isArray(parsed?.operations) && parsed.operations.length > 0) {
                        const editedXml = applyDiagramOperations(baseXML, parsed.operations)
                        const err = onDisplayChart(editedXml, true)
                        return !err
                    }
                }
                if (parsed?.type === "display_diagram" && typeof parsed?.xml === "string") {
                    const nextXml = String(parsed.xml).trim()
                    if (!nextXml) return false
                    const err = onDisplayChart(nextXml, true)
                    return !err
                }
                return false
            } catch {
                return false
            }
        },
        [chartXML, onDisplayChart],
    )

    const handleDisplayChart = useCallback(
        (xml: string) => {
            const currentXml = xml || ""
            const convertedXml = convertToLegalXml(currentXml)
            if (convertedXml !== previousXML.current) {
                // If chartXML is empty, create a default mxfile structure to use with replaceNodes
                // This ensures the XML is properly wrapped in mxfile/diagram/mxGraphModel format
                const baseXML =
                    chartXML ||
                    `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
                const replacedXML = replaceNodes(baseXML, convertedXml)

                const validationError = validateMxCellStructure(replacedXML)
                if (!validationError) {
                    previousXML.current = convertedXml
                    // Skip validation in loadDiagram since we already validated above
                    onDisplayChart(replacedXML, true)
                } else {
                    console.log(
                        "[ChatMessageDisplay] XML validation failed:",
                        validationError,
                    )
                }
            }
        },
        [chartXML, onDisplayChart],
    )

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    useEffect(() => {
        if (!messages.length) {
            assembledXmlRef.current = ""
            previousXML.current = ""
        }
    }, [messages.length])

    useEffect(() => {
        if (editingMessageId && editTextareaRef.current) {
            editTextareaRef.current.focus()
        }
    }, [editingMessageId])

    useEffect(() => {
        messages.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part) => {
                    if (part.type?.startsWith("tool-")) {
                        const toolPart = part as ToolPartLike
                        const { toolCallId, state, input } = toolPart

                        if (state === "output-available") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }))
                        }

                        if (part.type === "tool-display_diagram" && input?.xml) {
                            const xml = String(input.xml)
                            assembledXmlRef.current = xml
                            if (state === "input-streaming" || state === "input-available") {
                                handleDisplayChart(xml)
                            } else if (!processedToolCalls.current.has(toolCallId)) {
                                handleDisplayChart(xml)
                                processedToolCalls.current.add(toolCallId)
                            }
                        }

                        if (part.type === "tool-append_diagram" && input?.xml) {
                            const combinedXml = `${assembledXmlRef.current}${String(input.xml)}`
                            if (state === "input-streaming" || state === "input-available") {
                                handleDisplayChart(combinedXml)
                            } else if (!processedToolCalls.current.has(toolCallId)) {
                                assembledXmlRef.current = combinedXml
                                handleDisplayChart(combinedXml)
                                processedToolCalls.current.add(toolCallId)
                            }
                        }
                    }
                })
            }
        })
    }, [messages, handleDisplayChart, processedToolCalls])

    const renderToolPart = (part: ToolPartLike) => {
        const callId = part.toolCallId
        const { state, input, output } = part
        const isExpanded = expandedTools[callId] ?? true
        const toolName = part.type?.replace("tool-", "")

        const toggleExpanded = () => {
            setExpandedTools((prev) => ({
                ...prev,
                [callId]: !isExpanded,
            }))
        }

        const getToolDisplayName = (name: string) => {
            switch (name) {
                case "display_diagram":
                    return "Generate Diagram"
                case "edit_diagram":
                    return "Edit Diagram"
                case "append_diagram":
                    return "Append Diagram"
                case "get_shape_library":
                    return "Get Shape Library"
                default:
                    return name
            }
        }

        return (
            <div
                key={callId}
                className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Cpu className="w-3.5 h-3.5 text-primary-strong" />
                        </div>
                        <span className="text-sm font-medium text-foreground/80">
                            {getToolDisplayName(toolName)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state === "input-streaming" && (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                        {state === "output-available" && (
                            <span className="text-xs font-medium text-success bg-success/[0.08] px-2 py-0.5 rounded-full">
                                Complete
                            </span>
                        )}
                        {state === "output-error" && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${((toolName === "display_diagram" || toolName === "append_diagram") && !isMxCellXmlComplete(String(input?.xml || ""))) ? "text-yellow-700 bg-yellow-50" : "text-destructive bg-destructive/[0.08]"}`}>
                                {((toolName === "display_diagram" || toolName === "append_diagram") && !isMxCellXmlComplete(String(input?.xml || ""))) ? "Truncated" : "Error"}
                            </span>
                        )}
                        {input && Object.keys(input).length > 0 && (
                            <button
                                type="button"
                                onClick={toggleExpanded}
                                className="p-1 rounded hover:bg-muted transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
                {input && isExpanded && (
                    <div className="px-4 py-3 border-t border-border/40 bg-muted/20">
                        {typeof input === "object" && input.xml ? (
                            <CodeBlock code={input.xml} language="xml" onApply={applyCodeToDiagram} />
                        ) : typeof input === "object" &&
                          input.operations &&
                          Array.isArray(input.operations) ? (
                            <div className="space-y-2">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void applyCodeToDiagram(
                                                JSON.stringify(
                                                    {
                                                        type: "flow_patch",
                                                        mode: "patch",
                                                        operations: input.operations,
                                                    },
                                                    null,
                                                    2,
                                                ),
                                                "json",
                                            )
                                        }
                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                                        title="Apply to canvas"
                                    >
                                        <Play className="h-3 w-3" />
                                        <span>Apply</span>
                                    </button>
                                </div>
                                <OperationsDisplay operations={input.operations} />
                            </div>
                        ) : toolName === "get_shape_library" &&
                          typeof output === "string" ? (
                            <pre className="text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-56 bg-muted/40 rounded px-3 py-2">
                                {output}
                            </pre>
                        ) : typeof input === "object" &&
                          Object.keys(input).length > 0 ? (
                            <CodeBlock
                                code={JSON.stringify(input, null, 2)}
                                language="json"
                                onApply={applyCodeToDiagram}
                            />
                        ) : null}
                    </div>
                )}
                {output && state === "output-error" && (
                    <div className="px-4 py-3 border-t border-border/40 text-sm text-destructive">
                        {output}
                    </div>
                )}
                {output &&
                    toolName === "get_shape_library" &&
                    state === "output-available" && (
                        <div className="px-4 py-3 border-t border-border/40">
                            <pre className="text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-56 bg-muted/40 rounded px-3 py-2">
                                {String(output)}
                            </pre>
                        </div>
                    )}
            </div>
        )
    }

    return (
        <ScrollArea className="h-full w-full scrollbar-thin">
            {messages.length === 0 ? (
                <div className="py-4 px-4" />
            ) : (
                <div className="py-4 px-4 space-y-4">
                    {messages.map((message, messageIndex) => {
                        const userMessageText =
                            message.role === "user"
                                ? getMessageTextContent(message)
                                : ""
                        const isLastAssistantMessage =
                            message.role === "assistant" &&
                            (messageIndex === messages.length - 1 ||
                                messages
                                    .slice(messageIndex + 1)
                                    .every((m) => m.role !== "assistant"))
                        const isLastUserMessage =
                            message.role === "user" &&
                            (messageIndex === messages.length - 1 ||
                                messages
                                    .slice(messageIndex + 1)
                                    .every((m) => m.role !== "user"))
                        const isEditing = editingMessageId === message.id
                        const assistantTextContent = getMessageTextContent(message)
                        const showPendingIndicator =
                            message.role === "user" &&
                            isLastUserMessage &&
                            (isParsingFiles ||
                                status === "submitted" ||
                                status === "streaming")
                        return (
                            <Fragment key={message.id}>
                                <div
                                    className={`flex w-full ${
                                        message.role === "user"
                                            ? "justify-end items-start"
                                            : "justify-start"
                                    } animate-message-in`}
                                    style={{
                                        // Capped: uncapped, the fortieth message
                                        // in a thread waited two seconds before
                                        // it appeared at all.
                                        animationDelay: `${Math.min(messageIndex, 6) * 45}ms`,
                                    }}
                                >
                                <div className="max-w-[95%] min-w-0">
                                    {/* Reasoning blocks - displayed first for assistant messages */}
                                    {message.role === "assistant" &&
                                        message.parts?.map(
                                            (part, partIndex) => {
                                                if (part.type === "reasoning") {
                                                    const reasoningPart =
                                                        part as {
                                                            type: "reasoning"
                                                            text: string
                                                        }
                                                    const isLastPart =
                                                        partIndex ===
                                                        (message.parts
                                                            ?.length ?? 0) -
                                                            1
                                                    const isLastMessage =
                                                        message.id ===
                                                        messages[
                                                            messages.length - 1
                                                        ]?.id
                                                    const isStreamingReasoning =
                                                        status ===
                                                            "streaming" &&
                                                        isLastPart &&
                                                        isLastMessage

                                                    return (
                                                        <Reasoning
                                                            key={`${message.id}-reasoning-${partIndex}`}
                                                            className="w-full"
                                                            isStreaming={
                                                                isStreamingReasoning
                                                            }
                                                            defaultOpen={
                                                                isStreamingReasoning
                                                            }
                                                        >
                                                            <ReasoningTrigger />
                                                            <ReasoningContent>
                                                                {
                                                                    reasoningPart.text
                                                                }
                                                            </ReasoningContent>
                                                        </Reasoning>
                                                    )
                                                }
                                                return null
                                            },
                                        )}
                                    {/* Edit mode for user messages */}
                                    {isEditing && message.role === "user" ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                ref={editTextareaRef}
                                                value={editText}
                                                onChange={(e) =>
                                                    setEditText(e.target.value)
                                                }
                                                className="w-full min-w-[300px] px-4 py-3 text-sm rounded-2xl border border-primary bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                                rows={Math.min(
                                                    editText.split("\n")
                                                        .length + 1,
                                                    6,
                                                )}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        setEditingMessageId(
                                                            null,
                                                        )
                                                        setEditText("")
                                                    } else if (
                                                        e.key === "Enter" &&
                                                        (e.metaKey || e.ctrlKey)
                                                    ) {
                                                        e.preventDefault()
                                                        if (
                                                            editText.trim() &&
                                                            onEditMessage
                                                        ) {
                                                            onEditMessage(
                                                                messageIndex,
                                                                editText.trim(),
                                                            )
                                                            setEditingMessageId(
                                                                null,
                                                            )
                                                            setEditText("")
                                                        }
                                                    }
                                                }}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingMessageId(
                                                            null,
                                                        )
                                                        setEditText("")
                                                    }}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                                                >
                                                    {t("message.edit.cancel")}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (
                                                            editText.trim() &&
                                                            onEditMessage
                                                        ) {
                                                            onEditMessage(
                                                                messageIndex,
                                                                editText.trim(),
                                                            )
                                                            setEditingMessageId(
                                                                null,
                                                            )
                                                            setEditText("")
                                                        }
                                                    }}
                                                    disabled={!editText.trim()}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                >
                                                    {t("message.edit.save")}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Render parts in order, grouping consecutive text/file parts into bubbles */
                                        (() => {
                                            let parts = message.parts || []
                                            // Fallback: map content to parts when SDK returns content directly.
                                            if (parts.length === 0) {
                                                if (
                                                    typeof message.content ===
                                                        "string" &&
                                                    message.content.trim()
                                                ) {
                                                    parts = [
                                                        {
                                                            type: "text",
                                                            text: message.content,
                                                        },
                                                    ]
                                                } else if (
                                                    Array.isArray(
                                                        message.content,
                                                    )
                                                ) {
                                                    parts = message.content
                                                        .map((item: any): UIMessagePart | null => {
                                                            if (
                                                                item?.type ===
                                                                "text"
                                                            ) {
                                                                return {
                                                                    type: "text",
                                                                    text: String(
                                                                        item.text ||
                                                                            "",
                                                                    ),
                                                                }
                                                            }
                                                            if (
                                                                item?.type ===
                                                                    "image_url" &&
                                                                item?.image_url
                                                                    ?.url
                                                            ) {
                                                                return {
                                                                    type: "file",
                                                                    url: item
                                                                        .image_url
                                                                        .url,
                                                                }
                                                            }
                                                            if (
                                                                item?.type ===
                                                                    "image" &&
                                                                (item?.image ||
                                                                    item?.url)
                                                            ) {
                                                                return {
                                                                    type: "file",
                                                                    url:
                                                                        item.image ||
                                                                        item.url,
                                                                }
                                                            }
                                                            if (
                                                                item?.type ===
                                                                    "file" &&
                                                                item?.url
                                                            ) {
                                                                return {
                                                                    type: "file",
                                                                    url: item.url,
                                                                }
                                                            }
                                                            return null
                                                        })
                                                        .filter(
                                                            (part): part is UIMessagePart =>
                                                                part !== null,
                                                        )
                                                }
                                            }

                                            // Some tool-call responses include empty text parts.
                                            // Rendering those creates blank message bubbles.
                                            parts = parts.filter((part: any) => {
                                                if (part.type === "text") {
                                                    return (
                                                        typeof part.text ===
                                                            "string" &&
                                                        part.text.trim().length >
                                                            0
                                                    )
                                                }
                                                if (part.type === "file") {
                                                    return Boolean(part.url)
                                                }
                                                return true
                                            })

                                            const groups: {
                                                type: "content" | "tool"
                                                parts: typeof parts
                                                startIndex: number
                                            }[] = []

                                            parts.forEach((part, index) => {
                                                const isToolPart =
                                                    part.type?.startsWith(
                                                        "tool-",
                                                    )
                                                const isContentPart =
                                                    part.type === "text" ||
                                                    part.type === "file" ||
                                                    part.type === "image" ||
                                                    part.type === "image_url"

                                                if (isToolPart) {
                                                    groups.push({
                                                        type: "tool",
                                                        parts: [part],
                                                        startIndex: index,
                                                    })
                                                } else if (isContentPart) {
                                                    const lastGroup =
                                                        groups[
                                                            groups.length - 1
                                                        ]
                                                    if (
                                                        lastGroup?.type ===
                                                        "content"
                                                    ) {
                                                        lastGroup.parts.push(
                                                            part,
                                                        )
                                                    } else {
                                                        groups.push({
                                                            type: "content",
                                                            parts: [part],
                                                            startIndex: index,
                                                        })
                                                    }
                                                }
                                            })

                                            return groups.map(
                                                (group, groupIndex) => {
                                                    if (group.type === "tool") {
                                                        return renderToolPart(
                                                            group
                                                                .parts[0] as ToolPartLike,
                                                        )
                                                    }

                                                    const attachmentParts = group.parts.filter(
                                                        (p: any) =>
                                                            p.type === "file" ||
                                                            p.type === "image" ||
                                                            p.type === "image_url",
                                                    )
                                                    const textParts = group.parts.filter(
                                                        (p: any) => p.type === "text",
                                                    )
                                                    const fileSections = textParts.flatMap(
                                                        (p: any) =>
                                                            extractFileSectionsFromText(
                                                                String(
                                                                    p.text || "",
                                                                ),
                                                            ),
                                                    )
                                                    const hasTextContent = textParts.some(
                                                        (p: any) =>
                                                            stripFileSectionsFromText(
                                                                String(
                                                                    p.text || "",
                                                                ),
                                                            ).length > 0,
                                                    )

                                                    return (
                                                        <div
                                                            key={`${message.id}-content-${group.startIndex}`}
                                                            className={groupIndex > 0 ? "mt-3" : ""}
                                                        >
                                                            {message.role === "user" &&
                                                                (attachmentParts.length > 0 ||
                                                                    fileSections.length >
                                                                        0) && (
                                                                    <div className="mb-2 flex justify-end">
                                                                        <div className="flex flex-wrap gap-2 max-w-[85%]">
                                                                            {attachmentParts.map((part, partIndex) => {
                                                                                const url =
                                                                                    (part as any).url ||
                                                                                    (part as any).image ||
                                                                                    (part as any).image_url?.url
                                                                                if (!url) return null
                                                                                return (
                                                                                    <Image
                                                                                        key={`${message.id}-att-${group.startIndex}-${partIndex}`}
                                                                                        src={url}
                                                                                        width={96}
                                                                                        height={96}
                                                                                        alt="Uploaded image"
                                                                                        className="rounded-md border border-border"
                                                                                        style={{ objectFit: "cover" }}
                                                                                    />
                                                                                )
                                                                            })}
                                                                            {fileSections.map(
                                                                                (
                                                                                    section,
                                                                                    idx,
                                                                                ) => {
                                                                                    const charDisplay =
                                                                                        section.charCount &&
                                                                                        section.charCount >=
                                                                                            1000
                                                                                            ? `${(section.charCount / 1000).toFixed(1)}k`
                                                                                            : section.charCount
                                                                                    return (
                                                                                        <div
                                                                                            key={`${message.id}-file-top-${group.startIndex}-${idx}`}
                                                                                            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/35 px-2.5 py-1.5"
                                                                                        >
                                                                                            {section.fileType ===
                                                                                            "pdf" ? (
                                                                                                <FileText className="h-4 w-4 text-destructive" />
                                                                                            ) : (
                                                                                                <FileCode className="h-4 w-4 text-primary-strong" />
                                                                                            )}
                                                                                            <span className="text-xs font-medium leading-none">
                                                                                                {
                                                                                                    section.filename
                                                                                                }
                                                                                            </span>
                                                                                            {charDisplay ? (
                                                                                                <span className="text-[10px] text-muted-foreground leading-none">
                                                                                                    {
                                                                                                        charDisplay
                                                                                                    }{" "}
                                                                                                    chars
                                                                                                </span>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    )
                                                                                },
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                        {hasTextContent || message.role !== "user" ? (
                                                            <div className={message.role === "user" ? "flex flex-col items-end gap-1.5" : ""}>
                                                            {message.role === "user" &&
                                                                !isEditing && (
                                                                    <div className="order-2 flex items-center gap-1 self-end">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                copyMessageToClipboard(
                                                                                    message.id,
                                                                                    userMessageText ||
                                                                                        getUserOriginalText(
                                                                                            message,
                                                                                        ),
                                                                                )
                                                                            }
                                                                            className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
                                                                            title={
                                                                                copiedMessageId ===
                                                                                message.id
                                                                                    ? t(
                                                                                          "message.copied",
                                                                                      )
                                                                                    : copyFailedMessageId ===
                                                                                        message.id
                                                                                      ? t(
                                                                                            "message.copy.failed",
                                                                                        )
                                                                                      : t(
                                                                                            "message.copy",
                                                                                        )
                                                                            }
                                                                        >
                                                                            {copiedMessageId ===
                                                                            message.id ? (
                                                                                <Check className="h-3.5 w-3.5 text-success" />
                                                                            ) : copyFailedMessageId ===
                                                                              message.id ? (
                                                                                <X className="h-3.5 w-3.5 text-destructive" />
                                                                            ) : (
                                                                                <Copy className="h-3.5 w-3.5" />
                                                                            )}
                                                                        </button>
                                                                        {onEditMessage &&
                                                                            isLastUserMessage && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setEditingMessageId(
                                                                                            message.id,
                                                                                        )
                                                                                        setEditText(
                                                                                            getUserOriginalText(
                                                                                                message,
                                                                                            ),
                                                                                        )
                                                                                    }}
                                                                                    className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
                                                                                    title={t(
                                                                                        "message.edit",
                                                                                    )}
                                                                                >
                                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            )}
                                                                    </div>
                                                                )}
                                                            <div
                                                                // Same split as the other two panels: only the user's
                                                                // turn is a card. This had it backwards -- the assistant
                                                                // carried the bubble while the user's `bg-background`
                                                                // matched the page ground and read as no bubble at all.
                                                                className={`order-1 w-full text-sm leading-relaxed ${
                                                                message.role ===
                                                                "user"
                                                                    ? "px-4 py-3 bg-muted text-foreground rounded-2xl rounded-br-md border border-border/60 transition-[background-color] duration-fast ease-out-soft"
                                                                    : message.role ===
                                                                        "system"
                                                                      ? "px-4 py-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl rounded-bl-md"
                                                                      : "py-1 text-foreground"
                                                            } ${message.role === "user" && isLastUserMessage && onEditMessage ? "cursor-pointer hover:bg-accent" : ""}`}
                                                            role={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? "button"
                                                                    : undefined
                                                            }
                                                            tabIndex={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? 0
                                                                    : undefined
                                                            }
                                                            onClick={() => {
                                                                if (
                                                                    message.role ===
                                                                        "user" &&
                                                                    isLastUserMessage &&
                                                                    onEditMessage
                                                                ) {
                                                                    setEditingMessageId(
                                                                        message.id,
                                                                    )
                                                                    setEditText(
                                                                        getUserOriginalText(
                                                                            message,
                                                                        ),
                                                                    )
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    (e.key ===
                                                                        "Enter" ||
                                                                        e.key ===
                                                                            " ") &&
                                                                    message.role ===
                                                                        "user" &&
                                                                    isLastUserMessage &&
                                                                    onEditMessage
                                                                ) {
                                                                    e.preventDefault()
                                                                    setEditingMessageId(
                                                                        message.id,
                                                                    )
                                                                    setEditText(
                                                                        getUserOriginalText(
                                                                            message,
                                                                        ),
                                                                    )
                                                                }
                                                            }}
                                                                title={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? t("message.edit")
                                                                    : undefined
                                                            }
                                                        >
                                                                {textParts.map(
                                                                (
                                                                    part,
                                                                    partIndex,
                                                                ) => {
                                                                    if (
                                                                        part.type ===
                                                                        "text"
                                                                    ) {
                                                                        const textContent = String(
                                                                            part.text ?? "",
                                                                        )
                                                                        const sections = splitTextIntoFileSections(
                                                                            textContent,
                                                                        ).filter(
                                                                            (s) =>
                                                                                s.type ===
                                                                                "text",
                                                                        )
                                                                        return (
                                                                            <div
                                                                                key={`${message.id}-text-${group.startIndex}-${partIndex}`}
                                                                                className="space-y-2"
                                                                            >
                                                                                {sections.map(
                                                                                    (
                                                                                        section,
                                                                                        sectionIndex,
                                                                                    ) => {
                                                                                        // Regular text section
                                                                                        return message.role ===
                                                                                            "user" ? (
                                                                                            <div
                                                                                                key={`${message.id}-textsection-${partIndex}-${sectionIndex}`}
                                                                                                className="whitespace-pre-wrap break-words"
                                                                                            >
                                                                                                {section.content}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div
                                                                                                key={`${message.id}-textsection-${partIndex}-${sectionIndex}`}
                                                                                                className={cn(
                                                                                                    "prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                                                                                                )}
                                                                                            >
                                                                                                <ReactMarkdown
                                                                                                    remarkPlugins={[remarkGfm]}
                                                                                                    components={{
                                                                                                        table({
                                                                                                            children,
                                                                                                            ...props
                                                                                                        }: any) {
                                                                                                            return (
                                                                                                                <div className="prose-scroll-x my-4">
                                                                                                                    <table
                                                                                                                        {...props}
                                                                                                                        className={cn("my-0", props?.className)}
                                                                                                                    >
                                                                                                                        {children}
                                                                                                                    </table>
                                                                                                                </div>
                                                                                                            )
                                                                                                        },
                                                                                                        code({
                                                                                                            className,
                                                                                                            children,
                                                                                                            ...props
                                                                                                        }: any) {
                                                                                                            if (
                                                                                                                !isFencedCode(className, children)
                                                                                                            ) {
                                                                                                                return (
                                                                                                                    <code
                                                                                                                        className={
                                                                                                                            className
                                                                                                                        }
                                                                                                                        {...props}
                                                                                                                    >
                                                                                                                        {
                                                                                                                            children
                                                                                                                        }
                                                                                                                    </code>
                                                                                                                )
                                                                                                            }
                                                                                                            const match =
                                                                                                                /language-(\w+)/.exec(
                                                                                                                    String(
                                                                                                                        className ||
                                                                                                                            "",
                                                                                                                    ),
                                                                                                                )
                                                                                                            const lang =
                                                                                                                String(
                                                                                                                    match?.[1] ||
                                                                                                                        "",
                                                                                                                ).toLowerCase()
                                                                                                            const codeText =
                                                                                                                String(
                                                                                                                    children ||
                                                                                                                        "",
                                                                                                                ).replace(
                                                                                                                    /\n$/,
                                                                                                                    "",
                                                                                                                )
                                                                                                            const normalizedLang:
                                                                                                                | "xml"
                                                                                                                | "json"
                                                                                                                | null =
                                                                                                                lang ===
                                                                                                                    "json" ||
                                                                                                                lang ===
                                                                                                                    "xml"
                                                                                                                    ? lang
                                                                                                                    : null
                                                                                                            if (!normalizedLang) {
                                                                                                                return (
                                                                                                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 px-3 py-2 text-[12px] leading-relaxed">
                                                                                                                        <code
                                                                                                                            className={
                                                                                                                                className
                                                                                                                            }
                                                                                                                            {...props}
                                                                                                                        >
                                                                                                                            {codeText}
                                                                                                                        </code>
                                                                                                                    </pre>
                                                                                                                )
                                                                                                            }
                                                                                                            return (
                                                                                                                <CodeBlock
                                                                                                                    code={
                                                                                                                        codeText
                                                                                                                    }
                                                                                                                    language={
                                                                                                                        normalizedLang
                                                                                                                    }
                                                                                                                    onApply={
                                                                                                                        applyCodeToDiagram
                                                                                                                    }
                                                                                                                />
                                                                                                            )
                                                                                                        },
                                                                                                    }}
                                                                                                >
                                                                                                    {section.content}
                                                                                                </ReactMarkdown>
                                                                                            </div>
                                                                                        )
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    }
                                                                    return null
                                                                },
                                                            )}
                                                        </div>
                                                        </div>
                                                        ) : null}
                                                        </div>
                                                    )
                                                },
                                            )
                                        })()
                                    )}
                                    {/* Action buttons for assistant messages */}
                                    {message.role === "assistant" &&
                                        assistantTextContent.trim().length > 0 && (
                                        <div className="flex items-center gap-1 mt-2">
                                            {/* Copy button */}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyMessageToClipboard(
                                                        message.id,
                                                        getMessageTextContent(
                                                            message,
                                                        ),
                                                    )
                                                }
                                                className={`p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                                                    copiedMessageId ===
                                                    message.id
                                                        ? "text-success bg-success/15"
                                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                                }`}
                                                title={
                                                    copiedMessageId ===
                                                    message.id
                                                        ? t("message.copied")
                                                        : t("message.copy")
                                                }
                                            >
                                                {copiedMessageId ===
                                                message.id ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                            {/* Regenerate button - only on last assistant message, not for cached examples */}
                                            {onRegenerate &&
                                                isLastAssistantMessage &&
                                                !message.parts?.some((p: any) =>
                                                    p.toolCallId?.startsWith(
                                                        "cached-",
                                                    ),
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            onRegenerate(messageIndex)
                                                        }}
                                                        className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent cursor-pointer relative z-10"
                                                        title={t("message.regenerate")}
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                        </div>
                                        )}
                                </div>
                                </div>
                                {showPendingIndicator && (
                                    <div className="flex w-full justify-start animate-message-in mt-3">
                                        <div className="max-w-[85%] min-w-0">
                                            <Shimmer as="span" className="py-1 text-sm" duration={1.6}>
                                                {isParsingFiles
                                                    ? t("message.parsing_files")
                                                    : t("message.thinking")}
                                            </Shimmer>
                                        </div>
                                    </div>
                                )}
                            </Fragment>
                        )
                    })}
                </div>
            )}
            <div ref={messagesEndRef} />
        </ScrollArea>
    )
}

