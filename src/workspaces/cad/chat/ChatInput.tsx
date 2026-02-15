import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Send, FileText, ImageIcon, History, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonWithTooltip } from '@/workspaces/cad/chat/components/button-with-tooltip';
import { FilePreviewList } from '@/workspaces/cad/chat/file-preview-list';
import { useFileProcessor } from '@/lib/use-file-processor';
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";

type RichInputSegment =
    | { type: "text"; text: string }
    | { type: "ppt"; slideId: string; label: string; tag: string };

interface ChatInputProps {
    input: string;
    setInput: (value: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    onStop?: () => void;
    onClearChat?: () => void;
    onToggleHistory?: () => void;
    historyDisabled?: boolean;
    onFilesChange?: (files: File[]) => void;
    files?: File[]; // Controlled files
    placeholder?: string;
    topChips?: React.ReactNode;
    bottomChips?: React.ReactNode;
    focusKey?: string | number;
    richSegments?: RichInputSegment[];
    onRichSegmentsChange?: (segments: RichInputSegment[]) => void;
    insertPptToken?: { key: number; slideId: string; label: string; tag: string } | null;
    onInsertPptTokenHandled?: () => void;
    clearKey?: string | number;
    uploadMode?: "all" | "imagesOnly" | "filesOnly" | "none";
}

export function ChatInput({
    input,
    setInput,
    onSubmit,
    isLoading,
    onStop,
    onClearChat,
    onToggleHistory,
    historyDisabled = false,
    onFilesChange,
    files: controlledFiles,
    placeholder,
    topChips,
    bottomChips,
    focusKey,
    richSegments,
    onRichSegmentsChange,
    insertPptToken,
    onInsertPptTokenHandled,
    clearKey,
    uploadMode = "all"
}: ChatInputProps) {
    const uiLang = useUiLanguage();
    const trText = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const richRef = useRef<HTMLDivElement>(null);
    const richSavedRangeRef = useRef<Range | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const richAppliedRef = useRef<string>("");
    const [richHasFocus, setRichHasFocus] = useState(false);
    
    const { files, handleFileChange, setFiles, pdfData } = useFileProcessor();
    const isRich = !!(richSegments && onRichSegmentsChange);
    
    // Sync controlled files if provided
    useEffect(() => {
        if (controlledFiles) {
            setFiles(controlledFiles);
        }
    }, [controlledFiles, setFiles]);

    // Notify parent when files change
    useEffect(() => {
        onFilesChange?.(files);
    }, [files, onFilesChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isLoading) onStop?.();
            else onSubmit();
        }
    };

    const autoResizeTextarea = useCallback(() => {
        if (isRich) return;
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [isRich]);

    useEffect(() => {
        autoResizeTextarea();
    }, [input, isRich, placeholder, autoResizeTextarea]);

    useEffect(() => {
        if (isRich) return;
        const el = textareaRef.current;
        if (!el) return;

        let raf = 0;
        const schedule = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                autoResizeTextarea();
            });
        };

