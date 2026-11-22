import React, { useRef, useEffect, useState } from 'react';
import { CanvasCard } from "@/shared/canvas-pane";
import { Check, ChevronDown, ChevronUp, Copy, FileCode, FileText, Image as ImageIcon, ListOrdered, Pencil, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SmoothText } from "@/shared/chat/smooth-text";
import remarkGfm from 'remark-gfm';
import { MessageAttachments, MessageImage, Reasoning, ReasoningContent, ReasoningTrigger, TokenUsageLine, WorkingIndicator, useTurnUsage } from "@/shared/chat";
import { ChatScrollArea } from "@/shared/chat/chat-scroll";
import { isReferenceFile, readReference, type SentReference } from "@/shared/references/message-marker";
import { MessageReferences } from "@/shared/references/message-references";
import { MessageEditor } from "@/shared/chat/message-editor";
import { CodeBlock } from "@/workspaces/ppt/chat/code-block";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import {
    getMessageTextContent,
    getUserOriginalText,
    isFencedCode,
    splitTextIntoFileSections,
    type MessagePart,
    type UIMessage,
} from "@/shared/chat/message-content";
import {
    extractImageTags,
    extractPptSlideTags,
    extractPptToolPayload,
    getSlideNumber,
    slideFieldLabel,
    slidePatchEntries,
    splitInlinePptTags,
} from "@/shared/chat/ppt-message-tags";

export type { MessagePart, UIMessage };

// Types
interface ChatMessageDisplayProps {
    messages: UIMessage[];
    onRegenerate?: (messageIndex: number) => void;
    onEditMessage?: (messageIndex: number, newText: string) => void;
    status?: "streaming" | "submitted" | "idle" | "error" | "ready";
    onDisplayChart?: (xml: string) => void; // Callback for diagram display
    /** An assistant message the panel draws itself (the deck's steps), or null for an ordinary one. */
    renderSpecial?: (text: string, messageIndex: number) => React.ReactNode | null;
    /** Text streaming in on the canvas (the outline), counted in the working line. */
}

