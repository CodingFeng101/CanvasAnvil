import { extractText, getDocumentProxy } from "unpdf"
import * as mammoth from "mammoth"
import JSZip from "jszip"
import { ungzip } from "pako"
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
export async function extractPdfText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text as string
}

/**
 * Check if a file is a PDF
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

/**
 * Extract text content from a text file
 */
export async function extractTextFileContent(file: File): Promise<string> {
    return await file.text()
}

/**
 * Extract text content from a .docx file.
 */
export async function extractWordText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return String(result.value || "")
}

const stripLatexToText = (raw: string) => {
    const s = String(raw || "")
        .replace(/\r/g, "")
        .replace(/(^|[^\\])%.*$/gm, "$1")
        .replace(/\\(begin|end)\{[^}]*\}/g, " ")
        .replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
        .replace(/\{|\}/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    return s
}

type ArchiveEntry = { name: string; bytes: Uint8Array }
type LatexGraphicRef = { includePath: string; sourceTexPath: string; caption: string; searchDirs: string[] }

const parseTarEntries = (tarBytes: Uint8Array): ArchiveEntry[] => {
    const out: ArchiveEntry[] = []
    const block = 512
    let offset = 0
    while (offset + block <= tarBytes.length) {
        const header = tarBytes.subarray(offset, offset + block)
        const isZero = header.every((b) => b === 0)
        if (isZero) break

        const nameRaw = new TextDecoder("utf-8").decode(header.subarray(0, 100))
        const prefixRaw = new TextDecoder("utf-8").decode(header.subarray(345, 500))
        const base = nameRaw.replace(/\0.*$/, "").trim()
        const prefix = prefixRaw.replace(/\0.*$/, "").trim()
        const name = `${prefix ? `${prefix}/` : ""}${base}`
        const sizeRaw = new TextDecoder("utf-8")
            .decode(header.subarray(124, 136))
            .replace(/\0.*$/, "")
            .trim()
        const size = parseInt(sizeRaw || "0", 8) || 0
        const typeflag = String.fromCharCode(header[156] || 48)

        const dataStart = offset + block
        const dataEnd = dataStart + size
        if (size > 0 && dataEnd <= tarBytes.length && typeflag !== "5") {
            out.push({ name, bytes: tarBytes.subarray(dataStart, dataEnd) })
        }
        const padded = Math.ceil(size / block) * block
        offset = dataStart + padded
    }
    return out
}

const pickMainTexEntry = (zip: JSZip) => {
    const texEntries = Object.values(zip.files).filter((f) => !f.dir && /\.tex$/i.test(String(f.name || "")))
    if (texEntries.length === 0) return null
    const preferredNames = ["main.tex", "paper.tex", "manuscript.tex", "document.tex"]
    for (const name of preferredNames) {
        const hit = texEntries.find((e) => String(e.name || "").toLowerCase().endsWith(name))
        if (hit) return hit
    }
    const score = (entryName: string) => {
        const n = String(entryName || "").toLowerCase()
        const depth = n.split("/").length
        const base = n.split("/").pop() || n
        let s = 0
        if (base.includes("main")) s += 6
        if (base.includes("paper")) s += 4
        if (base.includes("manuscript")) s += 3
        if (base.includes("camera")) s += 2
        if (n.includes("arxiv")) s += 1
        // Prefer shallower and shorter names.
        s += Math.max(0, 6 - depth)
        s += Math.max(0, 140 - n.length) / 50
        return s
    }
    return (
        texEntries
            .slice()
            .sort((a, b) => score(String(b.name || "")) - score(String(a.name || "")))[0] || texEntries[0]
    )
}

const pickMainTexFromEntries = (entries: ArchiveEntry[]) => {
    const texEntries = entries.filter((e) => /\.tex$/i.test(String(e.name || "")))
    if (texEntries.length === 0) return null
    const preferredNames = ["main.tex", "paper.tex", "manuscript.tex", "document.tex"]
    for (const name of preferredNames) {
        const hit = texEntries.find((e) => String(e.name || "").toLowerCase().endsWith(name))
        if (hit) return hit
    }
    const score = (entryName: string) => {
        const n = String(entryName || "").toLowerCase()
        const depth = n.split("/").length
        const base = n.split("/").pop() || n
        let s = 0
        if (base.includes("main")) s += 6
        if (base.includes("paper")) s += 4
        if (base.includes("manuscript")) s += 3
        if (base.includes("camera")) s += 2
        if (n.includes("arxiv")) s += 1
        s += Math.max(0, 6 - depth)
        s += Math.max(0, 140 - n.length) / 50
        return s
    }
    return texEntries.slice().sort((a, b) => score(String(b.name || "")) - score(String(a.name || "")))[0] || texEntries[0]
}

