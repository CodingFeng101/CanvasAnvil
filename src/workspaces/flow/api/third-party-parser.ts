import JSZip from "jszip"
import { z } from "zod"

const requestSchema = z.object({
    fileName: z.string().min(1).max(255),
    fileType: z.string().max(200).optional(),
    fileBase64: z.string().min(1),
    apiToken: z.string().min(1),
    apiBase: z.string().url().optional(),
    maxAssets: z.number().int().positive().max(50).optional(),
    maxWaitMs: z.number().int().positive().max(300000).optional(),
})

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

const uint8ToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")

export async function POST(req: Request) {
    let data: z.infer<typeof requestSchema>
    try {
        data = requestSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const apiBase = String(data.apiBase || "https://mineru.net")
        .trim()
        .replace(/\/+$/, "")
    const token = String(data.apiToken || "").trim()
    const maxAssets = Math.max(1, data.maxAssets ?? 10)
    const maxWaitMs = Math.max(5000, data.maxWaitMs ?? 120000)
    const fileBytes = Buffer.from(data.fileBase64, "base64")

    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    }

    try {
        const uploadUrlResp = await fetch(`${apiBase}/api/v4/file-urls/batch`, {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
                files: [{ name: data.fileName }],
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
            body: fileBytes,
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
        const zipArrayBuffer = await zipResp.arrayBuffer()
        const zip = await JSZip.loadAsync(zipArrayBuffer)

        const markdownEntry =
            Object.values(zip.files).find(
                (f) => !f.dir && /\.md$/i.test(String(f.name || "")),
            ) || null
        const markdown = markdownEntry ? await markdownEntry.async("string") : ""

        const usedImageNames = new Set<string>()
        const assets: Array<{ dataUrl: string; textHint: string }> = []

        if (markdown) {
            const imageRe = /!\[([^\]]*)\]\(([^)]+)\)/g
            let match: RegExpExecArray | null
            while ((match = imageRe.exec(markdown))) {
                if (assets.length >= maxAssets) break
                const alt = String(match[1] || "").trim()
                const relPath = String(match[2] || "").trim()
                if (!relPath || /^https?:\/\//i.test(relPath)) continue

                const entry = findZipImageEntry(zip, relPath)
                if (!entry) continue
                const entryName = String(entry.name || "")
                if (usedImageNames.has(entryName)) continue

                const bytes = await entry.async("uint8array")
                const mime = getMimeByExt(entryName)
                assets.push({
                    dataUrl: `data:${mime};base64,${uint8ToBase64(bytes)}`,
                    textHint: alt,
                })
                usedImageNames.add(entryName)
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
                const entryName = String(entry.name || "")
                if (usedImageNames.has(entryName)) continue
                const bytes = await entry.async("uint8array")
                const mime = getMimeByExt(entryName)
                assets.push({
                    dataUrl: `data:${mime};base64,${uint8ToBase64(bytes)}`,
                    textHint: "",
                })
                usedImageNames.add(entryName)
            }
        }

        return Response.json({ success: true, assets })
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        console.error("[third-party-parser] failed:", msg)
        return Response.json(
            { success: false, error: msg },
            { status: 500 },
        )
    }
}
