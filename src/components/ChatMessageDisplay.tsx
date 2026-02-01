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
    Presentation, // Import P icon if available, otherwise we use SVG
} from "lucide-react";

// Custom P icon component
const PIcon = ({ className }: { className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M8 20V4h6a4 4 0 0 1 0 8H8" />
    </svg>
);
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeBlock } from "@/components/ui/code-block";
import { useUiLanguage } from "@/lib/use-ui-language";
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

type PptSlideTag = { n: number; title?: string };

function extractPptSlideTags(text: string): { tags: PptSlideTag[]; rest: string } {
    const lines = String(text || "").split(/\r?\n/);
    const tags: PptSlideTag[] = [];
    const restLines: string[] = [];
    for (const line of lines) {
        const m = line.match(/^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/);
        if (m) {
            const n = Number(m[1]);
            const title = String(m[2] || "").trim();
            if (!Number.isNaN(n)) tags.push({ n, title: title || undefined });
            continue;
        }
        restLines.push(line);
    }
    const rest = restLines.join("\n").replace(/^\s+|\s+$/g, "");
    return { tags, rest };
}

type ImageTag = { name?: string; url: string };

function extractImageTags(text: string): { images: ImageTag[]; rest: string } {
    const lines = String(text || "").split(/\r?\n/);
    const images: ImageTag[] = [];
    const restLines: string[] = [];
    for (const line of lines) {
        const m = line.match(/^\[\[IMAGE\|([^|]*)\|([\s\S]+)\]\]$/);
        if (m) {
            const name = String(m[1] || "").trim();
            const url = String(m[2] || "").trim();
            if (url.startsWith("data:image") || url.startsWith("blob:") || url.startsWith("http://") || url.startsWith("https://")) {
                images.push({ name: name || undefined, url });
                continue;
            }
        }
        restLines.push(line);
    }
    const rest = restLines.join("\n").replace(/^\s+|\s+$/g, "");
    return { images, rest };
}

type InlinePptPart =
    | { type: "text"; text: string }
    | { type: "ppt"; n: number; title?: string };

function splitInlinePptTags(text: string): InlinePptPart[] {
    const raw = String(text || "");
    const out: InlinePptPart[] = [];
    const re = /\[\[PPT_SLIDE\|(\d+)\|([\s\S]*?)\]\]/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
        const before = raw.slice(lastIndex, m.index);
        if (before) out.push({ type: "text", text: before });
        const n = Number(m[1]);
        const title = String(m[2] || "").trim();
        if (!Number.isNaN(n)) out.push({ type: "ppt", n, title: title || undefined });
        else out.push({ type: "text", text: m[0] });
        lastIndex = m.index + m[0].length;
    }
    const rest = raw.slice(lastIndex);
    if (rest) out.push({ type: "text", text: rest });
    if (out.length === 0) out.push({ type: "text", text: raw });
    return out;
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
    const withoutTags = fullText
        .split(/\r?\n/)
        .filter((line) => !/^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/.test(line))
        .filter((line) => !/^\[\[IMAGE\|([^|]*)\|([\s\S]+)\]\]$/.test(line))
        .join("\n")
        .trim();
    const filePattern = /\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/;
    return withoutTags.replace(filePattern, "").trim();
};