const normalizePathLike = (value: string) =>
    String(value || "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/{2,}/g, "/")
        .trim()

const extractGraphicPathDirs = (tex: string, sourceTexPath: string) => {
    const dirs: string[] = []
    const baseDir = dirnameOf(sourceTexPath)
    const gpRe = /\\graphicspath\s*\{([\s\S]*?)\}/g
    let gm: RegExpExecArray | null
    while ((gm = gpRe.exec(tex))) {
        const body = String(gm[1] || "")
        const dirRe = /\{([^}]+)\}/g
        let dm: RegExpExecArray | null
        while ((dm = dirRe.exec(body))) {
            const d = normalizePathLike(String(dm[1] || "").trim().replace(/^["']|["']$/g, ""))
            if (!d) continue
            dirs.push(joinPathLike(baseDir, d))
        }
    }
    return Array.from(new Set(dirs))
}

const dirnameOf = (path: string) => {
    const n = normalizePathLike(path)
    const idx = n.lastIndexOf("/")
    if (idx < 0) return ""
    return n.slice(0, idx)
}

const joinPathLike = (baseDir: string, rel: string) => {
    const parts = `${baseDir ? `${baseDir}/` : ""}${rel}`.split("/")
    const out: string[] = []
    for (const part of parts) {
        if (!part || part === ".") continue
        if (part === "..") {
            out.pop()
            continue
        }
        out.push(part)
    }
    return out.join("/")
}

const resolveTexPathInMap = (baseTexPath: string, target: string, texMap: Map<string, string>) => {
    const rel = normalizePathLike(target).replace(/^["']|["']$/g, "")
    if (!rel) return null
    const hasExt = /\.[a-z0-9]+$/i.test(rel)
    const candidates = hasExt ? [rel] : [rel, `${rel}.tex`]
    const baseDir = dirnameOf(baseTexPath)

    for (const c of candidates) {
        const joined = normalizePathLike(joinPathLike(baseDir, c))
        if (texMap.has(joined)) return joined
        const suffix = `/${joined}`
        const bySuffix = Array.from(texMap.keys()).find((k) => k.endsWith(suffix) || k === joined)
        if (bySuffix) return bySuffix
    }
    return null
}

const buildTexMapFromZip = async (zip: JSZip) => {
    const texEntries = Object.values(zip.files).filter((f) => !f.dir && /\.tex$/i.test(String(f.name || "")))
    const map = new Map<string, string>()
    for (const entry of texEntries) {
        const key = normalizePathLike(String(entry.name || ""))
        const value = await entry.async("string")
        map.set(key, value)
    }
    return map
}

const buildTexMapFromEntries = (entries: ArchiveEntry[]) => {
    const map = new Map<string, string>()
    for (const entry of entries) {
        if (!/\.tex$/i.test(String(entry.name || ""))) continue
        const key = normalizePathLike(String(entry.name || ""))
        const value = new TextDecoder("utf-8").decode(entry.bytes)
        map.set(key, value)
    }
    return map
}

const collectLatexGraphicsFromMap = (rootTexPath: string, texMap: Map<string, string>) => {
    const visited = new Set<string>()
    const graphics: LatexGraphicRef[] = []
    const textChunks: string[] = []

    const walk = (texPath: string, depth: number) => {
        if (depth > 20) return
        const key = normalizePathLike(texPath)
        if (!key || visited.has(key)) return
        const tex = texMap.get(key)
        if (typeof tex !== "string") return
        visited.add(key)
        textChunks.push(tex)

        const searchDirs = extractGraphicPathDirs(tex, key)
        const includeRe = /\\includegraphics\s*(?:\[[\s\S]*?\])?\s*\{([^}]+)\}/g
        let gm: RegExpExecArray | null
        while ((gm = includeRe.exec(tex))) {
            const includePath = String(gm[1] || "").trim()
            if (!includePath) continue
            graphics.push({
                includePath,
                sourceTexPath: key,
                caption: extractLatexCaptionNear(tex, gm.index),
                searchDirs,
            })
        }

        const subRe = /\\(?:input|include)\s*\{([^}]+)\}/g
        let sm: RegExpExecArray | null
        while ((sm = subRe.exec(tex))) {
            const target = String(sm[1] || "").trim()
            const resolved = resolveTexPathInMap(key, target, texMap)
            if (!resolved) continue
            walk(resolved, depth + 1)
        }
    }

    walk(rootTexPath, 0)
    return { graphics, mergedText: textChunks.join("\n\n") }
}

const resolveZipEntryForGraphic = (zip: JSZip, graphicPath: string) => {
    const raw = String(graphicPath || "").trim().replace(/^["']|["']$/g, "")
    if (!raw) return null
    const normalized = raw.replace(/\\/g, "/").replace(/^\.?\//, "")
    const lower = normalized.toLowerCase()
    const hasExt = /\.[a-z0-9]+$/i.test(lower)
    const tryExts = hasExt ? [""] : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]

    const candidates: string[] = []
    for (const ext of tryExts) candidates.push(lower + ext)

    const entries = Object.values(zip.files).filter((f) => !f.dir)
    for (const want of candidates) {
        const exact = entries.find((e) => String(e.name || "").toLowerCase() === want)
        if (exact) return exact
    }
    for (const want of candidates) {
        const hit = entries.find((e) => {
            const n = String(e.name || "").toLowerCase()
            return n.endsWith(`/${want}`) || n.endsWith(want)
        })
        if (hit) return hit
    }
    return null
}

const resolveZipEntryForGraphicFromTex = (zip: JSZip, sourceTexPath: string, graphicPath: string, searchDirs: string[] = []) => {
    const raw = String(graphicPath || "").trim().replace(/^["']|["']$/g, "")
    if (!raw) return null
    const rel = normalizePathLike(raw).replace(/^\.?\//, "")
    const baseDir = dirnameOf(sourceTexPath)
    const withBase = joinPathLike(baseDir, rel)
    const hasExt = /\.[a-z0-9]+$/i.test(rel)
    const tryExts = hasExt ? [""] : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".pdf"]
    const candidates = [withBase, rel, ...searchDirs.map((d) => joinPathLike(d, rel))]
        .flatMap((p) => tryExts.map((ext) => normalizePathLike(`${p}${ext}`)))
        .filter(Boolean)

    const entries = Object.values(zip.files).filter((f) => !f.dir)
    for (const want of candidates) {
        const exact = entries.find((e) => normalizePathLike(String(e.name || "")).toLowerCase() === want.toLowerCase())
        if (exact) return exact
        const suffix = `/${want.toLowerCase()}`
        const bySuffix = entries.find((e) => normalizePathLike(String(e.name || "")).toLowerCase().endsWith(suffix))
        if (bySuffix) return bySuffix
    }
    return null
}

const resolveArchiveEntryForGraphic = (entries: ArchiveEntry[], graphicPath: string) => {
    const raw = String(graphicPath || "").trim().replace(/^["']|["']$/g, "")
    if (!raw) return null
    const normalized = raw.replace(/\\/g, "/").replace(/^\.?\//, "")
    const lower = normalized.toLowerCase()
    const hasExt = /\.[a-z0-9]+$/i.test(lower)
    const tryExts = hasExt ? [""] : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]

    const candidates: string[] = []
    for (const ext of tryExts) candidates.push(lower + ext)

    for (const want of candidates) {
        const exact = entries.find((e) => String(e.name || "").toLowerCase() === want)
        if (exact) return exact
    }
    for (const want of candidates) {
        const hit = entries.find((e) => {
            const n = String(e.name || "").toLowerCase()
            return n.endsWith(`/${want}`) || n.endsWith(want)
        })
        if (hit) return hit
    }
    return null
}

const resolveArchiveEntryForGraphicFromTex = (entries: ArchiveEntry[], sourceTexPath: string, graphicPath: string, searchDirs: string[] = []) => {
    const raw = String(graphicPath || "").trim().replace(/^["']|["']$/g, "")
    if (!raw) return null
    const rel = normalizePathLike(raw).replace(/^\.?\//, "")
    const baseDir = dirnameOf(sourceTexPath)
    const withBase = joinPathLike(baseDir, rel)
    const hasExt = /\.[a-z0-9]+$/i.test(rel)
    const tryExts = hasExt ? [""] : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".pdf"]
    const candidates = [withBase, rel, ...searchDirs.map((d) => joinPathLike(d, rel))]
        .flatMap((p) => tryExts.map((ext) => normalizePathLike(`${p}${ext}`)))
        .filter(Boolean)

    for (const want of candidates) {
        const exact = entries.find((e) => normalizePathLike(String(e.name || "")).toLowerCase() === want.toLowerCase())
        if (exact) return exact
        const suffix = `/${want.toLowerCase()}`
        const bySuffix = entries.find((e) => normalizePathLike(String(e.name || "")).toLowerCase().endsWith(suffix))
        if (bySuffix) return bySuffix
    }
    return null
}

const extractLatexCaptionNear = (tex: string, matchIndex: number) => {
    const windowStart = Math.max(0, matchIndex - 1200)
    const windowEnd = Math.min(tex.length, matchIndex + 2400)
    const window = tex.slice(windowStart, windowEnd)
    const cap = window.match(/\\caption(?:\[[^\]]*\])?\{([\s\S]*?)\}/)
    if (cap && cap[1]) return stripLatexToText(cap[1]).slice(0, 220)
    return ""
}

export async function extractLatexZipText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)
    const main = pickMainTexEntry(zip)
    if (!main) throw new Error("No .tex file found in zip")
    const texMap = await buildTexMapFromZip(zip)
    const root = normalizePathLike(String(main.name || ""))
    const { mergedText } = collectLatexGraphicsFromMap(root, texMap)
    return stripLatexToText(mergedText || (await main.async("string")))
}

export async function extractLatexZipVisualAssets(
    file: File,
    options?: { maxAssets?: number }
): Promise<ExtractedVisualAsset[]> {
    const maxAssets = Math.max(1, options?.maxAssets ?? 12)
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)
    const main = pickMainTexEntry(zip)
    if (!main) return []
    const texMap = await buildTexMapFromZip(zip)
    const root = normalizePathLike(String(main.name || ""))
    let { graphics } = collectLatexGraphicsFromMap(root, texMap)
    if (graphics.length === 0) {
        for (const texPath of texMap.keys()) {
            const hit = collectLatexGraphicsFromMap(texPath, texMap).graphics
            if (hit.length > 0) {
                graphics = hit
                break
            }
        }
    }
    const assets: ExtractedVisualAsset[] = []
    let order = 0
    for (const g of graphics) {
        if (assets.length >= maxAssets) break
        const entry =
            resolveZipEntryForGraphicFromTex(zip, g.sourceTexPath, g.includePath, g.searchDirs) ||
            resolveZipEntryForGraphic(zip, g.includePath)
        if (!entry) continue
        const bytes = await entry.async("uint8array")
        const dataUrl = await latexAssetBytesToDataUrl(entry.name, bytes)
        if (!dataUrl.startsWith("data:image")) continue
        order += 1
        const caption = String(g.caption || "").trim()
        const hint = caption ? `LaTeX caption: ${caption}` : `LaTeX includegraphics: ${g.includePath}`
        assets.push({
            id: `latex-${file.name}-${order}`,
            sourceFileName: file.name,
            sourceType: "latex",
            order,
            dataUrl,
            textHint: hint.slice(0, 800),
        })
    }
    return assets
}

export async function extractLatexTarGzText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const tarBytes = ungzip(new Uint8Array(buffer))
    const entries = parseTarEntries(tarBytes)
    const main = pickMainTexFromEntries(entries)
    if (!main) throw new Error("No .tex file found in tar.gz")
    const texMap = buildTexMapFromEntries(entries)
    const root = normalizePathLike(String(main.name || ""))
    const { mergedText } = collectLatexGraphicsFromMap(root, texMap)
    return stripLatexToText(mergedText || new TextDecoder("utf-8").decode(main.bytes))
}

export async function extractLatexTarGzVisualAssets(
    file: File,
    options?: { maxAssets?: number }
): Promise<ExtractedVisualAsset[]> {
    const maxAssets = Math.max(1, options?.maxAssets ?? 12)
    const buffer = await file.arrayBuffer()
    const tarBytes = ungzip(new Uint8Array(buffer))
    const entries = parseTarEntries(tarBytes)
    const main = pickMainTexFromEntries(entries)
    if (!main) return []
    const texMap = buildTexMapFromEntries(entries)
    const root = normalizePathLike(String(main.name || ""))
    let { graphics } = collectLatexGraphicsFromMap(root, texMap)
    if (graphics.length === 0) {
        for (const texPath of texMap.keys()) {
            const hit = collectLatexGraphicsFromMap(texPath, texMap).graphics
            if (hit.length > 0) {
                graphics = hit
                break
            }
        }
    }
    const assets: ExtractedVisualAsset[] = []
    let order = 0
    for (const g of graphics) {
        if (assets.length >= maxAssets) break
        const entry =
            resolveArchiveEntryForGraphicFromTex(entries, g.sourceTexPath, g.includePath, g.searchDirs) ||
            resolveArchiveEntryForGraphic(entries, g.includePath)
        if (!entry) continue
        const dataUrl = await latexAssetBytesToDataUrl(entry.name, entry.bytes)
        if (!dataUrl.startsWith("data:image")) continue
        order += 1
        const caption = String(g.caption || "").trim()
        const hint = caption ? `LaTeX caption: ${caption}` : `LaTeX includegraphics: ${g.includePath}`
        assets.push({
            id: `latex-tgz-${file.name}-${order}`,
            sourceFileName: file.name,
            sourceType: "latex",
            order,
            dataUrl,
            textHint: hint.slice(0, 800),
        })
    }
    return assets
}

export interface ExtractedVisualAsset {
    id: string
    sourceFileName: string
    sourceType: "pdf" | "word" | "latex" | "third_party"
    page?: number
    order: number
    dataUrl: string
    textHint: string
}

type PdfTextBox = { text: string; x: number; y: number; w: number; h: number }
type RegionBox = { x: number; y: number; w: number; h: number }
type PdfTextLine = { text: string; x: number; y: number; w: number; h: number }
type VisualCategory =
    | "framework"
    | "result_table"
    | "mechanism"
    | "key_visual"
    | "data_structure"
    | "other"

const USEFUL_VISUAL_PATTERNS = [
    /(framework|pipeline|workflow|architecture|system diagram|method overview|flowchart|block diagram|methods?|approach|methodology|方法框架|流程图|系统结构|模型架构)/i,
    /(table\s*\d+|main results|comparison|baseline|sota|significance|accuracy|f1|auc|results table|主实验|结果对比|对比表|显著性|表\s*\d+)/i,
    /(ablation|sensitivity|parameter analysis|influence|impact|mechanism|变量分析|消融|参数敏感性|影响因素|机制分析)/i,
    /(qualitative|visualization|case study|example|heatmap|confusion matrix|roc|pr curve|结果可视化|案例图|关键结果图|可视化)/i,
    /(dataset|data distribution|sample structure|demographics|statistics|数据分布|样本构成|数据结构|样本结构)/i,
]

const EXCLUDED_VISUAL_HINT_RE =
    /(equation|theorem|proof|appendix|related work|literature review|survey|公式|定理|证明|附录|相关工作|文献综述|参数设置)/i

const CAPTION_ANCHOR_RE = /(\bfig(?:ure)?\.?\s*\d+\b|\btable\s*\d+\b|图\s*\d+|表\s*\d+)/i
const CAPTION_LINE_START_RE = /^\s*(fig(?:ure)?\.?|table|图|表)\s*\d+/i

const CATEGORY_PATTERNS: Array<{ category: VisualCategory; re: RegExp[] }> = [
    {
        category: "framework",
        re: [
            /(framework|pipeline|workflow|architecture|flowchart|block diagram|method overview|模型架构|方法框架|流程图|系统结构)/i,
        ],
    },
    {
        category: "result_table",
        re: [
            /(table\s*\d+|main results|comparison|baseline|sota|significance|results table|结果对比|对比表|显著性|主实验|表\s*\d+)/i,
        ],
    },
    {
        category: "mechanism",
        re: [
            /(ablation|sensitivity|parameter analysis|influence|impact|mechanism|消融|参数敏感性|影响因素|机制分析)/i,
        ],
    },
    {
        category: "key_visual",
        re: [
            /(qualitative|visualization|case study|example|heatmap|confusion matrix|roc|pr curve|可视化|案例图|关键结果图)/i,
        ],
    },
    {
        category: "data_structure",
        re: [
            /(dataset|data distribution|sample structure|demographics|statistics|数据分布|样本构成|数据结构|样本结构)/i,
        ],
    },
]
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = ""
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
}

const getMimeByExt = (name: string) => {
    const n = String(name || "").toLowerCase()
    if (n.endsWith(".png")) return "image/png"
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
    if (n.endsWith(".webp")) return "image/webp"
    if (n.endsWith(".gif")) return "image/gif"
    if (n.endsWith(".bmp")) return "image/bmp"
    if (n.endsWith(".svg")) return "image/svg+xml"
    return "image/png"
}

const latexAssetBytesToDataUrl = async (name: string, bytes: Uint8Array) => {
    const n = String(name || "").toLowerCase()
    if (n.endsWith(".pdf")) {
        try {
            const pdf = await getDocumentProxy(bytes)
            const page = await (pdf as any).getPage(1)
            const viewport1 = page.getViewport({ scale: 1 })
            const scale = 1400 / Math.max(1, viewport1.width)
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement("canvas")
            canvas.width = Math.max(1, Math.floor(viewport.width))
            canvas.height = Math.max(1, Math.floor(viewport.height))
            const ctx = canvas.getContext("2d")
            if (!ctx) return ""
            await page.render({ canvasContext: ctx, viewport }).promise
            return canvas.toDataURL("image/png")
        } catch {
            return ""
        }
    }
    const mime = getMimeByExt(name)
    return `data:${mime};base64,${bytesToBase64(bytes)}`
}

const decodeXmlText = (raw: string) => {
    const s = String(raw || "")
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => {
            const code = Number(n)
            if (!Number.isFinite(code)) return ""
            try {
                return String.fromCharCode(code)
            } catch {
                return ""
            }
        })
}

const renderPdfPageCanvas = async (page: any, targetWidth = 980) => {
    const viewportAtScale1 = page.getViewport({ scale: 1 })
    const scale = targetWidth / Math.max(1, viewportAtScale1.width)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    await page.render({ canvasContext: ctx, viewport }).promise

    let pageText = ""
    const textBoxes: PdfTextBox[] = []
    try {
        const text = await page.getTextContent()
        const items = Array.isArray(text?.items) ? text.items : []
        for (const it of items) {
            const str = String((it as any)?.str || "").trim()
            if (!str) continue
            pageText += `${str} `

            const transform = Array.isArray((it as any)?.transform) ? (it as any).transform : [1, 0, 0, 1, 0, 0]
            const tx = Number(transform[4] || 0)
            const ty = Number(transform[5] || 0)
            const vw = Math.abs(Number((it as any)?.width || 0) * scale)
            const vh = Math.max(8, Math.abs(Number((it as any)?.height || 0) * scale))
            const [vx, vy] = viewport.convertToViewportPoint(tx, ty)
            const x = clamp(Math.floor(vx), 0, canvas.width - 1)
            const y = clamp(Math.floor(vy - vh), 0, canvas.height - 1)
            const w = clamp(Math.ceil(vw || str.length * 6), 6, canvas.width - x)
            const h = clamp(Math.ceil(vh), 8, canvas.height - y)
            textBoxes.push({ text: str, x, y, w, h })
        }
    } catch {
    }

    return { canvas, textBoxes, pageText: pageText.trim() }
}

const buildTextMask = (width: number, height: number, textBoxes: PdfTextBox[]) => {
    const mask = new Uint8Array(width * height)
    for (const box of textBoxes) {
        const x0 = clamp(box.x - 2, 0, width - 1)
        const y0 = clamp(box.y - 2, 0, height - 1)
        const x1 = clamp(box.x + box.w + 2, 0, width - 1)
        const y1 = clamp(box.y + box.h + 2, 0, height - 1)
        for (let y = y0; y <= y1; y += 1) {
            const row = y * width
            for (let x = x0; x <= x1; x += 1) mask[row + x] = 1
        }
    }
    return mask
}

const detectVisualRegions = (canvas: HTMLCanvasElement, textMask: Uint8Array): RegionBox[] => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return []
    const width = canvas.width
    const height = canvas.height
    const imageData = ctx.getImageData(0, 0, width, height).data

    const step = 2
    const sw = Math.max(1, Math.floor(width / step))
    const sh = Math.max(1, Math.floor(height / step))
    const small = new Uint8Array(sw * sh)

    for (let sy = 0; sy < sh; sy += 1) {
        for (let sx = 0; sx < sw; sx += 1) {
            const x = sx * step
            const y = sy * step
            const idx = (y * width + x) * 4
            const r = imageData[idx]
            const g = imageData[idx + 1]
            const b = imageData[idx + 2]
            const a = imageData[idx + 3]
            if (a < 10) continue
            const bright = (r + g + b) / 3
            if (bright > 245) continue
            const pixelIdx = y * width + x
            if (textMask[pixelIdx]) continue
            small[sy * sw + sx] = 1
        }
    }

    const visited = new Uint8Array(sw * sh)
    const boxes: RegionBox[] = []
    const queueX = new Int32Array(sw * sh)
    const queueY = new Int32Array(sw * sh)
    const minArea = Math.max(140, Math.floor(sw * sh * 0.0012))

    for (let y = 0; y < sh; y += 1) {
        for (let x = 0; x < sw; x += 1) {
            const start = y * sw + x
            if (!small[start] || visited[start]) continue

            let qh = 0
            let qt = 0
            visited[start] = 1
            queueX[qt] = x
            queueY[qt] = y
            qt += 1

            let minX = x
            let minY = y
            let maxX = x
            let maxY = y
            let area = 0

            while (qh < qt) {
                const cx = queueX[qh]
                const cy = queueY[qh]
                qh += 1
                area += 1
                minX = Math.min(minX, cx)
                minY = Math.min(minY, cy)
                maxX = Math.max(maxX, cx)
                maxY = Math.max(maxY, cy)

                for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
                    for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
                        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue
                        const ni = ny * sw + nx
                        if (!small[ni] || visited[ni]) continue
                        visited[ni] = 1
                        queueX[qt] = nx
                        queueY[qt] = ny
                        qt += 1
                    }
                }
            }

            if (area < minArea) continue
            const bw = (maxX - minX + 1) * step
            const bh = (maxY - minY + 1) * step
            const ratio = (bw * bh) / Math.max(1, width * height)
            if (ratio > 0.75) continue
            if (bw < 80 || bh < 60) continue
            boxes.push({
                x: clamp(minX * step - 8, 0, width - 1),
                y: clamp(minY * step - 8, 0, height - 1),
                w: clamp(bw + 16, 1, width),
                h: clamp(bh + 16, 1, height),
            })
        }
    }

    if (boxes.length <= 1) return boxes

    const merged: RegionBox[] = []
    for (const box of boxes.sort((a, b) => a.y - b.y || a.x - b.x)) {
        let hit = false
        for (const m of merged) {
            const overlapX = Math.max(0, Math.min(box.x + box.w, m.x + m.w) - Math.max(box.x, m.x))
            const overlapY = Math.max(0, Math.min(box.y + box.h, m.y + m.h) - Math.max(box.y, m.y))
            const overlap = overlapX * overlapY
            const minArea2 = Math.min(box.w * box.h, m.w * m.h)
            const near =
                Math.abs(box.x + box.w / 2 - (m.x + m.w / 2)) < 80 &&
                Math.abs(box.y + box.h / 2 - (m.y + m.h / 2)) < 80
            if (overlap > minArea2 * 0.2 || near) {
                const nx = Math.min(m.x, box.x)
                const ny = Math.min(m.y, box.y)
                const nw = Math.max(m.x + m.w, box.x + box.w) - nx
                const nh = Math.max(m.y + m.h, box.y + box.h) - ny
                m.x = nx
                m.y = ny
                m.w = nw
                m.h = nh
                hit = true
                break
            }
        }
        if (!hit) merged.push({ ...box })
    }

    return merged
}

const cropRegionToDataUrl = (canvas: HTMLCanvasElement, box: RegionBox) => {
    const c = document.createElement("canvas")
    c.width = clamp(Math.floor(box.w), 1, canvas.width)
    c.height = clamp(Math.floor(box.h), 1, canvas.height)
    const ctx = c.getContext("2d")
    if (!ctx) return ""
    ctx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height)
    // Use PNG for sharper tables/diagrams; we keep maxAssets small to control payload size.
    return c.toDataURL("image/png")
}

