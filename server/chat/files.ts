import { extractText, getDocumentProxy } from "unpdf"
import mammoth from "mammoth"

/**
 * Reads uploaded attachments server-side.
 *
 * The browser sends each file as a data URL; PDFs and .docx are unpacked here
 * rather than in the client so a large upload does not block the UI thread.
 */

// Must match the client-side limits.
export const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
export const MAX_FILES = 5

export const SUMMARY_CONCURRENCY = 50
export const CHUNK_TOKEN_TARGET = 2500
export const RECURSIVE_THRESHOLD_TOKENS = 50000

export type UploadedFilePayload = {
    name: string
    mediaType?: string
    dataUrl: string
    extractedText?: string
}

export function estimateTokens(text: string): number {
    return Math.ceil(String(text || "").length / 4)
}

export function cleanExtractedText(input: string): string {
    const text = String(input || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    return text
        .split("\n")
        .filter((line) => {
            const l = line.trim()
            if (!l) return false
            if (/^arXiv:\d{4}\.\d{4,5}/i.test(l)) return false
            if (/^\[\d+\]\s*$/.test(l)) return false
            if (/^Page\s+\d+(\s+of\s+\d+)?$/i.test(l)) return false
            return true
        })
        .join("\n")
        .trim()
}

export function splitByApproxTokens(text: string, chunkTokens: number): string[] {
    const chunkChars = Math.max(2000, chunkTokens * 4)
    const overlapChars = Math.floor(chunkChars * 0.1)
    const normalized = String(text || "").trim()
    if (!normalized) return []
    const chunks: string[] = []
    let start = 0
    while (start < normalized.length) {
        const end = Math.min(start + chunkChars, normalized.length)
        chunks.push(normalized.slice(start, end))
        if (end >= normalized.length) break
        start = Math.max(0, end - overlapChars)
    }
    return chunks
}

export async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return []
    const results = new Array<R>(items.length)
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }).map(
        async () => {
            while (true) {
                const idx = cursor
                cursor += 1
                if (idx >= items.length) return
                results[idx] = await worker(items[idx], idx)
            }
        },
    )
    await Promise.all(runners)
    return results
}

export function getFileExtension(name: string): string {
    const n = String(name || "")
    const i = n.lastIndexOf(".")
    return i >= 0 ? n.slice(i).toLowerCase() : ""
}

export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
    const raw = String(dataUrl || "")
    const m = raw.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) throw new Error("Invalid data URL")
    return { mediaType: m[1], base64: m[2] }
}

export async function extractUploadedFileText(file: UploadedFilePayload): Promise<string> {
    const providedText =
        typeof file.extractedText === "string"
            ? cleanExtractedText(file.extractedText)
            : ""

    const { mediaType, base64 } = parseDataUrl(file.dataUrl)
    const buffer = Buffer.from(base64, "base64")
    const ext = getFileExtension(file.name)
    const mt = String(file.mediaType || mediaType || "").toLowerCase()

    if (mt.includes("pdf") || ext === ".pdf") {
        // If client already extracted enough text, trust it.
        if (providedText.length >= 200) return providedText

        const pdf = await getDocumentProxy(new Uint8Array(buffer))
        const { text } = await extractText(pdf, { mergePages: true })
        const parsed = cleanExtractedText(String(text || ""))
        return parsed.length >= providedText.length ? parsed : providedText
    }

    if (mt.includes("wordprocessingml.document") || ext === ".docx") {
        if (providedText) return providedText
        const result = await mammoth.extractRawText({ buffer })
        return cleanExtractedText(String(result.value || ""))
    }

    if (
        mt.startsWith("text/") ||
        [".txt", ".md", ".markdown", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml", ".py", ".js", ".ts"].includes(ext)
    ) {
        if (providedText) return providedText
        return cleanExtractedText(buffer.toString("utf8"))
    }

    return providedText || cleanExtractedText(buffer.toString("utf8"))
}

export function validateUploadedFiles(uploadedFiles: UploadedFilePayload[]): {
    valid: boolean
    error?: string
} {
    if (uploadedFiles.length > MAX_FILES) {
        return {
            valid: false,
            error: `Too many files. Maximum ${MAX_FILES} allowed.`,
        }
    }
    for (const f of uploadedFiles) {
        try {
            const { base64 } = parseDataUrl(f.dataUrl)
            const sizeInBytes = Math.ceil((base64.length * 3) / 4)
            if (sizeInBytes > MAX_FILE_SIZE) {
                return {
                    valid: false,
                    error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                }
            }
        } catch {
            return {
                valid: false,
                error: `Invalid uploaded file payload: ${f.name || "unknown"}`,
            }
        }
    }
    return { valid: true }
}

/**
 * The payload each attachment on a turn carries, from whichever shape it
 * arrived in.
 *
 * `/api/chat` accepts three, because the AI SDK sends whichever the client
 * used: a `parts` entry with `url`, one with `image`, and a `content` entry
 * with `image_url.url`. The limits below have to see all three -- one that
 * only sees `url` is not a limit, it is a limit on well-behaved clients.
 */
function attachmentUrls(message: unknown): string[] {
    const record = message as { parts?: unknown; content?: unknown } | null
    const entries = [
        ...(Array.isArray(record?.parts) ? record.parts : []),
        ...(Array.isArray(record?.content) ? record.content : []),
    ]

    return entries
        .map((entry) => {
            const part = entry as {
                type?: unknown
                url?: unknown
                image?: unknown
                image_url?: { url?: unknown }
            } | null
            if (!part || typeof part !== "object") return ""
            const type = String(part.type || "")
            if (type !== "file" && type !== "image" && type !== "image_url") return ""
            const url = part.url ?? part.image ?? part.image_url?.url
            return typeof url === "string" ? url : ""
        })
        .filter(Boolean)
}

/** Rejects a turn carrying more attachments, or larger ones, than allowed. */
export function validateFileParts(messages: unknown[]): {
    valid: boolean
    error?: string
} {
    const urls = attachmentUrls(messages[messages.length - 1])

    if (urls.length > MAX_FILES) {
        return {
            valid: false,
            error: `Too many files. Maximum ${MAX_FILES} allowed.`,
        }
    }

    for (const url of urls) {
        // Only an inline payload has a size we are carrying; a remote URL is
        // a reference, and weighing it here would measure the wrong thing.
        if (!url.startsWith("data:")) continue
        const base64 = url.split(",")[1]
        if (!base64) continue
        // Base64 costs about a third in size, so the decoded length is what counts.
        if (Math.ceil((base64.length * 3) / 4) > MAX_FILE_SIZE) {
            return {
                valid: false,
                error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
            }
        }
    }

    return { valid: true }
}

// Helper function to check if diagram is minimal/empty
