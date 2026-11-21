"use client"

import { isSendKey } from "@/shared/preferences"
import { History, Paperclip, SlidersHorizontal, Upload } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { PlusMenu, SendButton, StatusRow, type PlusMenuItem } from "@/shared/chat/composer"
import { openSettings } from "@/shared/settings-bus"
import { useUiLanguage } from "@/shared/i18n"
import { ErrorToast } from "@/workspaces/diagram/chat/error-toast"
import { HistoryDialog } from "@/workspaces/diagram/chat/history-dialog"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"
import { useDiagram } from "@/workspaces/diagram/state/diagram-context"
import { translateDiagram, useDiagramT } from "@/workspaces/diagram/lib/translations"
import { isPdfFile, isTextFile } from "@/shared/files"
import { FilePreviewList } from "@/shared/chat"
import { useReferenceAttachments } from "@/shared/references/use-reference-attachments"

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_FILES = 5

function isWordFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return (
        file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        name.endsWith(".docx")
    )
}

function isValidFileType(file: File): boolean {
    return (
        file.type.startsWith("image/") ||
        isPdfFile(file) ||
        isTextFile(file) ||
        isWordFile(file)
    )
}

function formatFileSize(bytes: number): string {
    const mb = bytes / 1024 / 1024
    if (mb < 0.01) return `${(bytes / 1024).toFixed(0)}KB`
    return `${mb.toFixed(2)}MB`
}

function showErrorToast(message: React.ReactNode) {
    toast.custom(
        (t) => (
            <ErrorToast message={message} onDismiss={() => toast.dismiss(t)} />
        ),
        { duration: 5000 },
    )
}

interface ValidationResult {
    validFiles: File[]
    errors: string[]
}

function validateFiles(
    newFiles: File[],
    existingCount: number,
): ValidationResult {
    const errors: string[] = []
    const validFiles: File[] = []

    const availableSlots = MAX_FILES - existingCount

    if (availableSlots <= 0) {
        errors.push(translateDiagram("files.too_many", { max: MAX_FILES }))
        return { validFiles, errors }
    }

    for (const file of newFiles) {
        if (validFiles.length >= availableSlots) {
            errors.push(translateDiagram("files.slots_left", { n: availableSlots }))
            break
        }
        if (!isValidFileType(file)) {
            errors.push(translateDiagram("files.unsupported", { name: file.name }))
            continue
        }
        // Only check size for images (PDFs/text files are extracted client-side, so file size doesn't matter)
        const isExtractedFile = isPdfFile(file) || isTextFile(file)
        if (!isExtractedFile && file.size > MAX_IMAGE_SIZE) {
            const maxSizeMB = MAX_IMAGE_SIZE / 1024 / 1024
            errors.push(
                translateDiagram("files.too_large", { name: file.name, size: formatFileSize(file.size), max: maxSizeMB }),
            )
        } else {
            validFiles.push(file)
        }
    }

    return { validFiles, errors }
}

