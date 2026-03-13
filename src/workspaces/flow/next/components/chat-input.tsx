"use client"

import {
    Brain,
    FileText,
    History,
    Image as ImageIcon,
    ScrollText,
    Send,
    Square,
    Trash2,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ButtonWithTooltip } from "@/workspaces/flow/next/components/button-with-tooltip"
import { ErrorToast } from "@/workspaces/flow/next/components/error-toast"
import { GlobalConstraintsDialog } from "@/workspaces/flow/next/components/global-constraints-dialog"
import { HistoryDialog } from "@/workspaces/flow/next/components/history-dialog"
import { ResetWarningModal } from "@/workspaces/flow/next/components/reset-warning-modal"
import { Textarea } from "@/workspaces/flow/next/components/ui/textarea"
import { useDiagram } from "@/workspaces/flow/next/contexts/diagram-context"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"
import { isPdfFile, isTextFile } from "@/workspaces/flow/next/lib/pdf-utils"
import { FilePreviewList } from "./file-preview-list"

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
        errors.push(`最多只能上传 ${MAX_FILES} 个文件`)
        return { validFiles, errors }
    }

    for (const file of newFiles) {
        if (validFiles.length >= availableSlots) {
            errors.push(`还可再上传 ${availableSlots} 个文件`)
            break
        }
        if (!isValidFileType(file)) {
            errors.push(`"${file.name}" 不是支持的文件类型`)
            continue
        }
        // Only check size for images (PDFs/text files are extracted client-side, so file size doesn't matter)
        const isExtractedFile = isPdfFile(file) || isTextFile(file)
        if (!isExtractedFile && file.size > MAX_IMAGE_SIZE) {
            const maxSizeMB = MAX_IMAGE_SIZE / 1024 / 1024
            errors.push(
                `"${file.name}" 大小为 ${formatFileSize(file.size)}（超过 ${maxSizeMB}MB）`,
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
                    {errors.length} 个文件校验失败：
                </span>
                <ul className="text-muted-foreground text-xs list-disc list-inside">
                    {errors.slice(0, 3).map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                    {errors.length > 3 && (
                        <li>...以及另外 {errors.length - 3} 个</li>
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
}: ChatInputProps) {
    const { t } = useLanguage()
    const { diagramHistory } = useDiagram()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [showClearDialog, setShowClearDialog] = useState(false)
    const [showConstraintsDialog, setShowConstraintsDialog] = useState(false)

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

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e)
        adjustTextareaHeight()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
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

    const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []).filter((file) =>
            file.type.startsWith("image/"),
        )
        appendValidatedFiles(newFiles)
        if (imageInputRef.current) {
            imageInputRef.current.value = ""
        }
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []).filter(
            (file) => isPdfFile(file) || isTextFile(file) || isWordFile(file),
        )
        appendValidatedFiles(newFiles)
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleRemoveFile = (fileToRemove: File) => {
        onFileChange(files.filter((file) => file !== fileToRemove))
        if (imageInputRef.current) {
            imageInputRef.current.value = ""
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const triggerImageInput = () => {
        imageInputRef.current?.click()
    }

    const triggerFileInput = () => {
        fileInputRef.current?.click()
    }

    const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
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

    const handleClear = () => {
        onClearChat()
        setShowClearDialog(false)
    }

    return (
        <form
            onSubmit={onSubmit}
            className={`w-full transition-all duration-200 ${
                isDragging
                    ? "ring-2 ring-primary ring-offset-2 rounded-2xl"
                    : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* File previews */}
            {files.length > 0 && (
                <div className="mb-3">
                    <FilePreviewList
                        files={files}
                        onRemoveFile={handleRemoveFile}
                        pdfData={pdfData}
                    />
                </div>
            )}

            {/* Input container */}
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={t("input.placeholder")}
                    disabled={isDisabled}
                    aria-label="聊天输入"
                    className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />

                {/* Action bar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                    {/* Left actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowClearDialog(true)}
                            tooltipContent={t("input.clear")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowConstraintsDialog(true)}
                            tooltipContent={t("tooltip.global_constraints")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <ScrollText className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ResetWarningModal
                            open={showClearDialog}
                            onOpenChange={setShowClearDialog}
                            onClear={handleClear}
                        />

                        <GlobalConstraintsDialog
                            open={showConstraintsDialog}
                            onOpenChange={setShowConstraintsDialog}
                        />

                        <HistoryDialog
                            showHistory={showHistory}
                            onToggleHistory={onToggleHistory}
                        />
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onToggleDeepThinking}
                            disabled={isDisabled}
                            tooltipContent={t("tooltip.deep_thinking")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            aria-pressed={deepThinkingEnabled}
                            aria-label={t("input.deep_thinking")}
                        >
                            <Brain
                                className={`h-3.5 w-3.5 ${
                                    deepThinkingEnabled
                                        ? "text-blue-600"
                                        : "text-muted-foreground"
                                }`}
                            />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggleHistory(true)}
                            disabled={isDisabled || diagramHistory.length === 0}
                            tooltipContent={t("tooltip.history")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <History className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={triggerImageInput}
                            disabled={isDisabled}
                            tooltipContent={t("input.upload_image")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={triggerFileInput}
                            disabled={isDisabled}
                            tooltipContent={t("input.upload_file_types")}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <FileText className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <input
                            type="file"
                            ref={imageInputRef}
                            className="hidden"
                            onChange={handleImageInputChange}
                            accept="image/*"
                            multiple
                            disabled={isDisabled}
                        />

                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileInputChange}
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml,.py,.js,.ts"
                            multiple
                            disabled={isDisabled}
                        />

                        <div className="w-px h-5 bg-border mx-1" />

                        {isProcessing ? (
                            <ButtonWithTooltip
                                type="button"
                                variant="default"
                                size="sm"
                                tooltipContent={t("input.stop")}
                                onClick={(e) => {
                                    e.preventDefault()
                                    onStop?.()
                                }}
                                className="h-8 w-8 p-0 rounded-xl shadow-sm"
                                aria-label="停止生成"
                            >
                                <Square className="h-3.5 w-3.5 fill-current" />
                            </ButtonWithTooltip>
                        ) : (
                            <ButtonWithTooltip
                                type="submit"
                                variant="default"
                                size="sm"
                                tooltipContent={t("input.send")}
                                disabled={isDisabled || !input.trim()}
                                className="h-8 w-8 p-0 rounded-xl shadow-sm"
                                aria-label={
                                    isDisabled ? "发送中..." : "发送消息"
                                }
                            >
                                <Send className="h-4 w-4" />
                            </ButtonWithTooltip>
                        )}
                    </div>
                </div>
            </div>
        </form>
    )
}

