"use client"

import { Loader2, X } from "lucide-react"
import { AttachmentPreview, fileExtension, formatSize, type PreviewTarget } from "@/shared/chat/attachment-preview"
import { useEffect, useRef, useState } from "react"
import { isPdfFile, isTextFile } from "@/shared/files"
import { type FileData } from "@/shared/files/use-file-processor"
import { useUiLanguage } from "@/shared/i18n"

function formatCharCount(count: number): string {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`
    }
    return String(count)
}

interface FilePreviewListProps {
    files: File[]
    onRemoveFile: (fileToRemove: File) => void
    pdfData?: Map<File, FileData>
}

export function FilePreviewList({
    files,
    onRemoveFile,
    pdfData = new Map(),
}: FilePreviewListProps) {
    const uiLang = useUiLanguage()
    const trText = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText)
    const [preview, setPreview] = useState<PreviewTarget | null>(null)
    const [imageUrls, setImageUrls] = useState<Map<File, string>>(new Map())
    const imageUrlsRef = useRef<Map<File, string>>(new Map())

    // Create and cleanup object URLs when files change
    useEffect(() => {
        const currentUrls = imageUrlsRef.current
        const newUrls = new Map<File, string>()

        files.forEach((file) => {
            if (file.type.startsWith("image/")) {
                // Reuse existing URL if file is already tracked
                const existingUrl = currentUrls.get(file)
                if (existingUrl) {
                    newUrls.set(file, existingUrl)
                } else {
                    newUrls.set(file, URL.createObjectURL(file))
                }
            }
        })

        // Revoke URLs for files that are no longer in the list
        currentUrls.forEach((url, file) => {
            if (!newUrls.has(file)) {
                URL.revokeObjectURL(url)
            }
        })

        imageUrlsRef.current = newUrls
        setImageUrls(newUrls)
    }, [files])

    // Cleanup all URLs on unmount only
    useEffect(() => {
        return () => {
            imageUrlsRef.current.forEach((url) => {
                URL.revokeObjectURL(url)
            })
            // Clear the ref so StrictMode remount creates fresh URLs
            imageUrlsRef.current = new Map()
        }
    }, [])

    if (files.length === 0) return null

    return (
        <>
            <div className="mt-2 flex flex-wrap gap-2">
                {files.map((file, index) => {
                    const imageUrl = imageUrls.get(file) || null
                    const info = pdfData.get(file)
                    const isImage = file.type.startsWith("image/")
                    const secondary = info?.isExtracting
                        ? trText("解析中…", "Reading…")
                        : info?.charCount
                            ? trText(`${formatCharCount(info.charCount)} 字`, `${formatCharCount(info.charCount)} chars`)
                            : formatSize(file.size)
                    const open = () =>
                        setPreview(
                            isImage && imageUrl
                                ? { name: file.name, imageUrl }
                                : { name: file.name, file, text: !isPdfFile(file) && !isTextFile(file) ? info?.text : undefined },
                        )
                    return (
                        <div
                            key={file.name + index}
                            className="group/att relative animate-rise-in"
                            style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                        >
                            <button
                                type="button"
                                title={trText(`预览 ${file.name}`, `Preview ${file.name}`)}
                                onClick={open}
                                className="block size-[104px] overflow-hidden rounded-xl border border-border/80 bg-card text-left shadow-xs transition-[border-color,box-shadow,transform] duration-fast ease-out-soft hover:-translate-y-px hover:border-foreground/25 hover:shadow-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
                            >
                                {isImage && imageUrl ? (
                                    <img src={imageUrl} alt={file.name} className="h-full w-full object-cover" />
                                ) : (
                                    <span className="flex h-full flex-col justify-between p-2.5">
                                        <span className="line-clamp-3 break-all text-[12px] font-medium leading-snug text-foreground">{file.name}</span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="rounded border border-border/90 bg-background px-1 py-px text-[10px] font-medium tracking-wide text-muted-foreground">
                                                {fileExtension(file.name)}
                                            </span>
                                            <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] text-muted-foreground">
                                                {info?.isExtracting && <Loader2 className="size-3 animate-spin" />}
                                                {secondary}
                                            </span>
                                        </span>
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => onRemoveFile(file)}
                                aria-label={trText("移除文件", "Remove file")}
                                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 group-hover/att:opacity-100"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    )
                })}
            </div>
            <AttachmentPreview target={preview} onClose={() => setPreview(null)} />
        </>
    )
}