const buildRegionTextHint = (box: RegionBox, textBoxes: PdfTextBox[]) => {
    const centerY = box.y + box.h / 2
    const candidates = textBoxes
        .filter((t) => {
            const horizontalOverlap = Math.max(0, Math.min(box.x + box.w, t.x + t.w) - Math.max(box.x, t.x))
            const overlapRatio = horizontalOverlap / Math.max(1, Math.min(box.w, t.w))
            const verticalDistance = Math.abs(t.y + t.h / 2 - centerY)
            return overlapRatio > 0.2 && verticalDistance < 240
        })
        .sort((a, b) => Math.abs(a.y + a.h / 2 - centerY) - Math.abs(b.y + b.h / 2 - centerY))
        .slice(0, 10)
    return candidates.map((x) => x.text).join(" ").trim().slice(0, 600)
}

const expandRegion = (box: RegionBox, width: number, height: number, padX: number, padY: number): RegionBox => {
    const x = clamp(Math.floor(box.x - padX), 0, width - 1)
    const y = clamp(Math.floor(box.y - padY), 0, height - 1)
    const right = clamp(Math.ceil(box.x + box.w + padX), x + 1, width)
    const bottom = clamp(Math.ceil(box.y + box.h + padY), y + 1, height)
    return { x, y, w: right - x, h: bottom - y }
}

