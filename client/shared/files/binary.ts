import { getDocumentProxy } from "unpdf"

/** Byte-level helpers shared by the archive and visual-asset extractors. */

export const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = ""
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
}

export const getMimeByExt = (name: string) => {
    const n = String(name || "").toLowerCase()
    if (n.endsWith(".png")) return "image/png"
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
    if (n.endsWith(".webp")) return "image/webp"
    if (n.endsWith(".gif")) return "image/gif"
    if (n.endsWith(".bmp")) return "image/bmp"
    if (n.endsWith(".svg")) return "image/svg+xml"
    return "image/png"
}

export const latexAssetBytesToDataUrl = async (name: string, bytes: Uint8Array) => {
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

export const decodeXmlText = (raw: string) => {
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