        schedule();

        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => schedule());
            ro.observe(el);
            ro.observe(el.parentElement ?? el);
            return () => {
                if (raf) cancelAnimationFrame(raf);
                ro.disconnect();
            };
        }

        window.addEventListener("resize", schedule);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener("resize", schedule);
        };
    }, [isRich, autoResizeTextarea]);

    useEffect(() => {
        if (focusKey === undefined) return;
        if (isRich) richRef.current?.focus();
        else textareaRef.current?.focus();
    }, [focusKey]);

    useEffect(() => {
        if (clearKey === undefined) return;
        if (!isRich) return;
        const root = richRef.current;
        if (!root) return;
        richSavedRangeRef.current = null;
        root.innerHTML = "";
        root.appendChild(document.createTextNode(""));
        richAppliedRef.current = "";
        onRichSegmentsChange?.([{ type: "text", text: "" }]);
    }, [clearKey, isRich]);

    const serializeSegments = (segments: RichInputSegment[]) => {
        return segments
            .map((s) => (s.type === "text" ? `t:${s.text}` : `p:${s.slideId}:${s.tag}`))
            .join("|");
    };

    const buildLabelSpan = (segment: Extract<RichInputSegment, { type: "ppt" }>) => {
        const el = document.createElement("span");
        el.setAttribute("data-token", "ppt");
        el.setAttribute("data-slide-id", segment.slideId);
        el.setAttribute("data-label", segment.label);
        el.setAttribute("data-tag", segment.tag);
        el.setAttribute("contenteditable", "false");
        el.className = "inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200 align-middle";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "h-3.5 w-3.5 text-red-600 dark:text-red-200");
        const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        // Draw a "P" icon
        path1.setAttribute("d", "M19 7a5 5 0 0 0-5-5H7a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8h5a5 5 0 0 0 5-5z"); 
        // Actually a simpler P stroke might be better for 24x24
        // P shape: M8 20V4h6a4 4 0 0 1 0 8H8
        path1.setAttribute("d", "M8 20V4h6a4 4 0 0 1 0 8H8");
        
        svg.appendChild(path1);
        const text = document.createElement("span");
        text.textContent = segment.label;
        el.appendChild(svg);
        el.appendChild(text);
        return el;
    };

    const setRichContentFromSegments = (segments: RichInputSegment[]) => {
        const root = richRef.current;
        if (!root) return;
        root.innerHTML = "";
        for (const seg of segments) {
            if (seg.type === "text") {
                const parts = String(seg.text || "").split("\n");
                for (let i = 0; i < parts.length; i += 1) {
                    if (parts[i]) root.appendChild(document.createTextNode(parts[i]));
                    if (i < parts.length - 1) root.appendChild(document.createElement("br"));
                }
                continue;
            }
            root.appendChild(buildLabelSpan(seg));
            root.appendChild(document.createTextNode(" "));
        }
        if (!root.lastChild) root.appendChild(document.createTextNode(""));
    };

    const parseRichSegmentsFromDom = (): RichInputSegment[] => {
        const root = richRef.current;
        if (!root) return [{ type: "text", text: "" }];

        const out: RichInputSegment[] = [];
        const pushText = (t: string) => {
            if (!t) return;
            const last = out[out.length - 1];
            if (last?.type === "text") last.text += t;
            else out.push({ type: "text", text: t });
        };

        for (const node of Array.from(root.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                pushText(node.textContent || "");
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const el = node as HTMLElement;
            if (el.tagName === "BR") {
                pushText("\n");
                continue;
            }
            const token = el.getAttribute("data-token");
            if (token === "ppt") {
                const slideId = el.getAttribute("data-slide-id") || "";
                const label = el.getAttribute("data-label") || el.textContent || "";
                const tag = el.getAttribute("data-tag") || "";
                if (slideId && tag) out.push({ type: "ppt", slideId, label, tag });
                continue;
            }
            pushText(el.textContent || "");
        }

        if (out.length === 0) return [{ type: "text", text: "" }];
        return out;
    };

    const syncRichToParent = () => {
        if (!isRich) return;
        const next = parseRichSegmentsFromDom();
        const key = serializeSegments(next);
        if (key === richAppliedRef.current) return;
        richAppliedRef.current = key;
        onRichSegmentsChange?.(next);
    };

    useEffect(() => {
        if (!isRich) return;
        const segments = richSegments || [{ type: "text", text: "" }];
        const key = serializeSegments(segments);
        if (key === richAppliedRef.current) return;
        richAppliedRef.current = key;
        if (richHasFocus) return;
        setRichContentFromSegments(segments);
    }, [isRich, richSegments, richHasFocus]);

    const insertPptTokenAtCursor = (slideId: string, label: string, tag: string) => {
        const root = richRef.current;
        if (!root) return;
        root.focus();
        const sel = window.getSelection();
        let range: Range | null = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        if (!range || !root.contains(range.startContainer)) {
            range = richSavedRangeRef.current;
        }
        if (!range || !root.contains(range.startContainer)) {
            range = document.createRange();
            range.selectNodeContents(root);
            range.collapse(false);
        }
        const span = buildLabelSpan({ type: "ppt", slideId, label, tag });
        const space = document.createTextNode(" ");
        range.insertNode(space);
        range.insertNode(span);
        range.setStartAfter(space);
        range.collapse(true);
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        richSavedRangeRef.current = range;
        syncRichToParent();
    };

    useEffect(() => {
        if (!isRich) return;
        if (!insertPptToken) return;
        insertPptTokenAtCursor(insertPptToken.slideId, insertPptToken.label, insertPptToken.tag);
        onInsertPptTokenHandled?.();
    }, [isRich, insertPptToken?.key]);

    const richPlainText = useMemo(() => {
        const segs = richSegments || [];
        return segs
            .map((s) => (s.type === "text" ? s.text : s.label))
            .join("")
            .replace(/[ \t]+\n/g, "\n");
    }, [richSegments]);

    const showRichPlaceholder = isRich && !richPlainText.trim() && !richHasFocus;

    const filterByUploadMode = (incoming: File[]) => {
        if (uploadMode === "imagesOnly") return incoming.filter((f) => f.type.startsWith("image/"));
        if (uploadMode === "filesOnly") return incoming.filter((f) => !f.type.startsWith("image/"));
        return incoming;
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        if (uploadMode === "none") return;
        const items = e.clipboardData.items;
        const pastedFiles: File[] = [];
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) pastedFiles.push(file);
            }
        }

        if (pastedFiles.length > 0) {
            const filtered = filterByUploadMode(pastedFiles);
            if (filtered.length === 0) return;
            e.preventDefault();
            handleFileChange([...files, ...filtered]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (uploadMode === "none") return;
        const droppedFiles = Array.from(e.dataTransfer.files);
        const filtered = filterByUploadMode(droppedFiles);
        if (filtered.length > 0) {
            handleFileChange([...files, ...filtered]);
        }
    };

    const handleImageUpload = () => imageInputRef.current?.click();
    const handleFileUpload = () => fileInputRef.current?.click();

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            const incoming = Array.from(e.target.files);
            const filtered = filterByUploadMode(incoming);
            if (filtered.length > 0) handleFileChange([...files, ...filtered]);
            e.target.value = ''; // Reset
        }
    };

    const removeFile = (fileToRemove: File) => {
        setFiles(files.filter(f => f !== fileToRemove));
    };

    return (
        <div 
            className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {(uploadMode === "all" || uploadMode === "imagesOnly") && (
                <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    ref={imageInputRef}
                    onChange={onFileInputChange}
                />
            )}
            {(uploadMode === "all" || uploadMode === "filesOnly") && (
                <input
                    type="file"
                    multiple
                    accept={
                        uploadMode === "filesOnly"
                            ? ".pdf,application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                            : "image/*,.pdf,application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                    }
                    className="hidden"
                    ref={fileInputRef}
                    onChange={onFileInputChange}
                />
            )}

            {files.length > 0 && (
                <div className="px-3 pt-3">
                    <FilePreviewList 
                        files={files} 
                        onRemoveFile={removeFile}
                        pdfData={pdfData}
                    />
                </div>
            )}

            {topChips && (
                <div className="px-3 pt-3">
                    {topChips}
                </div>
            )}

            <div className="px-3 pt-2">
                {isRich ? (
                    <div className="relative">
                        {showRichPlaceholder && (
                            <div className="pointer-events-none absolute left-1 top-2 text-[15px] leading-6 text-muted-foreground/60">
                                {placeholder || trText("请输入消息...", "Type your message...")}
                            </div>
                        )}
                        <div
                            ref={richRef}
                            contentEditable
                            suppressContentEditableWarning
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (isLoading) onStop?.();
                                    else onSubmit();
                                    return;
                                }
                                if (e.key === "Backspace" || e.key === "Delete") {
                                    const root = richRef.current;
                                    if (!root) return;
                                    const sel = window.getSelection();
                                    if (!sel || sel.rangeCount === 0) return;
                                    const r = sel.getRangeAt(0);
                                    if (!root.contains(r.startContainer) || !r.collapsed) return;
                                    const container = r.startContainer;
                                    const offset = r.startOffset;

                                    const tryRemoveToken = (el: Element | null) => {
                                        if (!el) return false;
                                        const token = (el as HTMLElement).getAttribute("data-token");
                                        if (token !== "ppt") return false;
                                        el.remove();
                                        syncRichToParent();
                                        return true;
                                    };

                                    if (container.nodeType === Node.TEXT_NODE) {
                                        if (e.key === "Backspace" && offset === 0) {
                                            const prev = (container as Text).previousSibling;
                                            if (prev && prev.nodeType === Node.ELEMENT_NODE) {
                                                if (tryRemoveToken(prev as Element)) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                            }
                                        }
                                        if (e.key === "Delete" && offset === (container as Text).data.length) {
                                            const next = (container as Text).nextSibling;
                                            if (next && next.nodeType === Node.ELEMENT_NODE) {
                                                if (tryRemoveToken(next as Element)) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                            }
                                        }
                                    } else if (container.nodeType === Node.ELEMENT_NODE) {
                                        const el = container as Element;
                                        const child = el.childNodes[offset + (e.key === "Backspace" ? -1 : 0)];
                                        if (child && child.nodeType === Node.ELEMENT_NODE) {
                                            if (tryRemoveToken(child as Element)) {
                                                e.preventDefault();
                                                return;
                                            }
                                        }
                                    }
                                }
                            }}
                            onPaste={handlePaste as any}
                            onFocus={() => setRichHasFocus(true)}
                            onBlur={() => {
                                setRichHasFocus(false);
                                const sel = window.getSelection();
                                if (sel && sel.rangeCount > 0) {
                                    const r = sel.getRangeAt(0);
                                    if (richRef.current?.contains(r.startContainer)) {
                                        richSavedRangeRef.current = r;
                                    }
                                }
                                syncRichToParent();
                            }}
                            onInput={() => syncRichToParent()}
                            onKeyUp={() => {
                                const sel = window.getSelection();
                                if (sel && sel.rangeCount > 0) {
                                    const r = sel.getRangeAt(0);
                                    if (richRef.current?.contains(r.startContainer)) {
                                        richSavedRangeRef.current = r;
                                    }
                                }
                            }}
                            onMouseUp={() => {
                                const sel = window.getSelection();
                                if (sel && sel.rangeCount > 0) {
                                    const r = sel.getRangeAt(0);
                                    if (richRef.current?.contains(r.startContainer)) {
                                        richSavedRangeRef.current = r;
                                    }
                                }
                            }}
                            className={cn(
                                "w-full bg-transparent border-none px-1 py-2 focus:ring-0 transition-all outline-none text-[15px] leading-6 max-h-[360px] overflow-y-auto min-h-[48px] whitespace-pre-wrap break-words"
                            )}
                        />
                    </div>
                ) : (
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={placeholder || trText("请输入消息...", "Type your message...")}
                        className={cn(
                            "w-full resize-none bg-transparent border-none px-1 py-2 focus:ring-0 transition-all outline-none text-[15px] leading-6 max-h-[360px] overflow-y-auto min-h-[48px]"
                        )}
                        rows={1}
                    />
                )}
            </div>

            {bottomChips && (
                <div className="px-3 pb-2">
                    {bottomChips}
                </div>
            )}

            <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                <div className="flex items-center gap-1">
                    {onClearChat && (
                        <ButtonWithTooltip
                            tooltipContent={t(uiLang, "chat.clearChatTitle")}
                            variant="ghost"
                            size="sm"
                            onClick={onClearChat}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </ButtonWithTooltip>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {onToggleHistory && (
                        <ButtonWithTooltip
                            tooltipContent={t(uiLang, "chat.historyTitle")}
                            variant="ghost"
                            size="sm"
                            onClick={onToggleHistory}
                            disabled={historyDisabled}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <History className="h-4 w-4" />
                        </ButtonWithTooltip>
                    )}

                    {(uploadMode === "all" || uploadMode === "imagesOnly") && (
                        <ButtonWithTooltip
                            tooltipContent={t(uiLang, "chat.uploadImage")}
                            variant="ghost"
                            size="sm"
                            onClick={handleImageUpload}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </ButtonWithTooltip>
                    )}

                    {(uploadMode === "all" || uploadMode === "filesOnly") && (
                        <ButtonWithTooltip
                            tooltipContent={t(uiLang, "chat.uploadFile")}
                            variant="ghost"
                            size="sm"
                            onClick={handleFileUpload}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <FileText className="h-4 w-4" />
                        </ButtonWithTooltip>
                    )}

                    <div className="w-px h-5 bg-border mx-1" />

                    {(() => {
                        const hasText = isRich ? richPlainText.trim().length > 0 : input.trim().length > 0;
                        const hasFiles = files.length > 0;
                        if (isLoading) {
                            return (
                                <ButtonWithTooltip
                                    tooltipContent={t(uiLang, "chat.stop")}
                                    variant="default"
                                    size="sm"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onStop?.();
                                    }}
                                    disabled={!onStop}
                                    className="h-8 w-8 p-0 rounded-xl shadow-sm"
                                    aria-label={t(uiLang, "chat.stop")}
                                >
                                    <Square className="h-3.5 w-3.5 fill-current" />
                                </ButtonWithTooltip>
                            );
                        }
                        return (
                            <ButtonWithTooltip
                                type="button"
                                onClick={onSubmit}
                                tooltipContent={t(uiLang, "chat.send")}
                                disabled={!hasText && !hasFiles}
                                variant="default"
                                size="sm"
                                className={cn(
                                    "h-8 w-8 p-0 rounded-xl shadow-sm",
                                    (!hasText && !hasFiles) ? "opacity-60" : ""
                                )}
                                aria-label={t(uiLang, "chat.send")}
                            >
                                <Send className="h-4 w-4" />
                            </ButtonWithTooltip>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}