const tightenRegionByPixels = (canvas: HTMLCanvasElement, box: RegionBox): RegionBox => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return box
    const sx = clamp(Math.floor(box.x), 0, canvas.width - 1)
    const sy = clamp(Math.floor(box.y), 0, canvas.height - 1)
    const sw = clamp(Math.floor(box.w), 1, canvas.width - sx)
    const sh = clamp(Math.floor(box.h), 1, canvas.height - sy)
    const data = ctx.getImageData(sx, sy, sw, sh).data

    let minX = sw
    let minY = sh
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < sh; y += 1) {
        for (let x = 0; x < sw; x += 1) {
            const idx = (y * sw + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const b = data[idx + 2]
            const a = data[idx + 3]
            if (a < 20) continue
            const bright = (r + g + b) / 3
            if (bright > 244) continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
        }
    }

    if (maxX < 0 || maxY < 0) return box
    const pad = 16
    const nx = clamp(sx + minX - pad, 0, canvas.width - 1)
    const ny = clamp(sy + minY - pad, 0, canvas.height - 1)
    const nr = clamp(sx + maxX + pad + 1, nx + 1, canvas.width)
    const nb = clamp(sy + maxY + pad + 1, ny + 1, canvas.height)
    return { x: nx, y: ny, w: nr - nx, h: nb - ny }
}

