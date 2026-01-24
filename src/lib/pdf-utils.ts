import { extractText, getDocumentProxy } from "unpdf"

// Maximum characters allowed for extracted text (configurable via env)
const DEFAULT_MAX_EXTRACTED_CHARS = 150000 // 150k chars
export const MAX_EXTRACTED_CHARS = DEFAULT_MAX_EXTRACTED_CHARS

// Text file extensions we support
const TEXT_EXTENSIONS = [
    ".txt", ".md", ".markdown", ".json", ".csv", ".xml", ".html", ".css", ".js", ".ts",
    ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".go", ".rs", ".yaml", ".yml",
    ".toml", ".ini", ".log", ".sh", ".bash", ".zsh"
]

/**
 * Extract text content from a PDF file
 * Uses unpdf library for client-side extraction
 */
export async function extractPdfText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text as string
}

export async function getPdfPageCountFromUrl(url: string): Promise<number> {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    return (pdf as any).numPages ?? 0
}

export async function getPdfDocumentFromUrl(url: string): Promise<any> {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    return await getDocumentProxy(new Uint8Array(buffer))
}

export async function renderPdfPageToCanvas(opts: { pdf: any; pageNumber: number; canvas: HTMLCanvasElement; targetWidth: number }): Promise<void> {
    const page = await opts.pdf.getPage(opts.pageNumber)
    const viewportAtScale1 = page.getViewport({ scale: 1 })
    const scale = opts.targetWidth / viewportAtScale1.width
    const viewport = page.getViewport({ scale })

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    opts.canvas.width = Math.floor(viewport.width * dpr)
    opts.canvas.height = Math.floor(viewport.height * dpr)
    opts.canvas.style.width = `${Math.floor(viewport.width)}px`
    opts.canvas.style.height = `${Math.floor(viewport.height)}px`
    const ctx = opts.canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    await page.render({ canvasContext: ctx, viewport }).promise
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || file.name.endsWith(".pdf")
}

/**
 * Check if a file is a text file
 */
export function isTextFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return (
        file.type.startsWith("text/") ||
        file.type === "application/json" ||
        TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
    )
}

/**
 * Extract text content from a text file
 */
export async function extractTextFileContent(file: File): Promise<string> {
    return await file.text()
}
