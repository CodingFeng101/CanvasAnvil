/**
 * Where the draw.io editor is loaded from, in the order to try.
 *
 * The public embed is sometimes slow or unreachable, and the editor then shows
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

export function drawioSources(configured?: string | null): string[] {
    const own = configured?.trim()
    return own ? [own] : [DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]
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
