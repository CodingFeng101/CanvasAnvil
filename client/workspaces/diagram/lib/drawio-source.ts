/**
 * Where the draw.io editor is loaded from, in the order to try.
 *
 * `npm install` puts a copy of draw.io in public/drawio/ (scripts/fetch-drawio.mjs);
 * when that copy is there it comes first, so the canvas works offline and does
 * not wait on the internet. The public embed is sometimes slow or unreachable, and the editor then shows
 * an empty canvas with no hint why. Without a configured address the canvas
 * tries the public embed, then the GitHub Pages copy of draw.io (the skill's
 * diagram editor uses the same fallback). A configured address
 * (VITE_DRAWIO_BASE_URL) is used alone: someone pointing at their own copy,
 * often on an intranet, does not want the editor silently loaded from the
 * internet instead.
 */

export const DEFAULT_DRAWIO_URL = "https://embed.diagrams.net"
export const MIRROR_DRAWIO_URL = "https://jgraph.github.io/drawio/src/main/webapp/index.html"

/** How long one address gets before the next is tried. */
export const DRAWIO_LOAD_TIMEOUT_MS = 8000

/** The local copy, relative to the app's base address. */
export const LOCAL_DRAWIO_PAGE = "drawio/index.html"
/** Written by the download script once the copy is complete. */
export const LOCAL_DRAWIO_MARKER = "drawio/canvasanvil-drawio.json"

export function drawioSources(configured?: string | null, local?: string | null): string[] {
    const own = configured?.trim()
    if (own) return [own]
    return local ? [local, DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL] : [DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]
}

/**
 * The absolute address of the local copy, or null when there is none. The
 * marker is checked rather than the page, because the dev server and the SPA
 * fallback answer any missing path with the app's own index.html. The address
 * must be absolute: the embed builds it with `new URL` and matches the
 * editor's messages against it.
 */
export async function findLocalDrawio(
    base: string,
    fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
    try {
        const response = await fetchImpl(new URL(LOCAL_DRAWIO_MARKER, base).href, { cache: "no-cache" })
        if (!response.ok) return null
        const marker = (await response.json()) as { version?: unknown }
        return typeof marker?.version === "string" ? new URL(LOCAL_DRAWIO_PAGE, base).href : null
    } catch {
        return null
    }
}

/**
 * How long to wait after the editor's first load before loading a diagram
 * into it. The GitHub Pages copy fits a diagram loaded straight away to 1%
 * zoom; other sources need no wait.
 */
export function drawioSettleDelay(url: string): number {
    return url === MIRROR_DRAWIO_URL ? 1500 : 0
}

/** What to do when the current address has not loaded in time. */
export function nextDrawioSource(
    sources: string[],
    index: number,
): { kind: "next"; index: number } | { kind: "failed" } {
    return index + 1 < sources.length ? { kind: "next", index: index + 1 } : { kind: "failed" }
}
