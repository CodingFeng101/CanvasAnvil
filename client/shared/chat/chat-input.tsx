import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { isSendKey } from "@/shared/preferences";
import { History, Paperclip, SlidersHorizontal, Upload } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { GhostHint, PlusMenu, SendButton, StatusRow, type ModelChannel, type PlusMenuItem } from '@/shared/chat/composer';
import { openSettings } from '@/shared/settings-bus';
import { FilePreviewList } from '@/shared/chat';
import { type FileWorkspace, useFileProcessor } from '@/shared/files/use-file-processor';
import { useUiLanguage } from "@/shared/i18n";

type RichInputSegment =
    | { type: "text"; text: string }
    | { type: "ppt"; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" };

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
    /** The canvas's own options, as quiet text under the box, bottom right (see composer.tsx). */
    statusExtras?: React.ReactNode;
    /** Which models the line under the box names: the ones this canvas calls right now. */
    statusChannels?: ModelChannel[];
    /** Extra entries for the "+" menu. */
    menuItems?: PlusMenuItem[];
    /** A suggestion shown in the empty box; Tab puts it in. */
    suggestion?: string;
    /** Which canvas's constraints the + menu opens. */
    constraintScope?: "diagram" | "cad" | "ppt" | "canvas";
    bottomChips?: React.ReactNode;
    focusKey?: string | number;
    richSegments?: RichInputSegment[];
    onRichSegmentsChange?: (segments: RichInputSegment[]) => void;
    insertPptToken?: { key: number; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" } | null;
    onInsertPptTokenHandled?: () => void;
    clearKey?: string | number;
    uploadMode?: "all" | "imagesOnly" | "filesOnly" | "none";
    /** Tags extraction telemetry with the workspace the upload came from. */
    workspaceId?: FileWorkspace;
}

// Lucide's list and image glyphs, inlined: the chips are built as plain DOM inside the editable box.
const SLIDE_ICON_OUTLINE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>';
const SLIDE_ICON_PICTURE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';

/** File objects keep their identity, so a member-wise check is enough. */
function sameFileList(a: File[], b: File[]): boolean {
    return a.length === b.length && a.every((file, i) => file === b[i]);
}

export function ChatInput({
    input,
    setInput,
    onSubmit,
    isLoading,
    onStop,
    onToggleHistory,
    historyDisabled = false,
    onFilesChange,
    files: controlledFiles,
    placeholder,
    topChips,
    statusExtras,
    statusChannels,
    menuItems = [],
    suggestion,
    constraintScope,
    bottomChips,
    focusKey,
    richSegments,
    onRichSegmentsChange,
    insertPptToken,
    onInsertPptTokenHandled,
    clearKey,
    uploadMode = "all",
    workspaceId = "unknown",
}: ChatInputProps) {
    const uiLang = useUiLanguage();
    const trText = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText);
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const richRef = useRef<HTMLDivElement>(null);
    const richSavedRangeRef = useRef<Range | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const richAppliedRef = useRef<string>("");
    const [richHasFocus, setRichHasFocus] = useState(false);
    
    const { files, handleFileChange, setFiles, pdfData } = useFileProcessor(workspaceId);
    const isRich = !!(richSegments && onRichSegmentsChange);
    
    /**
     * Sync controlled files in, without starting a fight with the effect
     * below that syncs them back out.
     *
     * The two run one step apart: this one writes the parent's array into
     * local state while the next still holds the previous local array and
     * writes that one back up. Two arrays that are equal but not identical --
     * such as the separate empty arrays the two sides start with -- therefore
     * swap places on every render, forever. Keeping the array we already have
     * whenever the contents match is what breaks the cycle.
     */
    useEffect(() => {
        if (!controlledFiles) return;
        setFiles((prev) => (sameFileList(prev, controlledFiles) ? prev : controlledFiles));
    }, [controlledFiles, setFiles]);

    // Notify parent when files change
    useEffect(() => {
        onFilesChange?.(files);
    }, [files, onFilesChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab" && !e.shiftKey && suggestion && !input.trim()) {
            e.preventDefault();
            setInput(suggestion);
            return;
        }
        if (isSendKey(e)) {
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
    // Bumped by the parent to request focus. Depending on isRich as well
    // would steal focus every time the input flips mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Bumped by the parent to request a clear. onRichSegmentsChange is an
    // inline arrow from the parent, so depending on it would re-clear on
    // every parent render and wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearKey, isRich]);

    const serializeSegments = (segments: RichInputSegment[]) => {
        return segments
            .map((s) => (s.type === "text" ? `t:${s.text}` : `p:${s.tokenKind}:${s.slideId}:${s.tag}`))
            .join("|");
    };

    const buildLabelSpan = (segment: Extract<RichInputSegment, { type: "ppt" }>) => {
        const isOutline = segment.tokenKind === "outline";
        const el = document.createElement("span");
        el.setAttribute("data-token", "ppt");
        el.setAttribute("data-slide-id", segment.slideId);
        el.setAttribute("data-label", segment.label);
        el.setAttribute("data-tag", segment.tag);
        el.setAttribute("data-token-kind", segment.tokenKind);
        el.setAttribute("contenteditable", "false");
        // A quiet reference chip, like an attachment: a small icon (outline list or slide picture) and the page.
        el.className = "mx-0.5 inline-flex max-w-[260px] items-center gap-1.5 rounded-md bg-foreground/[0.07] px-1.5 py-px align-middle text-[13px] leading-6 text-foreground/85";
        const icon = document.createElement("span");
        icon.className = "inline-flex shrink-0 text-muted-foreground";
        icon.innerHTML = isOutline ? SLIDE_ICON_OUTLINE : SLIDE_ICON_PICTURE;
        const text = document.createElement("span");
        text.className = "truncate";
        text.textContent = segment.label;
        el.appendChild(icon);
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
                const tokenKindAttr = el.getAttribute("data-token-kind");
                const tokenKind: "outline" | "slide_image" =
                    tokenKindAttr === "outline" || tokenKindAttr === "slide_image"
                        ? tokenKindAttr
                        : "slide_image";
                if (slideId && tag) out.push({ type: "ppt", slideId, label, tag, tokenKind });
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
    // setRichContentFromSegments is redefined every render; the segment key
    // above is what decides whether the DOM actually needs rewriting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRich, richSegments, richHasFocus]);

    const insertPptTokenAtCursor = (slideId: string, label: string, tag: string, tokenKind: "outline" | "slide_image") => {
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
        const span = buildLabelSpan({ type: "ppt", slideId, label, tag, tokenKind });
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
        insertPptTokenAtCursor(insertPptToken.slideId, insertPptToken.label, insertPptToken.tag, insertPptToken.tokenKind);
        onInsertPptTokenHandled?.();
    // Keyed on .key so the parent can request the same token twice; the
    // token object itself is rebuilt each render and would re-insert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRich, insertPptToken?.key]);

    const richPlainText = useMemo(() => {
        const segs = richSegments || [];
        return segs
            .map((s) => (s.type === "text" ? s.text : s.label))
            .join("")
            .replace(/[ \t]+\n/g, "\n");
    }, [richSegments]);

    // Like the plain box: the hint stays while the box is empty, focused or not.
    const showRichPlaceholder = isRich && !richPlainText.trim();

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
        setIsDragOver(false);
        if (uploadMode === "none") return;
        const droppedFiles = Array.from(e.dataTransfer.files);
        const filtered = filterByUploadMode(droppedFiles);
        if (filtered.length > 0) {
            handleFileChange([...files, ...filtered]);
        }
    };

    /**
     * `dragenter`/`dragleave` fire for every child the pointer crosses, so a
     * plain boolean flickers. Counting entries against leaves is what keeps the
     * highlight steady while the pointer moves across the toolbar.
     */
    const dragDepth = useRef(0);
    const handleDragEnter = (e: React.DragEvent) => {
        if (uploadMode === "none") return;
        if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
        dragDepth.current += 1;
        setIsDragOver(true);
    };
    const handleDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragOver(false);
    };

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

    const hasText = isRich ? richPlainText.trim().length > 0 : input.trim().length > 0;
    const canUpload = uploadMode !== "none";
    const plusItems: PlusMenuItem[] = [
        ...(canUpload
            ? [{
                icon: Paperclip,
                label: uploadMode === "imagesOnly"
                    ? trText("添加图片", "Add photos")
                    : uploadMode === "filesOnly"
                      ? trText("添加文件", "Add files")
                      : trText("添加图片或文件", "Add files or photos"),
                shortcut: "Ctrl+U",
                onSelect: handleFileUpload,
            }]
            : []),
        ...(onToggleHistory
            ? [{ icon: History, label: trText("历史版本", "History"), disabled: historyDisabled, onSelect: onToggleHistory }]
            : []),
        ...menuItems,
        { icon: SlidersHorizontal, label: trText("记忆与偏好", "Memory"), onSelect: () => openSettings("constraints", constraintScope ? `constraint-${constraintScope}` : undefined) },
    ];

    return (
        <div
            onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u" && canUpload) {
                    e.preventDefault();
                    handleFileUpload();
                }
            }}
        >
        <div
            className={cn(
                "relative rounded-[18px] border border-foreground/[0.12] bg-card shadow-[0_4px_20px_hsl(var(--shadow-hue)/0.04)] transition-[border-color,box-shadow,background-color] duration-base ease-out-soft",
                "hover:border-foreground/20 focus-within:border-foreground/25 focus-within:shadow-[0_4px_24px_hsl(var(--shadow-hue)/0.07)]",
                isDragOver
                    ? "border-foreground/40 border-dashed bg-foreground/[0.03]"
                    : "border-border",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragOver && canUpload && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[18px] bg-card/70 backdrop-blur-[1px] animate-fade-in">
                    <span className="flex items-center gap-2 text-sm font-medium text-primary-strong">
                        <Upload className="h-4 w-4" />
                        {trText("松开以添加文件", "Drop to attach")}
                    </span>
                </div>
            )}
            {canUpload && (
                <input
                    type="file"
                    multiple
                    accept={
                        uploadMode === "imagesOnly"
                            ? "image/*"
                            : uploadMode === "filesOnly"
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

            {/* The words on top, the buttons on a row of their own under them (claude.ai's box). */}
            <div className="px-4 pt-3.5">
                <div className="relative min-w-0">
                {isRich ? (
                    <div className="relative">
                        {showRichPlaceholder && (
                            <div className="pointer-events-none absolute left-0 top-0 truncate text-[15px] leading-6 text-muted-foreground/60">
                                {placeholder || trText("请输入消息...", "Type your message...")}
                            </div>
                        )}
                        <div
                            ref={richRef}
                            contentEditable
                            suppressContentEditableWarning
                            onKeyDown={(e) => {
                                if (isSendKey(e)) {
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
                                "w-full bg-transparent border-none p-0 focus:ring-0 outline-none text-[15px] leading-6 max-h-[360px] overflow-y-auto min-h-[48px] whitespace-pre-wrap break-words"
                            )}
                        />
                    </div>
                ) : (
                    <>
                    {suggestion && !input && <GhostHint text={suggestion} />}
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={suggestion ? "" : placeholder || trText("请输入消息...", "Type your message...")}
                        className="block w-full resize-none bg-transparent border-none p-0 focus:ring-0 outline-none text-[15px] leading-6 max-h-[360px] overflow-y-auto min-h-[48px] placeholder:text-muted-foreground/60"
                        rows={1}
                    />
                    </>
                )}
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
                <PlusMenu items={plusItems} />
                <SendButton
                    hasContent={hasText || files.length > 0}
                    loading={isLoading}
                    onSend={onSubmit}
                    onStop={onStop}
                />
            </div>

            {bottomChips && (
                <div className="px-3 pb-2">
                    {bottomChips}
                </div>
            )}
        </div>
        <StatusRow channels={statusChannels}>{statusExtras}</StatusRow>
        </div>
    );
}
