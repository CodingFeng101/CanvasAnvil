import JSZip from "jszip"
import { ungzip } from "pako"
import { latexAssetBytesToDataUrl } from "@/shared/files/binary"
import type { ExtractedVisualAsset } from "@/shared/files/types"

/**
 * LaTeX sources arrive as .zip or .tar.gz uploads. Both are walked the same
 * way: find the main .tex, follow \input/\include to build the full source,
 * then pull out the text and the \includegraphics figures it references.
 */

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
