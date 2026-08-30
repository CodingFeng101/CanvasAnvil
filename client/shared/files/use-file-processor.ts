"use client"

import { useState } from "react"
import { toast } from "sonner"
import { getAIConfig } from "@/ai/storage";
import {
    MAX_EXTRACTED_CHARS,
    isPdfFile,
    isTarGzFile,
    isTextFile,
    isWordFile,
    isZipFile,
} from "@/shared/files/detect"
import { extractPdfText, extractTextFileContent, extractWordText } from "@/shared/files/extract-text"
import {
    extractLatexTarGzText,
    extractLatexTarGzVisualAssets,
    extractLatexZipText,
    extractLatexZipVisualAssets,
} from "@/shared/files/latex-archives"
import {
    extractPdfVisualAssets,
    extractThirdPartyVisualAssets,
    extractWordVisualAssets,
} from "@/shared/files/visual-assets"
import type { ExtractedVisualAsset } from "@/shared/files/types"

/**
 * Turns dropped files into prompt-ready text plus the figures worth showing a
 * model. Shared by every workspace's chat input.
 */

export type FileWorkspace = "flow" | "cad" | "ppt" | "unknown"

export interface FileData {
    text: string
    charCount: number
    isExtracting: boolean
    visualAssets?: ExtractedVisualAsset[]
}

const MINERU_API_BASE = "https://mineru.net"

/** Which extractors handle a file, and whether MinerU can improve on them. */
type ExtractionPlan = {
    /** Telemetry label; only the formats MinerU understands set one. */
    kind?: "pdf" | "word"
    extractText: (file: File) => Promise<string>
    extractVisuals?: (file: File) => Promise<ExtractedVisualAsset[]>
}

function planFor(file: File): ExtractionPlan | null {
    if (isPdfFile(file)) {
        return { kind: "pdf", extractText: extractPdfText, extractVisuals: extractPdfVisualAssets }
    }
    if (isWordFile(file)) {
        return { kind: "word", extractText: extractWordText, extractVisuals: extractWordVisualAssets }
    }
    if (isZipFile(file)) {
        return { extractText: extractLatexZipText, extractVisuals: extractLatexZipVisualAssets }
    }
    if (isTarGzFile(file)) {
        return { extractText: extractLatexTarGzText, extractVisuals: extractLatexTarGzVisualAssets }
    }
    if (isTextFile(file)) {
        return { extractText: extractTextFileContent }
    }
    return null
}

type ParserSource = "third_party" | "local" | "third_party_fallback_local"

function reportParserSource(params: {
    workspace: FileWorkspace
    file: File
    parserSource: ParserSource
    detail?: string
}) {
    return fetch("/api/log-file-parser", {
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
    }).catch((error) => console.warn("Failed to report file parser source", error))
}

/**
 * MinerU reads layout far better than the local extractors, but only for PDF
 * and Word and only when the user configured a token. Any failure falls back
 * to local extraction rather than losing the figures entirely.
 */
async function extractVisuals(
    file: File,
    plan: ExtractionPlan,
    workspace: FileWorkspace,
): Promise<ExtractedVisualAsset[]> {
    if (!plan.extractVisuals) return []

    const apiToken = String(getAIConfig().fileParserApiToken || "").trim()
    if (!apiToken || !plan.kind) {
        if (plan.kind) {
            void reportParserSource({ workspace, file, parserSource: "local", detail: plan.kind })
        }
        return await plan.extractVisuals(file)
    }

    try {
        const assets = await extractThirdPartyVisualAssets(file, { apiBase: MINERU_API_BASE, apiToken })
        void reportParserSource({ workspace, file, parserSource: "third_party", detail: plan.kind })
        return assets
    } catch (error) {
        console.error("Third-party parser failed, falling back to local extraction:", error)
        void reportParserSource({
            workspace,
            file,
            parserSource: "third_party_fallback_local",
            detail: plan.kind,
        })
        return await plan.extractVisuals(file)
    }
}

export function useFileProcessor(workspace: FileWorkspace = "unknown") {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map())

    const setFileData = (file: File, data: FileData) =>
        setPdfData((prev) => new Map(prev).set(file, data))

    const dropFileData = (file: File) =>
        setPdfData((prev) => {
            const next = new Map(prev)
            next.delete(file)
            return next
        })

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        for (const file of newFiles) {
            if (pdfData.has(file)) continue
            const plan = planFor(file)
            if (!plan) continue

            setFileData(file, { text: "", charCount: 0, isExtracting: true })

            try {
                const text = await plan.extractText(file)

                // Oversized files are rejected outright: a truncated document
                // silently produces a wrong answer, which is worse than none.
                if (text.length > MAX_EXTRACTED_CHARS) {
                    toast.error(
                        `${file.name}: Content exceeds ${MAX_EXTRACTED_CHARS / 1000}k character limit (${(text.length / 1000).toFixed(1)}k chars)`,
                    )
                    dropFileData(file)
                    setFiles((prev) => prev.filter((f) => f !== file))
                    continue
                }

                setFileData(file, {
                    text,
                    charCount: text.length,
                    isExtracting: false,
                    visualAssets: await extractVisuals(file, plan, workspace),
                })
            } catch (error) {
                console.error("Failed to extract text:", error)
                toast.error(`Failed to read file: ${file.name}`)
                dropFileData(file)
            }
        }

        // Forget anything the user removed while extraction was running.
        setPdfData((prev) => {
            const next = new Map(prev)
            for (const key of prev.keys()) {
                if (!newFiles.includes(key)) next.delete(key)
            }
            return next
        })
    }

    return {
        files,
        pdfData,
        visualAssets: Array.from(pdfData.values()).flatMap((data) => data.visualAssets || []),
        handleFileChange,
        setFiles,
    }
}
