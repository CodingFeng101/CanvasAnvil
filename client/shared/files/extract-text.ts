import { extractText, getDocumentProxy } from "unpdf"
import * as mammoth from "mammoth"

/** Plain-text extraction for the formats the chat panels accept directly. */

/** Extracts a PDF's text in the browser via unpdf, with pages merged. */
export async function extractPdfText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text as string
}

export async function extractTextFileContent(file: File): Promise<string> {
    return await file.text()
}

export async function extractWordText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return String(result.value || "")
}