const buildTextLines = (textBoxes: PdfTextBox[]): PdfTextLine[] => {
    const sorted = [...textBoxes].sort((a, b) => a.y - b.y || a.x - b.x)
    const lines: Array<{ boxes: PdfTextBox[]; yCenter: number }> = []

    for (const box of sorted) {
        const center = box.y + box.h / 2
        let target = lines.find((line) => Math.abs(line.yCenter - center) <= 10)
        if (!target) {
            target = { boxes: [], yCenter: center }
            lines.push(target)
        }
        target.boxes.push(box)
        target.yCenter = (target.yCenter * (target.boxes.length - 1) + center) / target.boxes.length
    }

    return lines
        .map((line) => {
            const boxes = line.boxes.sort((a, b) => a.x - b.x)
            const x = Math.min(...boxes.map((b) => b.x))
            const y = Math.min(...boxes.map((b) => b.y))
            const right = Math.max(...boxes.map((b) => b.x + b.w))
            const bottom = Math.max(...boxes.map((b) => b.y + b.h))
            const text = boxes.map((b) => b.text).join(" ").replace(/\s+/g, " ").trim()
            return { text, x, y, w: right - x, h: bottom - y }
        })
        .filter((line) => line.text.length > 0)
}

const collectCaptionAnchorRegions = (
    canvas: HTMLCanvasElement,
    textBoxes: PdfTextBox[]
): Array<{ box: RegionBox; hint: string }> => {
    const width = canvas.width
    const height = canvas.height
    const lines = buildTextLines(textBoxes)
    const anchors = lines.filter((line) => {
        if (EXCLUDED_VISUAL_HINT_RE.test(line.text)) return false
        return CAPTION_ANCHOR_RE.test(line.text) || USEFUL_VISUAL_PATTERNS.some((re) => re.test(line.text))
    })

    const results: Array<{ box: RegionBox; hint: string }> = []
    for (const line of anchors) {
        const isTable = /(table|表)/i.test(line.text)
        const isFigure = /(fig|figure|图)/i.test(line.text)
        const yCenter = line.y + line.h / 2

        let top = yCenter - height * 0.35
        let bottom = yCenter + height * 0.35
        if (isTable) {
            top = yCenter - height * 0.08
            bottom = yCenter + height * 0.48
        } else if (isFigure) {
            top = yCenter - height * 0.58
            bottom = yCenter + height * 0.12
        }

        const base: RegionBox = {
            x: Math.floor(width * 0.05),
            y: clamp(Math.floor(top), 0, height - 1),
            w: Math.floor(width * 0.9),
            h: clamp(Math.floor(bottom - top), 1, height),
        }
        const expanded = expandRegion(base, width, height, 18, 20)
        const tightened = tightenRegionByPixels(canvas, expanded)
        const areaRatio = (tightened.w * tightened.h) / Math.max(1, width * height)
        if (areaRatio < 0.05 || areaRatio > 0.9) continue
        results.push({ box: tightened, hint: line.text })
    }

    return results
}

