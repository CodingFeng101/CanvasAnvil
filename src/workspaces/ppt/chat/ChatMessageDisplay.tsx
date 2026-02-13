import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
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
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/workspaces/ppt/chat/components/reasoning";
import { ScrollArea } from "@/workspaces/ppt/ui/scroll-area";
import { CodeBlock } from "@/workspaces/ppt/ui/code-block";
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

interface PptEditSlidePatch {
    id?: string;
    [key: string]: any;
}

interface PptToolPayload {
    type: "ppt_edit";
    slides: PptEditSlidePatch[];
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

type PptSlideTag = { n: number; title?: string; kind?: "outline" | "slide_image" };

function extractPptSlideTags(text: string): { tags: PptSlideTag[]; rest: string } {
    const lines = String(text || "").split(/\r?\n/);
    const tags: PptSlideTag[] = [];
    const restLines: string[] = [];
    for (const line of lines) {
        const m = line.match(/^\[\[PPT_SLIDE\|(\d+)\|([^|]*)\|(outline|slide_image)\]\]$/);
        if (m) {
            const n = Number(m[1]);
            const title = String(m[2] || "").trim();
            const kind = m[3] as "outline" | "slide_image";
            if (!Number.isNaN(n)) tags.push({ n, title: title || undefined, kind });
            continue;
        }
        const legacy = line.match(/^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/);
        if (legacy) {
            const n = Number(legacy[1]);
            const title = String(legacy[2] || "").trim();
            if (!Number.isNaN(n)) tags.push({ n, title: title || undefined, kind: "slide_image" });
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
    | { type: "ppt"; n: number; title?: string; kind?: "outline" | "slide_image" };

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
        if (!Number.isNaN(n)) {
            let kind: "outline" | "slide_image" = "slide_image";
            let normalizedTitle = title;
            const parts = title.split("|");
            if (parts.length >= 2) {
                const maybeKind = parts[parts.length - 1].trim();
                if (maybeKind === "outline" || maybeKind === "slide_image") {
                    kind = maybeKind;
                    normalizedTitle = parts.slice(0, -1).join("|").trim();
                }
            }
            out.push({ type: "ppt", n, title: normalizedTitle || undefined, kind });
        }
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
    const filePattern = /\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/;
    return fullText.replace(filePattern, "").trim();
};

function extractPptToolPayload(text: string): PptToolPayload | null {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = (fenced?.[1] ?? raw).trim();
    let parsed: any;
    try {
        parsed = JSON.parse(candidate);
    } catch {
        return null;
    }
    if (Array.isArray(parsed)) {
        return { type: "ppt_edit", slides: parsed.filter((s: any) => s && typeof s === "object") };
    }
    if (!parsed || typeof parsed !== "object") return null;
    const typeRaw = String((parsed as any).type || "").trim().toLowerCase();
    if (typeRaw && typeRaw !== "ppt_edit") return null;
    const type: "ppt_edit" = "ppt_edit";
    const slides = Array.isArray((parsed as any).slides)
        ? (parsed as any).slides.filter((s: any) => s && typeof s === "object")
        : [];
    return slides.length > 0 ? { type, slides } : null;
}

function getSlideNumber(slide: PptEditSlidePatch, index: number): number {
    const id = String(slide?.id || "");
    const m = id.match(/slide-(\d+)/i);
    if (m) {
        const n = Number(m[1]);
        if (!Number.isNaN(n)) return n;
    }
    return index + 1;
}

function slidePatchEntries(slide: PptEditSlidePatch): Array<{ key: string; value: string }> {
    const keys = ["title", "description", "layout", "note", "content"];
    const rows: Array<{ key: string; value: string }> = [];
    for (const key of keys) {
        if (!(key in slide)) continue;
        const raw = (slide as any)[key];
        if (Array.isArray(raw)) {
            const text = raw.map((x) => String(x || "").trim()).filter(Boolean).join("；");
            rows.push({ key, value: text || "（空）" });
            continue;
        }
        if (raw && typeof raw === "object") {
            rows.push({ key, value: JSON.stringify(raw) });
            continue;
        }
        rows.push({ key, value: String(raw ?? "").trim() || "（空）" });
    }
    for (const [k, v] of Object.entries(slide)) {
        if (k === "id" || keys.includes(k)) continue;
        if (v === undefined) continue;
        rows.push({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) });
    }
    return rows;
}

function slideFieldLabel(key: string, uiLang: "zh" | "en"): string {
    const dict: Record<string, { zh: string; en: string }> = {
        title: { zh: "标题", en: "Title" },
        description: { zh: "画面描述", en: "Description" },
        layout: { zh: "布局", en: "Layout" },
        note: { zh: "备注", en: "Note" },
        content: { zh: "内容", en: "Content" },
    };
    const hit = dict[key];
    if (hit) return uiLang === "zh" ? hit.zh : hit.en;
    return key;
}

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
    const [expandedSlideCards, setExpandedSlideCards] = useState<Record<string, boolean>>({});
    const [isAtBottom, setIsAtBottom] = useState(true);
    const scrollRafRef = useRef<number | null>(null);
    const userScrolledUpRef = useRef(false);
    const lastScrollTopRef = useRef(0);
    const lastMessageCountRef = useRef(0);

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
        return (
            (root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null) ||
            (root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null)
        );
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const viewport = getViewport();
        if (!viewport) {
            messagesEndRef.current?.scrollIntoView({ behavior });
            return;
        }
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    }, [getViewport]);

    useEffect(() => {
        let mounted = true;
        let cleanup: null | (() => void) = null;
        let rafId = 0;

        const bind = () => {
            if (!mounted) return;
            const viewport = getViewport();
            if (!viewport) {
                rafId = requestAnimationFrame(bind);
                return;
            }
            const threshold = 24;
            const onScroll = () => {
                const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
                const nearBottom = distanceToBottom <= threshold;
                const currentTop = viewport.scrollTop;
                const scrollingUp = currentTop < lastScrollTopRef.current;
                lastScrollTopRef.current = currentTop;

                if (nearBottom) userScrolledUpRef.current = false;
                else if (scrollingUp) userScrolledUpRef.current = true;

                setIsAtBottom(nearBottom);
            };
            const onWheel = (event: WheelEvent) => {
                if (event.deltaY < 0) {
                    userScrolledUpRef.current = true;
                    setIsAtBottom(false);
                }
            };
            lastScrollTopRef.current = viewport.scrollTop;
            onScroll();
            viewport.addEventListener("scroll", onScroll, { passive: true });
            viewport.addEventListener("wheel", onWheel, { passive: true });
            cleanup = () => {
                viewport.removeEventListener("scroll", onScroll as any);
                viewport.removeEventListener("wheel", onWheel as any);
            };
        };

        bind();
        return () => {
            mounted = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (cleanup) cleanup();
        };
    }, [getViewport, messages.length]);

    useEffect(() => {
        return () => {
            if (scrollRafRef.current === null) return;
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(scrollRafRef.current);
            else if (typeof window !== "undefined") window.clearTimeout(scrollRafRef.current);
            scrollRafRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!isAtBottom || userScrolledUpRef.current) return;
        if (scrollRafRef.current !== null) return;
        const previousCount = lastMessageCountRef.current;
        const currentCount = messages.length;
        const messageCountChanged = currentCount !== previousCount;
        if (!messageCountChanged && status === "streaming") return;
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
        lastMessageCountRef.current = currentCount;
    }, [messages.length, status, isAtBottom, scrollToBottom]);

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
        <div
            ref={scrollRootRef}
            className="h-full w-full relative"
            onWheelCapture={(e) => {
                if (e.deltaY < 0) {
                    userScrolledUpRef.current = true;
                    setIsAtBottom(false);
                }
            }}
        >
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
                    const messageText = getMessageTextContent(message);
                    const { images: probeImages, rest: probeWithoutImages } = extractImageTags(messageText);
                    const { tags: probePptTags, rest: probeText } = extractPptSlideTags(probeWithoutImages);
                    const probeSections = splitTextIntoFileSections(probeText);
                    const hasProbeText = probeSections.some((s) => s.type === "text" && String(s.content || "").trim().length > 0);
                    const hasProbeFiles = probeSections.some((s) => s.type === "file" && String(s.content || "").trim().length > 0);
                    const hasProbePptTool = probeSections.some(
                        (s) => s.type === "text" && !!extractPptToolPayload(String(s.content || ""))
                    );
                    const hasProbeReasoning = (message.parts || []).some(
                        (p) => p?.type === "reasoning" && String(p.text || "").trim().length > 0
                    );
                    const hasRenderableContent =
                        probeImages.length > 0 ||
                        probePptTags.length > 0 ||
                        hasProbeText ||
                        hasProbeFiles ||
                        hasProbePptTool ||
                        hasProbeReasoning;
                    const isAssistantEmpty = message.role === "assistant" && !hasRenderableContent;
                    const showPendingIndicator =
                        message.role === "user" &&
                        isLastUserMessage &&
                        (status === "submitted" || status === "streaming");

                    if (isAssistantEmpty) return null;

                    return (
                        <React.Fragment key={message.id}>
                        <div
                            className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={cn(
                                    "min-w-0 flex flex-col",
                                    message.role === "assistant" ? "w-full max-w-[95%] items-start" : "max-w-[95%] items-end"
                                )}
                            >
                                {/* Content Bubble */}
                                <div className={cn(
                                    "relative px-4 py-3 text-sm leading-relaxed break-words overflow-hidden border border-border/50 bg-background/70 backdrop-blur-md shadow-sm transition-shadow hover:shadow-md",
                                    message.role === "user" 
                                        ? "text-foreground rounded-2xl rounded-tr-sm w-full cursor-pointer"
                                        : "text-foreground rounded-2xl rounded-tl-sm w-full"
                                )}
                                role={message.role === "user" && isLastUserMessage && onEditMessage ? "button" : undefined}
                                tabIndex={message.role === "user" && isLastUserMessage && onEditMessage ? 0 : undefined}
                                title={message.role === "user" && isLastUserMessage && onEditMessage ? tr("点击编辑", "Click to edit") : undefined}
                                onClick={() => {
                                    if (isEditing || message.role !== "user" || !isLastUserMessage || !onEditMessage) return;
                                    setEditingMessageId(message.id);
                                    setEditText(getUserOriginalText(message));
                                }}
                                onKeyDown={(e) => {
                                    if (isEditing || message.role !== "user" || !isLastUserMessage || !onEditMessage) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setEditingMessageId(message.id);
                                        setEditText(getUserOriginalText(message));
                                    }
                                }}>
                                    
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
                                            const editParts = splitInlinePptTags(editText);
                                            return (
                                                <div className="flex flex-col gap-2 min-w-[300px]" onClick={(e) => e.stopPropagation()}>
                                                    <div className="relative w-full">
                                                        <textarea
                                                            ref={editTextareaRef}
                                                            value={editText}
                                                            onChange={(e) => setEditText(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="relative z-10 w-full px-3 py-2 text-sm rounded-md border border-input bg-transparent text-transparent caret-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                                            rows={4}
                                                        />
                                                        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words text-foreground">
                                                            {editParts.map((p, i) => {
                                                                if (p.type === "text") return <span key={`edit-t-${i}`}>{p.text}</span>;
                                                                const kind = p.kind === "outline" ? "outline" : "slide_image";
                                                                const label = p.title ? tr(`第 ${p.n} 页：${p.title}`, `Slide ${p.n}: ${p.title}`) : tr(`第 ${p.n} 页`, `Slide ${p.n}`);
                                                                return (
                                                                    <span
                                                                        key={`edit-ppt-${i}`}
                                                                        className={cn(
                                                                            "mx-0.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium align-middle",
                                                                            kind === "outline"
                                                                                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-950/40 dark:text-blue-200"
                                                                                : "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200"
                                                                        )}
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                                                                                kind === "outline" ? "bg-blue-600" : "bg-red-600"
                                                                            )}
                                                                        >
                                                                            {kind === "outline" ? "T" : "P"}
                                                                        </span>
                                                                        {label}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingMessageId(null);
                                                            }}
                                                            className="px-3 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-foreground"
                                                        >
                                                            {tr("取消", "Cancel")}
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
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
                                                                        ? t.kind === "outline"
                                                                            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-950/40 dark:text-blue-200"
                                                                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200"
                                                                        : "border-border bg-muted/40 text-foreground"
                                                                )}
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        "mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                                                                        t.kind === "outline" ? "bg-blue-600" : "bg-red-600"
                                                                    )}
                                                                >
                                                                    {t.kind === "outline" ? "T" : "P"}
                                                                </span>
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
                                                                    const kind = p.kind === "outline" ? "outline" : "slide_image";
                                                                    const label = p.title ? tr(`第 ${p.n} 页：${p.title}`, `Slide ${p.n}: ${p.title}`) : tr(`第 ${p.n} 页`, `Slide ${p.n}`);
                                                                    return (
                                                                        <span
                                                                            key={`${idx}-ppt-${j}`}
                                                                            className={cn(
                                                                                "mx-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium align-middle",
                                                                                kind === "outline"
                                                                                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-950/40 dark:text-blue-200"
                                                                                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200"
                                                                            )}
                                                                            title={tr(`幻灯片 · ${label}`, `Slide · ${label}`)}
                                                                        >
                                                                            <span
                                                                                className={cn(
                                                                                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                                                                                    kind === "outline" ? "bg-blue-600" : "bg-red-600"
                                                                                )}
                                                                            >
                                                                                {kind === "outline" ? "T" : "P"}
                                                                            </span>
                                                                            {label}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    }
                                                    const pptToolPayload = message.role === "assistant"
                                                        ? extractPptToolPayload(section.content)
                                                        : null;
                                                    if (pptToolPayload && pptToolPayload.slides.length > 0) {
                                                        return (
                                                            <div key={idx} className="w-full min-w-0 space-y-2">
                                                                {pptToolPayload.slides.map((slide, slideIdx) => {
                                                                    const slideNumber = getSlideNumber(slide, slideIdx);
                                                                    const rows = slidePatchEntries(slide);
                                                                    const cardKey = `${message.id}-ppt-edit-${idx}-${slideIdx}`;
                                                                    const expanded = expandedSlideCards[cardKey] ?? false;
                                                                    return (
                                                                        <div
                                                                            key={cardKey}
                                                                            className="w-full min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/70"
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setExpandedSlideCards((prev) => ({ ...prev, [cardKey]: !expanded }))}
                                                                                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                                                                            >
                                                                                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                                                                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                                                    {tr(`第 ${slideNumber} 张幻灯片`, `Slide ${slideNumber}`)}
                                                                                </span>
                                                                                {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                                                            </button>
                                                                            {expanded && (
                                                                                <div className="space-y-2 border-t border-border/50 px-3 py-2">
                                                                                    {rows.map((r, rIdx) => (
                                                                                        <div key={`${message.id}-ppt-edit-row-${idx}-${slideIdx}-${rIdx}`} className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2">
                                                                                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                                                                                {slideFieldLabel(r.key, uiLang)}
                                                                                            </div>
                                                                                            <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                                                                                                {r.value}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
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
                                                                    return "";
                                                                }}
                                                                components={{
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
                                                                    code({ node, inline, className, children, ...props }: any) {
                                                                        const match = /language-(\w+)/.exec(className || "");
                                                                        const isStreaming = status === "streaming" && isLastAssistantMessage;
                                                                        const language = match?.[1] || "text";
                                                                        if (!inline) {
                                                                            const ordinal = codeBlockOrdinal++;
                                                                            return (
                                                                                <CodeBlock
                                                                                    key={`codeblock-${message.id}-${idx}-${language}-${ordinal}`}
                                                                                    blockId={`${message.id}:${idx}:${language}:${ordinal}`}
                                                                                    code={String(children).replace(/\n$/, "")}
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
                        {showPendingIndicator && (
                            <div className="flex w-full justify-start animate-message-in mt-3">
                                <div className="max-w-[85%] min-w-0">
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/40 rounded-2xl rounded-bl-md">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span>{tr("思考中...", "Thinking...")}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        </React.Fragment>
                    );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>
            {!isAtBottom && messages.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        userScrolledUpRef.current = false;
                        setIsAtBottom(true);
                        scrollToBottom("smooth");
                    }}
                    className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1 rounded-full border border-border bg-background/90 backdrop-blur px-3 py-1.5 text-xs text-foreground shadow-md hover:bg-background"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                    {tr("回到底部", "Back to bottom")}
                </button>
            )}
        </div>
    );
}
