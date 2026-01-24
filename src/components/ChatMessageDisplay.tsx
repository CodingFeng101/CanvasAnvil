import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Cpu,
    FileCode,
    FileText,
    Loader2,
    Minus,
    Pencil,
    Plus,
    RotateCcw,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

// Types
export interface MessagePart {
    type: 'text' | 'reasoning' | 'tool-call' | 'tool-result' | 'file';
    text?: string;
    toolName?: string;
    toolCallId?: string;
    state?: string;
    input?: any;
    output?: string;
    url?: string; // for images
}

export interface UIMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string; // Fallback
    parts?: MessagePart[];
}

interface ChatMessageDisplayProps {
    messages: UIMessage[];
    setInput: (input: string) => void;
    onRegenerate?: (messageIndex: number) => void;
    onEditMessage?: (messageIndex: number, newText: string) => void;
    status?: "streaming" | "submitted" | "idle" | "error" | "ready";
    onDisplayChart?: (xml: string) => void; // Callback for diagram display
}

// Helper to split text content into regular text and file sections
interface TextSection {
    type: "text" | "file";
    content: string;
    filename?: string;
    charCount?: number;
    fileType?: "pdf" | "text";
}

function splitTextIntoFileSections(text: string): TextSection[] {
    const sections: TextSection[] = [];
    const filePattern = /\[(PDF|File):\s*([^\]]+)\]\n([\s\S]*?)(?=\n\n\[(PDF|File):|$)/g;
    let lastIndex = 0;
    let match;

    while ((match = filePattern.exec(text)) !== null) {
        const beforeText = text.slice(lastIndex, match.index).trim();
        if (beforeText) {
            sections.push({ type: "text", content: beforeText });
        }

        const fileType = match[1].toLowerCase() === "pdf" ? "pdf" : "text";
        const filename = match[2].trim();
        const fileContent = match[3].trim();
        sections.push({
            type: "file",
            content: fileContent,
            filename,
            charCount: fileContent.length,
            fileType,
        });

        lastIndex = match.index + match[0].length;
    }

    const remainingText = text.slice(lastIndex).trim();
    if (remainingText) {
        sections.push({ type: "text", content: remainingText });
    }

    if (sections.length === 0) {
        sections.push({ type: "text", content: text });
    }

    return sections;
}

const getMessageTextContent = (message: UIMessage): string => {
    if (message.parts && message.parts.length > 0) {
        return message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text || "")
            .join("\n");
    }
    return message.content || "";
};

const getUserOriginalText = (message: UIMessage): string => {
    const fullText = getMessageTextContent(message);
    const filePattern = /\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/;
    return fullText.replace(filePattern, "").trim();
};

