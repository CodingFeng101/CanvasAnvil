"use client"

import { FileCode, FileText, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { type FileData } from "@/lib/use-file-processor"
import { useUiLanguage } from "@/lib/use-ui-language"

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
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
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

    // Clear selected image if its URL was revoked
    useEffect(() => {
        if (
            selectedImage &&
            !Array.from(imageUrls.values()).includes(selectedImage)
        ) {
            setSelectedImage(null)
        }
    }, [imageUrls, selectedImage])

    if (files.length === 0) return null

    return (
        <>
            <div className="flex flex-wrap gap-2 mt-2 p-2 bg-muted/50 rounded-md">
                {files.map((file, index) => {
                    const imageUrl = imageUrls.get(file) || null
                    const pdfInfo = pdfData.get(file)
                    const isImage = file.type.startsWith("image/")
                    const isPdf = isPdfFile(file)
                    const isText = isTextFile(file)
                    const secondary = pdfInfo?.isExtracting
                        ? trText("解析中...", "Reading...")
                        : pdfInfo?.charCount
                            ? trText(`${formatCharCount(pdfInfo.charCount)} 字符`, `${formatCharCount(pdfInfo.charCount)} chars`)
                            : isPdf
                                ? trText("PDF 文档", "PDF")
                                : isText
                                    ? trText("文本", "Text")
                                    : ""
                    return (
                        <div key={file.name + index} className="group">
                            <div
                                className="flex items-center gap-2.5 w-[260px] max-w-full border rounded-lg overflow-hidden bg-background/70 px-3 py-2"
                            >
                                <div
                                    className={`h-11 w-11 rounded-md overflow-hidden bg-muted flex items-center justify-center ${
                                        isImage && imageUrl ? "cursor-pointer" : ""
                                    }`}
                                    onClick={() => {
                                        if (isImage && imageUrl) setSelectedImage(imageUrl)
                                    }}
                                >
                                    {isImage && imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={file.name}
                                            className="object-cover w-full h-full"
                                        />
                                    ) : (
                                        <>
                                            {pdfInfo?.isExtracting ? (
                                                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                            ) : isPdf ? (
                                                <FileText className="h-5 w-5 text-red-500" />
                                            ) : (
                                                <FileCode className="h-5 w-5 text-blue-500" />
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">{file.name}</div>
                                    {secondary ? (
                                        <div className="text-[10px] text-muted-foreground truncate">
                                            {secondary}
                                        </div>
                                    ) : null}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onRemoveFile(file)}
                                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    aria-label={trText("移除文件", "Remove file")}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Image Modal/Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 hover:bg-gray-200 transition-colors"
                        onClick={() => setSelectedImage(null)}
                        aria-label={trText("关闭", "Close")}
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <div className="relative w-auto h-auto max-w-[90vw] max-h-[90vh]">
                        <img
                            src={selectedImage}
                            alt={trText("上传图片的全尺寸预览", "Full size preview of uploaded diagram or image")}
                            className="object-contain max-w-full max-h-[90vh] w-auto h-auto"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