// Helper to split text content into regular text and file sections
export function ChatMessageDisplay({
    messages,
    onRegenerate,
    onEditMessage,
    status = "idle",
    onDisplayChart,
    renderSpecial,
}: ChatMessageDisplayProps) {
    // Tokens the provider reported for this turn (all its model calls).
    const turnUsage = useTurnUsage(status === "submitted" || status === "streaming");
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
        >
            <ChatScrollArea contentClassName="py-5 px-5 space-y-5">
                    {messages.map((message, messageIndex) => {
                    const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                    const isLastAssistantMessage =
                        message.role === "assistant" &&
                        (messageIndex === messages.length - 1 || messages.slice(messageIndex + 1).every((m) => m.role !== "assistant"));
                    const isEditing = editingMessageId === message.id;
                    const messageText = getMessageTextContent(message);
                    const special = message.role === "assistant" && renderSpecial ? renderSpecial(messageText, messageIndex) : null;
                    if (special) {
                        return (
                            <div key={message.id} data-chat-msg="assistant" data-chat-preview="" className="w-full min-w-0 animate-message-in">
                                {special}
                            </div>
                        );
                    }
                    const { images: probeImages, rest: probeWithoutImages } = extractImageTags(messageText);
                    const { tags: probePptTags, rest: probeText } = extractPptSlideTags(probeWithoutImages);
                    const probeSections = splitTextIntoFileSections(probeText);
                    // A referenced work rides in as a file that opens with its marker: it shows as a canvas card.
                    const probeReferences = probeSections
                        .map((s) => (s.type === "file" ? readReference(String(s.content || "")) : null))
                        .filter((r): r is SentReference => r !== null);
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

                    if (isAssistantEmpty) return null;

                    return (
                        <React.Fragment key={message.id}>
                        <div
                            data-chat-msg={message.role === "user" ? "user" : "assistant"}
                            className={`group/msg flex w-full animate-message-in ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={cn(
                                    "min-w-0 flex flex-col",
                                    message.role === "assistant" ? "w-full max-w-full items-start" : "max-w-[85%] items-end"
                                )}
                            >
                                {/* What the user attached sits above the bubble, the way
                                    it does on claude.ai -- inside, a one-line question
                                    with a screenshot became a mostly-empty card. */}
                                {message.role === "user" && (
                                    <MessageReferences references={probeReferences} className="mb-1.5" />
                                )}
                                {message.role === "user" && (
                                    <MessageAttachments
                                        images={probeImages}
                                        files={probeSections
                                            .filter((s) => s.type === "file" && !isReferenceFile(String(s.filename || ""), String(s.content || ""), probeReferences))
                                            .map((s) => ({ filename: s.filename, fileType: s.fileType }))}
                                        className="mb-1.5"
                                    />
                                )}

                                {/* Content Bubble.

                                    The assistant speaks onto the page: no card,
                                    no border, full width. Only what the user
                                    said is bounded. Giving both roles the same
                                    bubble made the thread read as one
                                    undifferentiated wall. */}
                                <div className={cn(
                                    "relative text-sm leading-relaxed break-words overflow-hidden w-full text-foreground",
                                    message.role === "user"
                                        ? (isEditing ? "overflow-visible" : "px-4 py-3 rounded-2xl bg-foreground/[0.06]")
                                        : "py-1",
                                    // Only files were sent (they sit above): no empty bubble under them.
                                    message.role === "user" && !isEditing && !hasProbeText && probePptTags.length === 0 && "hidden"
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
                                            const editParts = splitInlinePptTags(editText);
                                            return (
                                                <MessageEditor
                                                    value={editText}
                                                    onChange={setEditText}
                                                    onCancel={() => setEditingMessageId(null)}
                                                    onSubmit={(value) => {
                                                        setEditingMessageId(null);
                                                        onEditMessage?.(messageIndex, value);
                                                    }}
                                                    overlay={<>{editParts.map((p, i) => {
                                                                if (p.type === "text") return <span key={`edit-t-${i}`}>{p.text}</span>;
                                                                const kind = p.kind === "outline" ? "outline" : "slide_image";
                                                                const label = p.title ? tr(`第 ${p.n} 页：${p.title}`, `Slide ${p.n}: ${p.title}`) : tr(`第 ${p.n} 页`, `Slide ${p.n}`);
                                                                return (
                                                                    <span
                                                                        key={`edit-ppt-${i}`}
                                                                        className={cn(
                                                                            "mx-0.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium align-middle",
                                                                            kind === "outline"
                                                                                ? "border-primary/25 bg-primary/[0.08] text-primary-strong"
                                                                                : "border-border bg-muted text-foreground/80"
                                                                        )}
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold",
                                                                                kind === "outline" ? "bg-primary text-primary-foreground" : "bg-foreground/70 text-background"
                                                                            )}
                                                                        >
                                                                            {kind === "outline" ? "T" : "P"}
                                                                        </span>
                                                                        {label}
                                                                    </span>
                                                                );
                                                            })}</>}
                                                />
                                            );
                                        }

                                        // Regular Display
                                        const sections = splitTextIntoFileSections(text);
                                        return (
                                            <div className="space-y-3">
                                                {message.role !== "user" && images.length > 0 && (
                                                    <div className="space-y-2">
                                                        {images.map((img, i) => (
                                                            <MessageImage
                                                                key={`${message.id}-img-${i}`}
                                                                src={img.url}
                                                                alt={img.name || "image"}
                                                                className="mx-auto max-w-[420px]"
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                {pptTags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pptTags.map((t, i) => {
                                                            const Icon = t.kind === "outline" ? ListOrdered : ImageIcon;
                                                            const page = tr(`第 ${t.n} 页`, `Slide ${t.n}`);
                                                            return (
                                                                <span
                                                                    key={`${message.id}-ppttag-${i}-${t.n}`}
                                                                    data-peek="ppt-slide"
                                                                    data-peek-page={t.n}
                                                                    data-token-kind={t.kind}
                                                                    className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md bg-foreground/[0.06] px-2 py-1 text-[12.5px] text-foreground/85"
                                                                >
                                                                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                                                                    <span className="truncate">{t.title ? `${page} · ${t.title}` : page}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {sections.map((section, idx) => {
                                                    if (section.type === "text" && !String(section.content || "").trim()) return null;
                                                    // Files and referenced works sit above the bubble already.
                                                    if (section.type === 'file' && message.role === "user") return null;
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
                                                                            <FileText className="h-4 w-4 text-destructive" />
                                                                        ) : (
                                                                            <FileCode className="h-4 w-4 text-primary-strong" />
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
                                                                                    ? "border-primary/25 bg-primary/[0.08] text-primary-strong"
                                                                                    : "border-border bg-muted text-foreground/80"
                                                                            )}
                                                                            title={tr(`幻灯片 · ${label}`, `Slide · ${label}`)}
                                                                        >
                                                                            <span
                                                                                className={cn(
                                                                                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold",
                                                                                    kind === "outline" ? "bg-primary text-primary-foreground" : "bg-foreground/70 text-background"
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
                                                                    const rows = slidePatchEntries(slide, uiLang);
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
                                                                                    <span className="h-2.5 w-2.5 rounded-full bg-success" />
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
                                                            "prose prose-sm font-voice text-[15px] max-w-none break-words",
                                                        )}>
                                                            <SmoothText text={section.content} streaming={status === "streaming" && message.role === "assistant" && isLastAssistantMessage}>
                                                            {(shown) => (
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
                                                                    table({ children, ...props }: any) {
                                                                        return (
                                                                            <div className="prose-scroll-x my-4">
                                                                                <table {...props} className={cn("my-0", props?.className)}>
                                                                                    {children}
                                                                                </table>
                                                                            </div>
                                                                        );
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
                                                                    code({ node: _node, className, children, ...props }: any) {
                                                                        const match = /language-(\w+)/.exec(className || "");
                                                                        const isStreaming = status === "streaming" && isLastAssistantMessage;
                                                                        const language = match?.[1] || "text";
                                                                        if (isFencedCode(className, children)) {
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
                                                                {shown}
                                                            </ReactMarkdown>
                                                            )}
                                                            </SmoothText>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                </div>

                                {/* Actions */}
                                <div className={cn("flex items-center gap-1 mt-2 px-1", message.role === "user" && "opacity-0 transition-opacity duration-fast group-hover/msg:opacity-100 focus-within:opacity-100")}>
                                    {message.role === "user" && !isEditing && userMessageText && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => copyMessageToClipboard(message.id, getUserOriginalText(message))}
                                                className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
                                                title={tr("复制", "Copy")}
                                            >
                                                {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                            {onEditMessage && status !== "streaming" && status !== "submitted" && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingMessageId(message.id);
                                                        setEditText(getUserOriginalText(message));
                                                    }}
                                                    className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
                                                    title={tr("编辑", "Edit")}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {message.role === "assistant" && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => copyMessageToClipboard(message.id, getMessageTextContent(message))}
                                                className={`p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                                                    copiedMessageId === message.id
                                                        ? "text-success bg-success/15"
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
                                                    className="p-1.5 rounded-lg transition-[color,background-color,opacity,transform] duration-fast ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
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
                        </React.Fragment>
                    );
                    })}
                    {(status === "submitted" || status === "streaming") && (
                        <WorkingIndicator kind="ppt" className="mt-3 animate-message-in" usage={turnUsage} />
                    )}
                    {status !== "submitted" && status !== "streaming" && messages[messages.length - 1]?.role === "assistant" && <TokenUsageLine usage={turnUsage} />}
                    {status !== "submitted" && status !== "streaming" && messages[messages.length - 1]?.role === "assistant" && <CanvasCard />}
                    <div ref={messagesEndRef} />
            </ChatScrollArea>
        </div>
    );
}
