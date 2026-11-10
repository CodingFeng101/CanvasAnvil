import JSZip from "jszip"

/**
 * Figures from a PDF or Word file through MinerU (mineru.net): upload, wait for the parse, then take the
 * images in the order the parsed markdown shows them (their alt text as the hint), then any other images.
 *
 * Kept free of the HTTP layer so the PPT skill bundles this same code (scripts/sync-ppt-skill.mjs).
 */
export type MineruOptions = {
    fileName: string
    bytes: Uint8Array
    apiToken: string
    apiBase?: string
    maxAssets?: number
    maxWaitMs?: number
}

export type MineruAsset = { fileName: string; mime: string; bytes: Uint8Array; textHint: string }

export const MINERU_DEFAULT_BASE = "https://mineru.net"

const getMimeByExt = (name: string) => {
    const lower = String(name || "").toLowerCase()
    if (lower.endsWith(".png")) return "image/png"
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
    if (lower.endsWith(".webp")) return "image/webp"
    if (lower.endsWith(".gif")) return "image/gif"
    if (lower.endsWith(".bmp")) return "image/bmp"
    if (lower.endsWith(".svg")) return "image/svg+xml"
    return "image/png"
}

const normalizeMineruImagePath = (rawPath: string) => {
    let p = String(rawPath || "").trim().replace(/^['"]|['"]$/g, "")
    if (!p) return ""
    p = p.replace(/\\/g, "/")
    if (p.startsWith("/")) p = p.slice(1)
    if (p.startsWith("file/")) p = p.slice(5)
    if (p.startsWith("files/")) p = p.slice(6)
    return p
}

const findZipImageEntry = (zip: JSZip, relPath: string) => {
    const target = normalizeMineruImagePath(relPath).toLowerCase()
    if (!target) return null
    const entries = Object.values(zip.files).filter((f) => !f.dir)
    const exact = entries.find(
        (e) =>
            String(e.name || "").replace(/\\/g, "/").toLowerCase() === target,
    )
    if (exact) return exact
    const suffix = `/${target}`
    return (
        entries.find((e) => {
            const name = String(e.name || "").replace(/\\/g, "/").toLowerCase()
            return name.endsWith(suffix) || name.endsWith(target)
        }) || null
    )
}

export async function extractMineruAssets(options: MineruOptions): Promise<MineruAsset[]> {
    const apiBase = String(options.apiBase || MINERU_DEFAULT_BASE)
        .trim()
        .replace(/\/+$/, "")
    const token = String(options.apiToken || "").trim()
    if (!token) throw new Error("Third-party parser token is empty")
    const maxAssets = Math.max(1, options.maxAssets ?? 10)
    const maxWaitMs = Math.max(5000, options.maxWaitMs ?? 120000)

    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    }

    const uploadUrlResp = await fetch(`${apiBase}/api/v4/file-urls/batch`, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
            files: [{ name: options.fileName }],
            model_version: "vlm",
        }),
    })
    if (!uploadUrlResp.ok) {
        throw new Error(
            `Third-party parser request failed: ${uploadUrlResp.status}`,
        )
    }
    const uploadPayload = await uploadUrlResp.json()
    if (uploadPayload?.code !== 0) {
        throw new Error(
            String(
                uploadPayload?.msg ||
                    "Third-party parser get upload URL failed",
            ),
        )
    }

    const batchId = String(uploadPayload?.data?.batch_id || "")
    const uploadUrl = String(uploadPayload?.data?.file_urls?.[0] || "")
    if (!batchId || !uploadUrl) {
        throw new Error("Third-party parser missing batch id or upload URL")
    }

    const uploadResp = await fetch(uploadUrl, {
        method: "PUT",
        body: options.bytes,
    })
    if (!uploadResp.ok) {
        const body = await uploadResp.text().catch(() => "")
        throw new Error(
            `Third-party parser upload failed: ${uploadResp.status}${body ? ` body=${body.slice(0, 300)}` : ""}`,
        )
    }

    const resultUrl = `${apiBase}/api/v4/extract-results/batch/${batchId}`
    const start = Date.now()
    let fullZipUrl = ""
    while (Date.now() - start < maxWaitMs) {
        const pollResp = await fetch(resultUrl, {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!pollResp.ok) {
            throw new Error(`Third-party parser poll failed: ${pollResp.status}`)
        }
        const pollPayload = await pollResp.json()
        if (pollPayload?.code !== 0) {
            throw new Error(
                String(
                    pollPayload?.msg || "Third-party parser poll returned error",
                ),
            )
        }

        const extractResult = pollPayload?.data?.extract_result?.[0]
        const state = String(extractResult?.state || "")
        if (state === "done") {
            fullZipUrl = String(extractResult?.full_zip_url || "")
            break
        }
        if (state === "failed") {
            throw new Error(
                String(extractResult?.err_msg || "Third-party parser extraction failed"),
            )
        }
        await new Promise((r) => setTimeout(r, 2000))
    }
    if (!fullZipUrl) throw new Error("Third-party parser timeout")

    const zipResp = await fetch(fullZipUrl)
    if (!zipResp.ok) {
        throw new Error(
            `Third-party parser result download failed: ${zipResp.status}`,
        )
    }
    const zip = await JSZip.loadAsync(await zipResp.arrayBuffer())

    const markdownEntry =
        Object.values(zip.files).find(
            (f) => !f.dir && /\.md$/i.test(String(f.name || "")),
        ) || null
    const markdown = markdownEntry ? await markdownEntry.async("string") : ""

    const usedImageNames = new Set<string>()
    const assets: MineruAsset[] = []
    const take = async (entry: JSZip.JSZipObject, textHint: string) => {
        const entryName = String(entry.name || "")
        assets.push({
            fileName: entryName,
            mime: getMimeByExt(entryName),
            bytes: await entry.async("uint8array"),
            textHint,
        })
        usedImageNames.add(entryName)
    }

    if (markdown) {
        const imageRe = /!\[([^\]]*)\]\(([^)]+)\)/g
        let match: RegExpExecArray | null
        while ((match = imageRe.exec(markdown))) {
            if (assets.length >= maxAssets) break
            const alt = String(match[1] || "").trim()
            const relPath = String(match[2] || "").trim()
            if (!relPath || /^https?:\/\//i.test(relPath)) continue

            const entry = findZipImageEntry(zip, relPath)
            if (!entry || usedImageNames.has(String(entry.name || ""))) continue
            await take(entry, alt)
        }
    }

    if (assets.length < maxAssets) {
        const imageEntries = Object.values(zip.files)
            .filter((f) => !f.dir)
            .filter((f) =>
                /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(String(f.name || "")),
            )
        for (const entry of imageEntries) {
            if (assets.length >= maxAssets) break
            if (usedImageNames.has(String(entry.name || ""))) continue
            await take(entry, "")
        }
    }

    return assets
}