const unionBoxes = (a: RegionBox, b: RegionBox): RegionBox => {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const right = Math.max(a.x + a.w, b.x + b.w)
    const bottom = Math.max(a.y + a.h, b.y + b.h)
    return { x, y, w: right - x, h: bottom - y }
}

const detectCaptionKind = (text: string): "figure" | "table" => {
    const t = String(text || "").toLowerCase()
    if (t.startsWith("table") || t.includes(" table ") || /表\s*\d+/.test(text)) return "table"
    return "figure"
}

const collectCaptionBasedCrops = (args: {
    canvas: HTMLCanvasElement
    textBoxes: PdfTextBox[]
    detectedRegions: RegionBox[]
}): Array<{ box: RegionBox; hint: string; kind: "figure" | "table" }> => {
    const { canvas, textBoxes, detectedRegions } = args
    const width = canvas.width
    const height = canvas.height
    const lines = buildTextLines(textBoxes)

    const candidates = lines
        .filter((line) => {
            const text = String(line.text || "")
            if (!CAPTION_LINE_START_RE.test(text)) return false
            // Avoid catching in-paragraph references like "see Figure 1"
            const trimmed = text.trim()
            const looksLikeCaption = /^(\s*(fig(?:ure)?\.?|table|图|表)\s*\d+)\s*[:.]/i.test(trimmed)
            return looksLikeCaption || trimmed.length <= 80
        })
        .slice(0, 40)

    const out: Array<{ box: RegionBox; hint: string; kind: "figure" | "table" }> = []

    for (const line of candidates) {
        const kind = detectCaptionKind(line.text)
        const captionBox: RegionBox = expandRegion(
            { x: line.x, y: line.y, w: line.w, h: line.h },
            width,
            height,
            14,
            10
        )

        const captionTop = captionBox.y
        const captionBottom = captionBox.y + captionBox.h

        const window: RegionBox = (() => {
            if (kind === "table") {
                // Table captions are often above the table; capture below by default.
                const top = clamp(Math.floor(captionTop - height * 0.06), 0, height - 1)
                const bottom = clamp(Math.floor(captionBottom + height * 0.62), top + 1, height)
                return { x: Math.floor(width * 0.04), y: top, w: Math.floor(width * 0.92), h: bottom - top }
            }
            // Figure captions are often below the figure; capture above by default.
            const top = clamp(Math.floor(captionTop - height * 0.68), 0, height - 1)
            const bottom = clamp(Math.floor(captionBottom + height * 0.10), top + 1, height)
            return { x: Math.floor(width * 0.04), y: top, w: Math.floor(width * 0.92), h: bottom - top }
        })()

        const windowBottom = window.y + window.h
        const windowTop = window.y

        const inWindow = detectedRegions
            .map((r) => ({ r, cy: r.y + r.h / 2, cx: r.x + r.w / 2 }))
            .filter(({ r, cy }) => {
                const within = cy >= windowTop && cy <= windowBottom
                if (!within) return false
                if (kind === "figure") return r.y + r.h <= captionTop + 36
                return r.y >= captionBottom - 36
            })

        const pick = (() => {
            if (inWindow.length === 0) return null
            const scored = inWindow
                .map(({ r }) => {
                    const area = r.w * r.h
                    const dist = kind === "figure"
                        ? Math.abs((r.y + r.h) - captionTop)
                        : Math.abs(r.y - captionBottom)
                    // Prefer big + close regions.
                    const score = area - dist * 120
                    return { r, score }
                })
                .sort((a, b) => b.score - a.score)
            return scored[0]?.r || null
        })()

        let cropBox: RegionBox
        if (pick) {
            cropBox = unionBoxes(pick, captionBox)
            // Include any nearby regions that likely belong to the same figure/table.
            for (const { r } of inWindow) {
                const overlapX = Math.max(0, Math.min(cropBox.x + cropBox.w, r.x + r.w) - Math.max(cropBox.x, r.x))
                const overlapY = Math.max(0, Math.min(cropBox.y + cropBox.h, r.y + r.h) - Math.max(cropBox.y, r.y))
                const overlap = overlapX * overlapY
                const minArea = Math.min(cropBox.w * cropBox.h, r.w * r.h)
                const near = Math.abs((r.y + r.h / 2) - (cropBox.y + cropBox.h / 2)) < 120
                if (overlap > minArea * 0.08 || near) cropBox = unionBoxes(cropBox, r)
            }
            cropBox = expandRegion(cropBox, width, height, 24, 22)
            cropBox = tightenRegionByPixels(canvas, cropBox)
        } else {
            // No clear visual region detected; fall back to a reasonable window around the caption.
            cropBox = tightenRegionByPixels(canvas, expandRegion(window, width, height, 8, 10))
        }

        const ratio = (cropBox.w * cropBox.h) / Math.max(1, width * height)
        if (ratio < 0.04) {
            // Too small => half page fallback.
            const half: RegionBox =
                kind === "table"
                    ? { x: 0, y: Math.floor(height * 0.45), w: width, h: height - Math.floor(height * 0.45) }
                    : { x: 0, y: 0, w: width, h: Math.floor(height * 0.60) }
            cropBox = tightenRegionByPixels(canvas, expandRegion(half, width, height, 0, 0))
        }
        const ratio2 = (cropBox.w * cropBox.h) / Math.max(1, width * height)
        if (ratio2 < 0.06) {
            // Still abnormal => full page fallback.
            cropBox = { x: 0, y: 0, w: width, h: height }
        }

        out.push({ box: cropBox, hint: String(line.text || "").slice(0, 200), kind })
    }

    return out
}

const detectVisualCategory = (hintText: string): VisualCategory => {
    const text = String(hintText || "")
    for (const item of CATEGORY_PATTERNS) {
        if (item.re.some((re) => re.test(text))) return item.category
    }
    return "other"
}