export function ChatMessageDisplay({
    messages,
    setInput,
    onRegenerate,
    onEditMessage,
    status = "idle",
    onDisplayChart
}: ChatMessageDisplayProps) {
    const scrollRootRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [editText, setEditText] = useState<string>("");
    const [expandedPdfSections, setExpandedPdfSections] = useState<Record<string, boolean>>({});
    const [isAtBottom, setIsAtBottom] = useState(true);

    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const getViewport = useCallback(() => {
        const root = scrollRootRef.current;
        if (!root) return null;
        return root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const viewport = getViewport();
        if (!viewport) return;
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    }, [getViewport]);

    useEffect(() => {
        const viewport = getViewport();
        if (!viewport) return;

        const onScroll = () => {
            const threshold = 48;
            const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
            setIsAtBottom(distanceToBottom <= threshold);
        };

        onScroll();
        viewport.addEventListener("scroll", onScroll, { passive: true });
        return () => viewport.removeEventListener("scroll", onScroll as any);
    }, [getViewport]);

    useEffect(() => {
        if (!isAtBottom) return;
        scrollToBottom(status === "streaming" ? "auto" : "smooth");
    }, [messages, status, isAtBottom, scrollToBottom]);

    useEffect(() => {
        if (editingMessageId && editTextareaRef.current) {
            editTextareaRef.current.focus();
        }
    }, [editingMessageId]);

    // Handle Diagram Code Blocks
    // We scan messages for XML blocks and trigger onDisplayChart if found
    // This is a simplified version of tool calls for now
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && onDisplayChart) {
            const content = getMessageTextContent(lastMessage);
            const match = content.match(/```xml\n([\s\S]*?)\n```/);
            if (match && match[1]) {
                // De-duplicate: only call if it's new or stable
                // Since we don't track state here, we rely on parent or idempotency
                // onDisplayChart(match[1]); 
                // Actually, let's not auto-call here to avoid loops. 
                // The parent (ChatPanel) handles parsing stream.
            }
        }
    }, [messages, onDisplayChart]);

    return (
        <div ref={scrollRootRef} className="h-full w-full relative">
            <ScrollArea className="h-full w-full scrollbar-thin">
                <div className="py-4 px-4 space-y-6">
                    {messages.map((message, messageIndex) => {
                    const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                    const isLastAssistantMessage = message.role === "assistant" && messageIndex === messages.length - 1;
                    const isLastUserMessage = message.role === "user" && messageIndex === messages.length - 1;
                    const isEditing = editingMessageId === message.id;

                    return (
                        <div
                            key={message.id}
                            className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div className={cn("max-w-[95%] min-w-0 flex flex-col", message.role === "user" ? "items-end" : "items-start")}>
                                {/* Role Icon / Header */}
                                <div className="flex items-center gap-2 mb-1.5 px-1">
                                    {message.role === 'assistant' ? (
                                        <>
                                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                                <Cpu className="w-3 h-3 text-white" />
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">AI 助手</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xs font-medium text-muted-foreground">You</span>
                                        </>
                                    )}
                                </div>

                                {/* Content Bubble */}
                                <div className={cn(
                                    "relative px-4 py-3 text-sm leading-relaxed shadow-sm break-words overflow-hidden",
                                    message.role === "user" 
                                        ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm" 
                                        : "bg-white dark:bg-zinc-800 border border-border/40 text-foreground rounded-2xl rounded-tl-sm w-full"
                                )}>
                                    
                                    {/* Reasoning Parts */}
                                    {message.parts?.map((part, partIndex) => {
                                        if (part.type === 'reasoning') {
                                            const isLastPart = partIndex === (message.parts?.length ?? 0) - 1;
                                            const isStreamingReasoning = status === "streaming" && isLastPart && isLastAssistantMessage;
                                            return (
                                                <Reasoning
                                                    key={`reasoning-${partIndex}`}
                                                    className="w-full"
                                                    isStreaming={isStreamingReasoning}
                                                    defaultOpen={isStreamingReasoning}
                                                >
                                                    <ReasoningTrigger />
                                                    <ReasoningContent>{part.text || ''}</ReasoningContent>
                                                </Reasoning>
                                            );
                                        }
                                        return null;
                                    })}

                                    {/* Text Content */}
                                    {(() => {
                                        const text = getMessageTextContent(message);
                                        if (!text) return null;
                                        
                                        // Edit Mode
                                        if (isEditing && message.role === "user") {
                                            return (
                                                <div className="flex flex-col gap-2 min-w-[300px]">
                                                    <textarea
                                                        ref={editTextareaRef}
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                                        rows={4}
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setEditingMessageId(null)}
                                                            className="px-3 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-foreground"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (editText.trim() && onEditMessage) {
                                                                    onEditMessage(messageIndex, editText.trim());
                                                                    setEditingMessageId(null);
                                                                }
                                                            }}
                                                            className="px-3 py-1 text-xs rounded bg-primary hover:bg-primary/90 text-primary-foreground"
                                                        >
                                                            Save
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Regular Display
                                        const sections = splitTextIntoFileSections(text);
                                        return (
                                            <div className={cn("space-y-3", message.role === "user" ? "text-primary-foreground dark:text-white" : "")}>
                                                {sections.map((section, idx) => {
                                                    if (section.type === 'file') {
                                                        const key = `${message.id}-file-${idx}`;
                                                        const isExpanded = expandedPdfSections[key] || false;
                                                        return (
                                                            <div key={key} className="rounded-lg border border-border/50 bg-background/50 overflow-hidden">
                                                                <button
                                                                    onClick={() => setExpandedPdfSections(prev => ({...prev, [key]: !isExpanded}))}
                                                                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        {section.fileType === 'pdf' ? (
                                                                            <FileText className="h-4 w-4 text-red-500" />
                                                                        ) : (
                                                                            <FileCode className="h-4 w-4 text-blue-500" />
                                                                        )}
                                                                        <span className="text-xs font-medium truncate max-w-[150px] text-foreground">{section.filename}</span>
                                                                        <span className="text-[10px] text-muted-foreground">({section.charCount} chars)</span>
                                                                    </div>
                                                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-foreground" /> : <ChevronDown className="h-4 w-4 text-foreground" />}
                                                                </button>
                                                                {isExpanded && (
                                                                    <div className="px-3 py-2 border-t border-border/50 max-h-48 overflow-y-auto bg-muted/20">
                                                                        <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground font-mono">{section.content}</pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                    
                                                    // Render Markdown
                                                    // We need to handle code blocks specially to use our CodeBlock component
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "prose prose-sm max-w-none break-words",
                                                            message.role === "user" ? "prose-invert" : "dark:prose-invert"
                                                        )}>
                                                            <ReactMarkdown 
                                                                remarkPlugins={[remarkGfm]}
                                                                components={{
                                                                    code({node, inline, className, children, ...props}: any) {
                                                                        const match = /language-(\w+)/.exec(className || '')
                                                                        // Check if this is the last message and currently streaming
                                                                        // We only show spinner for the last code block of the last message if streaming
                                                                        // But technically ReactMarkdown renders progressively.
                                                                        // We can check if status is streaming and this is the assistant role.
                                                                        const isStreaming = status === "streaming" && isLastAssistantMessage;
                                                                        
                                                                        return !inline && match ? (
                                                                            <CodeBlock
                                                                                code={String(children).replace(/\n$/, '')}
                                                                                language={match[1] as any}
                                                                                isStreaming={isStreaming}
                                                                            />
                                                                        ) : (
                                                                            <code className={className} {...props}>
                                                                                {children}
                                                                            </code>
                                                                        )
                                                                    }
                                                                }}
                                                            >
                                                                {section.content}
                                                            </ReactMarkdown>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    {/* Loading Indicator */}
                                    {isLastAssistantMessage && status === "streaming" && (
                                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            <span>Thinking...</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                                    {message.role === "user" && !isEditing && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setEditingMessageId(message.id);
                                                    setEditText(getUserOriginalText(message));
                                                }}
                                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                                title="Edit"
                                            >
                                                <Pencil className="h-3 w-3" />
                                            </button>
                                            <button
                                                onClick={() => copyMessageToClipboard(message.id, getUserOriginalText(message))}
                                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                                title="Copy"
                                            >
                                                {copiedMessageId === message.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </button>
                                        </>
                                    )}
                                    {message.role === "assistant" && (
                                        <>
                                            <button
                                                onClick={() => copyMessageToClipboard(message.id, getMessageTextContent(message))}
                                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                                title="Copy"
                                            >
                                                {copiedMessageId === message.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </button>
                                            {onRegenerate && isLastAssistantMessage && (
                                                <button
                                                    onClick={() => onRegenerate(messageIndex)}
                                                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                                                    title="Regenerate"
                                                >
                                                    <RotateCcw className="h-3 w-3" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>
            {!isAtBottom && messages.length > 0 && (
                <button
                    type="button"
                    onClick={() => scrollToBottom("smooth")}
                    className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1 rounded-full border border-border bg-background/90 backdrop-blur px-3 py-1.5 text-xs text-foreground shadow-md hover:bg-background"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                    回到底部
                </button>
            )}
        </div>
    );
}
