"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
    extractPdfText,
    extractWordText,
    extractTextFileContent,
    extractPdfVisualAssets,
    extractWordVisualAssets,
    extractThirdPartyVisualAssets,
    extractLatexZipText,
    extractLatexZipVisualAssets,
    extractLatexTarGzText,
    extractLatexTarGzVisualAssets,
    type ExtractedVisualAsset,
    isPdfFile,
    isWordFile,
    isTextFile,
    isZipFile,
    isTarGzFile,
    MAX_EXTRACTED_CHARS,
} from "@/workspaces/flow/next/lib/pdf-utils"
import { getAIConfig } from "@/lib/ai-client"

export interface FileData {
    text: string
    charCount: number
    isExtracting: boolean
    visualAssets?: ExtractedVisualAsset[]
}

type ParserSource = "third_party" | "local" | "third_party_fallback_local"

const reportFileParserSource = async (params: {
    workspace: "flow" | "ppt" | "unknown"
    file: File
    parserSource: ParserSource
    detail?: string
}) => {
    try {
        await fetch("/api/log-file-parser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspace: params.workspace,
                fileName: params.file.name,
                mimeType: params.file.type || "",
                fileSize: params.file.size || 0,
                parserSource: params.parserSource,
                detail: params.detail || "",
            }),
            keepalive: true,
        })
    } catch (e) {
        console.warn("Failed to report file parser source", e)
    }
}

/**
 * Hook for processing file uploads, especially PDFs and text files.
 * Handles text extraction, character limit validation, and cleanup.
 */
export function useFileProcessor(workspace: "flow" | "ppt" | "unknown" = "unknown") {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map())

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        // Extract text immediately for new PDF/text files
        for (const file of newFiles) {
            const needsExtraction =
                (isPdfFile(file) ||
                    isWordFile(file) ||
                    isTextFile(file) ||
                    isZipFile(file) ||
                    isTarGzFile(file)) &&
                !pdfData.has(file)
            if (needsExtraction) {
                // Mark as extracting
                setPdfData((prev) => {
                    const next = new Map(prev)
                    next.set(file, {
                        text: "",
                        charCount: 0,
                        isExtracting: true,
                    })
                    return next
                })

                // Extract text asynchronously
                try {
                    const aiConfig = getAIConfig()
                    const parserToken = String(aiConfig.fileParserApiToken || "").trim()
                    const parserBase = "https://mineru.net"
                    const supportsThirdParty = isPdfFile(file) || isWordFile(file)
                    // Rule: if MinerU token is configured, prefer third-party parser;
                    // otherwise use local extraction.
                    const useThirdPartyVisualParser =
                        Boolean(parserToken) && supportsThirdParty

                    let text: string
                    let visualAssets: ExtractedVisualAsset[] = []
                    if (isPdfFile(file)) {
                        text = await extractPdfText(file)
                        if (useThirdPartyVisualParser) {
                            try {
                                visualAssets = await extractThirdPartyVisualAssets(file, {
                                    apiBase: parserBase,
                                    apiToken: parserToken,
                                })
                                void reportFileParserSource({
                                    workspace,
                                    file,
                                    parserSource: "third_party",
                                    detail: "pdf",
                                })
                            } catch (e) {
                                console.error("Third-party parser failed, fallback to local PDF extraction:", e)
                                visualAssets = await extractPdfVisualAssets(file)
                                void reportFileParserSource({
                                    workspace,
                                    file,
                                    parserSource: "third_party_fallback_local",
                                    detail: "pdf",
                                })
                            }
                        } else {
                            visualAssets = await extractPdfVisualAssets(file)
                            void reportFileParserSource({
                                workspace,
                                file,
                                parserSource: "local",
                                detail: "pdf",
                            })
                        }
                    } else if (isWordFile(file)) {
                        text = await extractWordText(file)
                        if (useThirdPartyVisualParser) {
                            try {
                                visualAssets = await extractThirdPartyVisualAssets(file, {
                                    apiBase: parserBase,
                                    apiToken: parserToken,
                                })
                                void reportFileParserSource({
                                    workspace,
                                    file,
                                    parserSource: "third_party",
                                    detail: "word",
                                })
                            } catch (e) {
                                console.error("Third-party parser failed, fallback to local Word extraction:", e)
                                visualAssets = await extractWordVisualAssets(file)
                                void reportFileParserSource({
                                    workspace,
                                    file,
                                    parserSource: "third_party_fallback_local",
                                    detail: "word",
                                })
                            }
                        } else {
                            visualAssets = await extractWordVisualAssets(file)
                            void reportFileParserSource({
                                workspace,
                                file,
                                parserSource: "local",
                                detail: "word",
                            })
                        }
                    } else if (isZipFile(file)) {
                        // LaTeX bundle (.zip): parse tex + includegraphics to extract original figures.
                        text = await extractLatexZipText(file)
                        visualAssets = await extractLatexZipVisualAssets(file)
                    } else if (isTarGzFile(file)) {
                        // LaTeX bundle (.tar.gz/.tgz)
                        text = await extractLatexTarGzText(file)
                        visualAssets = await extractLatexTarGzVisualAssets(file)
                    } else {
                        text = await extractTextFileContent(file)
                    }

                    // Check character limit
                    if (text.length > MAX_EXTRACTED_CHARS) {
                        const limitK = MAX_EXTRACTED_CHARS / 1000
                        toast.error(
                            `${file.name}: Content exceeds ${limitK}k character limit (${(text.length / 1000).toFixed(1)}k chars)`,
                        )
                        setPdfData((prev) => {
                            const next = new Map(prev)
                            next.delete(file)
                            return next
                        })
                        // Remove the file from the list
                        setFiles((prev) => prev.filter((f) => f !== file))
                        continue
                    }

                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.set(file, {
                            text,
                            charCount: text.length,
                            isExtracting: false,
                            visualAssets,
                        })
                        return next
                    })
                } catch (error) {
                    console.error("Failed to extract text:", error)
                    toast.error(`Failed to read file: ${file.name}`)
                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.delete(file)
                        return next
                    })
                }
            }
        }

        // Clean up pdfData for removed files
        setPdfData((prev) => {
            const next = new Map(prev)
            for (const key of prev.keys()) {
                if (!newFiles.includes(key)) {
                    next.delete(key)
                }
            }
            return next
        })
    }

    return {
        files,
        pdfData,
        visualAssets: Array.from(pdfData.values()).flatMap((x) => x.visualAssets || []),
        handleFileChange,
        setFiles, // Export for external control (e.g., clearing files)
    }
}