const scoreUsefulVisualHint = (text: string) => {
    const hint = String(text || "")
    let score = 0
    let matched = 0
    for (const re of USEFUL_VISUAL_PATTERNS) {
        if (!re.test(hint)) continue
        matched += 1
        score += 2
    }
    if (/(figure|fig\.?\s*\d+|图\s*\d+)/i.test(hint)) score += 1
    if (/(table\s*\d+|表\s*\d+)/i.test(hint)) score += 1
    if (EXCLUDED_VISUAL_HINT_RE.test(hint)) score -= 3
    return { score, matched }
}

export async function extractPdfVisualAssets(
    file: File,
    options?: { maxPages?: number; maxAssets?: number; targetWidth?: number }
): Promise<ExtractedVisualAsset[]> {
    const maxPages = Math.max(1, options?.maxPages ?? 12)
    const maxAssets = Math.max(1, options?.maxAssets ?? 10)
    // Higher default resolution to preserve figure/table readability.
    const targetWidth = Math.max(980, options?.targetWidth ?? 1400)

    const buffer = await file.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const pageCount = Number((pdf as any)?.numPages || 0)
    if (!pageCount) return []

    type CandidateAsset = {
        page: number
        score: number
        textHint: string
        dataUrl: string
        areaRatio: number
        category: VisualCategory
    }

    const accepted: CandidateAsset[] = []
    const fallback: CandidateAsset[] = []

    for (let pageNo = 1; pageNo <= Math.min(pageCount, maxPages); pageNo += 1) {
        try {
            const page = await (pdf as any).getPage(pageNo)
            const rendered = await renderPdfPageCanvas(page, targetWidth)
            if (!rendered) continue

            const pageText = String(rendered.pageText || "").slice(0, 1400)
            const textMask = buildTextMask(rendered.canvas.width, rendered.canvas.height, rendered.textBoxes)
            const detectedRegions = detectVisualRegions(rendered.canvas, textMask)
            const captionCrops = collectCaptionBasedCrops({
                canvas: rendered.canvas,
                textBoxes: rendered.textBoxes,
                detectedRegions,
            })
            const anchorRegions = collectCaptionAnchorRegions(rendered.canvas, rendered.textBoxes)
            const candidateRegions = [
                ...captionCrops.map((item) => ({ box: item.box, seedHint: item.hint, source: "caption" as const })),
                ...anchorRegions.map((item) => ({ box: item.box, seedHint: item.hint, source: "anchor" as const })),
                ...detectedRegions.map((box) => ({ box, seedHint: "", source: "detected" as const })),
            ]

            for (const candidate of candidateRegions) {
                if (accepted.length >= maxAssets * 8) break
                const expanded =
                    candidate.source === "caption"
                        ? expandRegion(candidate.box, rendered.canvas.width, rendered.canvas.height, 6, 8)
                        : expandRegion(candidate.box, rendered.canvas.width, rendered.canvas.height, 28, 28)
                const region = tightenRegionByPixels(rendered.canvas, expanded)

                const dataUrl = cropRegionToDataUrl(rendered.canvas, region)
                if (!dataUrl.startsWith("data:image")) continue

                const areaRatio = (region.w * region.h) / Math.max(1, rendered.canvas.width * rendered.canvas.height)
                const localHint = buildRegionTextHint(region, rendered.textBoxes)
                const textHint = `${candidate.seedHint} ${localHint} ${pageText}`.trim().slice(0, 1200)
                const scored = scoreUsefulVisualHint(`${textHint} ${pageText}`)
                const category = detectVisualCategory(textHint)
                const fullRegionBonus = areaRatio > 0.08 && areaRatio < 0.88 ? 1 : 0
                const anchorBonus = candidate.source === "caption" ? 4 : candidate.source === "anchor" ? 2 : 0
                const categoryBonus = category !== "other" ? 1 : 0
                const finalScore = scored.score + fullRegionBonus + anchorBonus + categoryBonus
                const item: CandidateAsset = { page: pageNo, score: finalScore, textHint, dataUrl, areaRatio, category }

                if ((scored.matched > 0 || candidate.source === "caption") && finalScore > 0) {
                    accepted.push(item)
                } else if (areaRatio > 0.08 && areaRatio < 0.9) {
                    fallback.push(item)
                }
            }
        } catch (e) {
            console.error("Failed to extract visual asset from PDF page", pageNo, e)
        }
    }

    const dedupeByData = (items: CandidateAsset[]) => {
        const seen = new Set<string>()
        const out: CandidateAsset[] = []
        for (const item of items.sort((a, b) => b.score - a.score || a.page - b.page)) {
            const key = `${item.page}|${item.dataUrl.slice(0, 120)}`
            if (seen.has(key)) continue
            seen.add(key)
            out.push(item)
        }
        return out
    }

    const pickByPriority = (items: CandidateAsset[]) => {
        const priority: VisualCategory[] = [
            "framework",
            "result_table",
            "mechanism",
            "key_visual",
            "data_structure",
        ]
        const sorted = dedupeByData(items)
        const picked: CandidateAsset[] = []
        const used = new Set<string>()

        for (const category of priority) {
            const hit = sorted.find((item) => item.category === category && !used.has(item.dataUrl))
            if (!hit) continue
            picked.push(hit)
            used.add(hit.dataUrl)
            if (picked.length >= maxAssets) return picked
        }

        for (const item of sorted) {
            if (used.has(item.dataUrl)) continue
            picked.push(item)
            used.add(item.dataUrl)
            if (picked.length >= maxAssets) break
        }

        return picked
    }

    const selected = pickByPriority(accepted.length > 0 ? accepted : fallback).sort((a, b) => a.page - b.page)

    return selected.map((x, idx) => ({
        id: `pdf-${file.name}-${x.page}-${idx + 1}`,
        sourceFileName: file.name,
        sourceType: "pdf",
        page: x.page,
        order: idx + 1,
        dataUrl: x.dataUrl,
        textHint: x.textHint,
    }))
}