function showValidationErrors(errors: string[]) {
    if (errors.length === 0) return

    if (errors.length === 1) {
        showErrorToast(
            <span className="text-muted-foreground">{errors[0]}</span>,
        )
    } else {
        showErrorToast(
            <div className="flex flex-col gap-1">
                <span className="font-medium">
                    {translateDiagram("files.failed_count", { n: errors.length })}
                </span>
                <ul className="text-muted-foreground text-xs list-disc list-inside">
                    {errors.slice(0, 3).map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                    {errors.length > 3 && (
                        <li>{translateDiagram("files.and_more", { n: errors.length - 3 })}</li>
                    )}
                </ul>
            </div>,
        )
    }
}

interface ChatInputProps {
    input: string
    status: "submitted" | "streaming" | "ready" | "error"
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    onClearChat: () => void
    onStop?: () => void
    files?: File[]
    onFileChange?: (files: File[]) => void
    pdfData?: Map<
        File,
        { text: string; charCount: number; isExtracting: boolean }
    >
    showHistory?: boolean
    onToggleHistory?: (show: boolean) => void
    error?: Error | null
    deepThinkingEnabled?: boolean
    onToggleDeepThinking?: () => void
    /** Bumped by the parent to move focus here, e.g. after an example prompt was picked. */
    focusKey?: number
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    onClearChat,
    onStop,
    files = [],
    onFileChange = () => {},
    pdfData = new Map(),
    showHistory = false,
    onToggleHistory = () => {},
    error = null,
    deepThinkingEnabled = false,
    onToggleDeepThinking = () => {},
    focusKey,
}: ChatInputProps) {
    const t = useDiagramT()
    const { diagramHistory } = useDiagram()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const dragDepth = useRef(0)

    // Check if system is currently processing
    const isProcessing = status === "streaming" || status === "submitted"
    
    // Allow input only when not processing (or if there was an error)
    const isDisabled = isProcessing && !error

    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = "auto"
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
        }
    }, [])

    // Handle programmatic input changes (e.g., setInput("") after form submission)
    useEffect(() => {
        adjustTextareaHeight()
    }, [input, adjustTextareaHeight])

    useEffect(() => {
        if (!focusKey) return
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }, [focusKey])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e)
        adjustTextareaHeight()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isSendKey(e)) {
            e.preventDefault()
            const form = e.currentTarget.closest("form")
            if (form && input.trim() && !isDisabled) {
                form.requestSubmit()
            }
            return
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (isDisabled) return

        const items = e.clipboardData.items
        const imageItems = Array.from(items).filter((item) =>
            item.type.startsWith("image/"),
        )

        if (imageItems.length > 0) {
            const imageFiles = (
                await Promise.all(
                    imageItems.map(async (item, index) => {
                        const file = item.getAsFile()
                        if (!file) return null
                        return new File(
                            [file],
                            `pasted-image-${Date.now()}-${index}.${file.type.split("/")[1]}`,
                            { type: file.type },
                        )
                    }),
                )
            ).filter((f): f is File => f !== null)

            const { validFiles, errors } = validateFiles(
                imageFiles,
                files.length,
            )
            showValidationErrors(errors)
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles])
            }
        }
    }

    const appendValidatedFiles = (incomingFiles: File[]) => {
        const { validFiles, errors } = validateFiles(incomingFiles, files.length)
        showValidationErrors(errors)
        if (validFiles.length > 0) {
            onFileChange([...files, ...validFiles])
        }
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []).filter((file) => isValidFileType(file))
        appendValidatedFiles(newFiles)
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleRemoveFile = (fileToRemove: File) => {
        onFileChange(files.filter((file) => file !== fileToRemove))
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const triggerFileInput = () => {
        fileInputRef.current?.click()
    }

    const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDragEnter = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return
        dragDepth.current += 1
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (isDisabled) return

        const droppedFiles = e.dataTransfer.files
        const supportedFiles = Array.from(droppedFiles).filter((file) =>
            isValidFileType(file),
        )

        const { validFiles, errors } = validateFiles(
            supportedFiles,
            files.length,
        )
        showValidationErrors(errors)
        if (validFiles.length > 0) {
            onFileChange([...files, ...validFiles])
        }
    }

    const hasContent = !!input.trim() && !isDisabled
    const zh = useUiLanguage() === "zh"
    const reference = useReferenceAttachments({ workspace: "diagram", accept: ["image", "file", "text"], files, setFiles: onFileChange })
    const plusItems: PlusMenuItem[] = [
        {
            icon: Paperclip,
            label: zh ? "添加图片或文件" : "Add files or photos",
            shortcut: "Ctrl+U",
            disabled: isDisabled,
            onSelect: triggerFileInput,
        },
        {
            icon: History,
            label: zh ? "历史版本" : "History",
            disabled: isDisabled || diagramHistory.length === 0,
            onSelect: () => onToggleHistory(true),
        },
        ...(reference.menuItem && !isDisabled ? [reference.menuItem] : []),
        {
            icon: SlidersHorizontal,
            label: zh ? "记忆与偏好" : "Memory",
            onSelect: () => openSettings("constraints", "constraint-diagram"),
        },
    ]

    return (
        <form
            onSubmit={onSubmit}
            className="w-full"
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
                    e.preventDefault()
                    triggerFileInput()
                }
            }}
        >
            <HistoryDialog
                showHistory={showHistory}
                onToggleHistory={onToggleHistory}
            />
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileInputChange}
                accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml,.py,.js,.ts"
                multiple
                disabled={isDisabled}
            />

            {/* Input container */}
            <div
                className={cn(
                    "relative rounded-[18px] border border-foreground/[0.12] bg-card shadow-[0_4px_20px_hsl(var(--shadow-hue)/0.04)] transition-[border-color,box-shadow,background-color] duration-base ease-out-soft",
                    "hover:border-foreground/20 focus-within:border-foreground/25 focus-within:shadow-[0_4px_24px_hsl(var(--shadow-hue)/0.07)]",
                    isDragging
                        ? "border-foreground/40 border-dashed bg-foreground/[0.03]"
                        : "border-border",
                )}
            >
                {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[18px] bg-card/70 backdrop-blur-[1px] animate-fade-in">
                        <span className="flex items-center gap-2 text-sm font-medium text-primary-strong">
                            <Upload className="h-4 w-4" />
                            {t("chat.drop_to_attach")}
                        </span>
                    </div>
                )}
                {reference.cards && <div className="px-3 pt-3">{reference.cards}</div>}
                {reference.plainFiles.length > 0 && (
                    <div className="px-3 pt-3">
                        <FilePreviewList
                            files={reference.plainFiles}
                            onRemoveFile={handleRemoveFile}
                            pdfData={pdfData}
                        />
                    </div>
                )}
                <div className="px-4 pt-3.5">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={t("input.placeholder")}
                        disabled={isDisabled}
                        aria-label={t("input.aria")}
                        rows={1}
                        className="min-h-[48px] max-h-[200px] w-full resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                    />
                </div>
                <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
                    <PlusMenu items={plusItems} />
                    <SendButton
                        submit
                        hasContent={hasContent}
                        loading={isProcessing}
                        onStop={onStop}
                    />
                </div>
            </div>
            {/* Deep thinking sketches the diagram with the image model first, so it is named only then. */}
            <StatusRow channels={deepThinkingEnabled ? ["image", "text"] : ["text"]} thinking={{ on: deepThinkingEnabled, onChange: () => onToggleDeepThinking() }} />
        </form>
    )
}