export function ChatMessageDisplay({
    messages,
    setInput,
    onRegenerate,
    onEditMessage,
    status = "idle",
    onDisplayChart
}: ChatMessageDisplayProps) {
    const uiLang = useUiLanguage();
    const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
    const scrollRootRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [editText, setEditText] = useState<string>("");
    const [expandedPdfSections, setExpandedPdfSections] = useState<Record<string, boolean>>({});
    const [isAtBottom, setIsAtBottom] = useState(true);
    const scrollRafRef = useRef<number | null>(null);

    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (_err) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);

            try {
                textarea.select();
                const ok = document.execCommand("copy");
                if (!ok) throw new Error("Copy command failed");
                setCopiedMessageId(messageId);
                setTimeout(() => setCopiedMessageId(null), 2000);
            } catch (fallbackErr) {
                console.error("Failed to copy message:", fallbackErr);
            } finally {
                document.body.removeChild(textarea);
            }
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
        return () => {
            if (scrollRafRef.current === null) return;
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(scrollRafRef.current);
            else if (typeof window !== "undefined") window.clearTimeout(scrollRafRef.current);
            scrollRafRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!isAtBottom) return;
        if (scrollRafRef.current !== null) return;
        const behavior: ScrollBehavior = status === "streaming" ? "auto" : "smooth";
        const schedule = (cb: () => void) => {
            if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
            if (typeof window !== "undefined") return window.setTimeout(cb, 16);
            return 0;
        };
        scrollRafRef.current = schedule(() => {
            scrollRafRef.current = null;
            scrollToBottom(behavior);
        });
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
                <div className="py-5 px-5 space-y-5">
                    {messages.map((message, messageIndex) => {
                    const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                    const isLastAssistantMessage =
                        message.role === "assistant" &&
                        (messageIndex === messages.length - 1 || messages.slice(messageIndex + 1).every((m) => m.role !== "assistant"));
                    const isLastUserMessage =
                        message.role === "user" &&
                        (messageIndex === messages.length - 1 || messages.slice(messageIndex + 1).every((m) => m.role !== "user"));
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
                                            <span className="text-xs font-medium text-muted-foreground">{tr("AI 助手", "AI Assistant")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xs font-medium text-muted-foreground">{tr("你", "You")}</span>
                                        </>
                                    )}
                                </div>

                                {/* Content Bubble */}
                                <div className={cn(
                                    "relative px-4 py-3 text-sm leading-relaxed break-words overflow-hidden border border-border/50 bg-background/70 backdrop-blur-md shadow-sm transition-shadow hover:shadow-md",
                                    message.role === "user" 
                                        ? "text-foreground rounded-2xl rounded-tr-sm w-full"
                                        : "text-foreground rounded-2xl rounded-tl-sm w-full"
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
                                        const raw = getMessageTextContent(message);
                                        const { images, rest: withoutImages } = extractImageTags(raw);
                                        const { tags: pptTags, rest: text } = extractPptSlideTags(withoutImages);
                                        if (!text && images.length === 0) return null;
                                        
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
                                                            {tr("取消", "Cancel")}
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
                                                            {tr("重新发送", "Resend")}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Regular Display
                                        const sections = splitTextIntoFileSections(text);
                                        return (
                                            <div className="space-y-3">
                                                {images.length > 0 && (
                                                    <div className="space-y-2">
                                                        {images.map((img, i) => (
                                                            <div
                                                                key={`${message.id}-img-${i}`}
                                                                className={cn(
                                                                    "overflow-hidden rounded-lg border border-border/60 bg-black/5 dark:bg-white/5",
                                                                    "max-w-[420px] mx-auto"
                                                                )}
                                                            >
                                                                <img
                                                                    src={img.url}
                                                                    alt={img.name || "image"}
                                                                    className="w-full max-h-[240px] object-contain bg-black/5"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {pptTags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pptTags.map((t, i) => (
                                                            <span
                                                                key={`${message.id}-ppttag-${i}-${t.n}`}
                                                                className={cn(
                                                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4",
                                                                    message.role === "user"
                                                                        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200"
                                                                        : "border-border bg-muted/40 text-foreground"
                                                                )}
                                                            >
                                                                <PIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-200 mr-1" />
                                                                {t.title ? tr(`第 ${t.n} 页：${t.title}`, `Slide ${t.n}: ${t.title}`) : tr(`第 ${t.n} 页`, `Slide ${t.n}`)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {sections.map((section, idx) => {
                                                    if (section.type === "text" && !String(section.content || "").trim()) return null;
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
                                                    let codeBlockOrdinal = 0;
                                                    if (message.role === "user") {
                                                        const parts = splitInlinePptTags(section.content);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className="text-[15px] leading-6 whitespace-pre-wrap break-words text-foreground"
                                                            >
                                                                {parts.map((p, j) => {
                                                                    if (p.type === "text") return <span key={`${idx}-t-${j}`}>{p.text}</span>;
                                                                    const label = p.title ? tr(`第 ${p.n} 页：${p.title}`, `Slide ${p.n}: ${p.title}`) : tr(`第 ${p.n} 页`, `Slide ${p.n}`);
                                                                    return (
                                                                        <span
                                                                            key={`${idx}-ppt-${j}`}
                                                                            className="mx-1 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200 align-middle"
                                                                            title={tr(`幻灯片 · ${label}`, `Slide · ${label}`)}
                                                                        >
                                                                            <PIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-200" />
                                                                            {label}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "prose prose-sm max-w-none break-words",
                                                            "dark:prose-invert"
                                                        )}>
                                                            <ReactMarkdown 
                                                                remarkPlugins={[remarkGfm]}
                                                                urlTransform={(url) => {
                                                                    const u = String(url || "");
                                                                    if (!u) return "";
                                                                    if (u.startsWith("http://") || u.startsWith("https://")) return u;
                                                                    if (u.startsWith("data:image")) return u;
                                                                    if (u.startsWith("blob:")) return u;
                                                                    if (u.startsWith("/files/")) return u;
                                                                    if (u.startsWith("#")) return u;
                                                                    return "";
                                                                }}
                                                                components={{
                                                                    table({ children }: any) {
                                                                        return <table className="w-full table-fixed">{children}</table>;
                                                                    },
                                                                    th({ children, ...props }: any) {
                                                                        return (
                                                                            <th
                                                                                {...props}
                                                                                className={cn("whitespace-normal break-words", props?.className)}
                                                                            >
                                                                                {children}
                                                                            </th>
                                                                        );
                                                                    },
                                                                    td({ children, ...props }: any) {
                                                                        return (
                                                                            <td
                                                                                {...props}
                                                                                className={cn("whitespace-normal break-words", props?.className)}
                                                                            >
                                                                                {children}
                                                                            </td>
                                                                        );
                                                                    },
                                                                    pre({ children }: any) {
                                                                        return <>{children}</>;
                                                                    },
                                                                    code({node, inline, className, children, ...props}: any) {
                                                                        const match = /language-(\w+)/.exec(className || '')
                                                                        // Check if this is the last message and currently streaming
                                                                        // We only show spinner for the last code block of the last message if streaming
                                                                        // But technically ReactMarkdown renders progressively.
                                                                        // We can check if status is streaming and this is the assistant role.
                                                                        const isStreaming = status === "streaming" && isLastAssistantMessage;
                                                                        const language = match?.[1] || "text";

                                                                        if (!inline) {
                                                                            const ordinal = codeBlockOrdinal++;
                                                                            return (
                                                                                <CodeBlock
                                                                                    key={`codeblock-${message.id}-${idx}-${language}-${ordinal}`}
                                                                                    blockId={`${message.id}:${idx}:${language}:${ordinal}`}
                                                                                    code={String(children).replace(/\n$/, '')}
                                                                                    language={language as any}
                                                                                    isStreaming={isStreaming}
                                                                                />
                                                                            );
                                                                        }

                                                                        return (
                                                                            <code className={className} {...props}>
                                                                                {children}
                                                                            </code>
                                                                        );
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
                                            <span>{tr("思考中...", "Thinking...")}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 mt-2 px-1">
                                    {message.role === "user" && !isEditing && userMessageText && (
                                        <>
                                            {onEditMessage && isLastUserMessage && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingMessageId(message.id);
                                                        setEditText(getUserOriginalText(message));
                                                    }}
                                                    className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                                                    title={tr("编辑", "Edit")}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => copyMessageToClipboard(message.id, getUserOriginalText(message))}
                                                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                                                title={tr("复制", "Copy")}
                                            >
                                                {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                        </>
                                    )}
                                    {message.role === "assistant" && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => copyMessageToClipboard(message.id, getMessageTextContent(message))}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    copiedMessageId === message.id
                                                        ? "text-green-600 bg-green-100 dark:bg-green-950/30"
                                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                                }`}
                                                title={tr("复制", "Copy")}
                                            >
                                                {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                            {onRegenerate && isLastAssistantMessage && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRegenerate(messageIndex)}
                                                    className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                                                    title={tr("重新生成", "Regenerate")}
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" />
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
                    {tr("回到底部", "Back to bottom")}
                </button>
            )}
        </div>
    );
}