export async function extractWordVisualAssets(
    file: File,
    options?: { maxAssets?: number }
): Promise<ExtractedVisualAsset[]> {
    const maxAssets = Math.max(1, options?.maxAssets ?? 10)
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)
    const mediaEntries = Object.values(zip.files).filter(
        (f) => !f.dir && /^word\/media\//i.test(String(f.name || ""))
    )
    const assets: ExtractedVisualAsset[] = []

    const relsXml = zip.file("word/_rels/document.xml.rels")
        ? await zip.file("word/_rels/document.xml.rels")!.async("string")
        : ""
    const docXml = zip.file("word/document.xml")
        ? await zip.file("word/document.xml")!.async("string")
        : ""

    const ridToTarget = new Map<string, string>()
    if (relsXml) {
        const relRe = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g
        let rm: RegExpExecArray | null
        while ((rm = relRe.exec(relsXml))) {
            const id = String(rm[1] || "").trim()
            const target = String(rm[2] || "").trim()
            if (!id || !target) continue
            ridToTarget.set(id, target.replace(/\\/g, "/"))
        }
    }

    const paragraphs: Array<{ text: string; embeds: string[]; metrics: Record<string, { w: number; h: number; area: number }> }> = []
    if (docXml) {
        const pRe = /<w:p\b[\s\S]*?<\/w:p>/g
        const embedsRe = /\br:embed="(rId\d+)"/g
        const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
        const extentRe = /<(?:wp:extent|a:ext)\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/g
        const emuToPx = (v: number) => Math.max(0, Math.round(v / 9525))
        let pm: RegExpExecArray | null
        while ((pm = pRe.exec(docXml))) {
            const p = pm[0]
            const embeds: string[] = []
            let em: RegExpExecArray | null
            while ((em = embedsRe.exec(p))) embeds.push(String(em[1] || ""))
            const parts: string[] = []
            let tm: RegExpExecArray | null
            while ((tm = tRe.exec(p))) parts.push(decodeXmlText(tm[1] || ""))
            const text = parts.join("").replace(/\s+/g, " ").trim()
            const metricList: Array<{ w: number; h: number; area: number }> = []
            let xm: RegExpExecArray | null
            while ((xm = extentRe.exec(p))) {
                const cx = Number(xm[1] || 0)
                const cy = Number(xm[2] || 0)
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue
                const w = emuToPx(cx)
                const h = emuToPx(cy)
                metricList.push({ w, h, area: w * h })
            }
            const metrics: Record<string, { w: number; h: number; area: number }> = {}
            for (let i = 0; i < embeds.length; i += 1) {
                metrics[embeds[i]] = metricList[i] || { w: 0, h: 0, area: 0 }
            }
            paragraphs.push({ text, embeds, metrics })
        }
    }

    const captionRe = /^(fig(?:ure)?\.?|table|图|表)\s*\d+\s*[:.]/i
    const mediaHintByName = new Map<string, string>()
    const mediaMetricByName = new Map<string, { w: number; h: number; area: number }>()
    for (let i = 0; i < paragraphs.length; i += 1) {
        const p = paragraphs[i]
        if (!p.embeds || p.embeds.length === 0) continue
        for (const rid of p.embeds) {
            const target = ridToTarget.get(rid) || ""
            const media = target ? `word/${target.replace(/^\.?\//, "")}` : ""
            if (!media) continue
            const prev = paragraphs[i - 1]?.text || ""
            const next = paragraphs[i + 1]?.text || ""
            const here = p.text || ""
            const cap = [prev, next, here].find((t) => captionRe.test(String(t || "").trim()))
            const hint = [cap || "", prev, here, next].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 800)
            if (hint) mediaHintByName.set(media.toLowerCase(), hint)
            const m = p.metrics?.[rid]
            if (m && m.area > 0) mediaMetricByName.set(media.toLowerCase(), m)
        }
    }

    type Candidate = { entry: any; hint: string; metric: { w: number; h: number; area: number }; score: number; category: VisualCategory }
    const excludedHintRe =
        /(equation|formula|eq\.?\s*\(?\d+\)?|proof|appendix|related work|supplement|公式|推导|证明|附录|文献综述|参数设置)/i
    const candidates: Candidate[] = []

    for (const entry of mediaEntries) {
        const key = String(entry.name || "").toLowerCase()
        const hint = mediaHintByName.get(key) || ""
        const metric = mediaMetricByName.get(key) || { w: 0, h: 0, area: 0 }
        const scored = scoreUsefulVisualHint(hint)
        const isCaptionLike = captionRe.test(String(hint || "").trim())
        const isExcluded = excludedHintRe.test(hint) || EXCLUDED_VISUAL_HINT_RE.test(hint)
        const sizeBonus = metric.area >= 180000 ? 2 : metric.area >= 70000 ? 1 : 0
        const tinyPenalty = metric.area > 0 && metric.area < 14000 ? 4 : 0
        const score = scored.score + (isCaptionLike ? 2 : 0) + sizeBonus - tinyPenalty - (isExcluded ? 6 : 0)
        const category = detectVisualCategory(hint)
        candidates.push({ entry, hint, metric, score, category })
    }

    const priority: VisualCategory[] = [
        "framework",
        "result_table",
        "mechanism",
        "key_visual",
        "data_structure",
        "other",
    ]

    const keep = candidates
        .filter((c) => c.score > 0 || c.metric.area >= 260000)
        .sort((a, b) => {
            const pa = priority.indexOf(a.category)
            const pb = priority.indexOf(b.category)
            if (pa !== pb) return pa - pb
            if (b.score !== a.score) return b.score - a.score
            return (b.metric.area || 0) - (a.metric.area || 0)
        })
        .slice(0, maxAssets)

    for (let i = 0; i < keep.length; i += 1) {
        const { entry, hint } = keep[i]
        try {
            const bytes = await entry.async("uint8array")
            const mime = getMimeByExt(entry.name)
            const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`
            assets.push({
                id: `word-${file.name}-${i + 1}`,
                sourceFileName: file.name,
                sourceType: "word",
                order: i + 1,
                dataUrl,
                textHint: hint,
            })
        } catch (e) {
            console.error("Failed to extract visual asset from Word", entry.name, e)
        }
    }

    return assets
}

export async function extractThirdPartyVisualAssets(
    file: File,
    options: { apiToken: string; apiBase?: string; maxAssets?: number; maxWaitMs?: number }
): Promise<ExtractedVisualAsset[]> {
    const token = String(options.apiToken || "").trim()
    if (!token) throw new Error("Third-party parser token is empty")
    const apiBase = String(options.apiBase || "https://mineru.net").trim().replace(/\/+$/, "")
    const maxAssets = Math.max(1, options.maxAssets ?? 10)
    const maxWaitMs = Math.max(5000, options.maxWaitMs ?? 120000)
    const fileBuf = new Uint8Array(await file.arrayBuffer())
    const resp = await fetch("/api/third-party-parser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || "",
            fileBase64: bytesToBase64(fileBuf),
            apiToken: token,
            apiBase,
            maxAssets,
            maxWaitMs,
        }),
    })
    if (!resp.ok) {
        let detail = ""
        try {
            const errPayload = await resp.json()
            detail = String(errPayload?.error || "")
        } catch {
        }
        throw new Error(
            `Third-party parser proxy failed: ${resp.status}${detail ? ` - ${detail}` : ""}`,
        )
    }
    const payload = await resp.json()
    if (!payload?.success) {
        throw new Error(String(payload?.error || "Third-party parser proxy error"))
    }
    const items = Array.isArray(payload?.assets) ? payload.assets : []
    return items
        .filter((x: any) => x && typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:image"))
        .slice(0, maxAssets)
        .map((x: any, idx: number) => ({
            id: `third-party-${file.name}-${idx + 1}`,
            sourceFileName: file.name,
            sourceType: "third_party",
            order: idx + 1,
            dataUrl: String(x.dataUrl),
            textHint: typeof x.textHint === "string" ? x.textHint : "",
        }))
}


