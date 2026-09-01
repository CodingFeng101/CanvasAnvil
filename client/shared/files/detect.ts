/** File-type detection and the shared extraction size limit. */

// Maximum characters allowed for extracted text (configurable via env)
const DEFAULT_MAX_EXTRACTED_CHARS = 150000 // 150k chars
const viteMaxExtractedChars =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_MAX_EXTRACTED_CHARS !== "undefined"
        ? Number(import.meta.env.VITE_MAX_EXTRACTED_CHARS)
        : NaN
export const MAX_EXTRACTED_CHARS =
    (Number.isFinite(viteMaxExtractedChars) ? viteMaxExtractedChars : NaN) ||
    DEFAULT_MAX_EXTRACTED_CHARS

// Text file extensions we support
const TEXT_EXTENSIONS = [
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".go",
    ".rs",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".log",
    ".sh",
    ".bash",
    ".zsh",
    ".tex",
]

/**
 * Extract text content from a PDF file
 * Uses unpdf library for client-side extraction

 */
export function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || file.name.endsWith(".pdf")
}

/**
 * Check if a file is a Word document (.docx).
 */
export function isWordFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return (
        file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        name.endsWith(".docx")
    )
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

export function isZipFile(file: File): boolean {
    const name = file.name.toLowerCase()
    const type = String(file.type || "").toLowerCase()
    if (name.endsWith(".zip")) return true
    return (
        type === "application/zip" ||
        type === "application/x-zip-compressed" ||
        type === "application/octet-stream"
    )
}

export function isTarGzFile(file: File): boolean {
    const name = file.name.toLowerCase()
    const type = String(file.type || "").toLowerCase()
    if (name.endsWith(".tgz") || name.endsWith(".tar.gz")) return true
    return type === "application/gzip" || type === "application/x-gzip"
}
