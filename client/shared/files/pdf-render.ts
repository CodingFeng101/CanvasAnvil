import { getDocumentProxy } from "unpdf"

/**
 * Rasterising a PDF page for on-screen previews — file-preview thumbnails and
 * the PPT workspace's page picker. Text extraction lives in extract-text.ts.
 */

export async function getPdfDocumentFromUrl(url: string): Promise<any> {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    return await getDocumentProxy(new Uint8Array(buffer))
}

export async function getPdfPageCountFromUrl(url: string): Promise<number> {
    const pdf = await getPdfDocumentFromUrl(url)
    return (pdf as any).numPages ?? 0
}

/** Draws one page at `targetWidth` CSS pixels, scaled up for the device ratio. */
export async function renderPdfPageToCanvas(opts: {
    pdf: any
    pageNumber: number
    canvas: HTMLCanvasElement
    targetWidth: number
}): Promise<void> {
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
