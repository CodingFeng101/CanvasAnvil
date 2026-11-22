import { createPenStore, type PenPoint } from "@/shared/pen-store"

/*
 * The pen over draw.io while a diagram streams in. Each shape or connector
 * draw.io draws is hidden the moment it appears; the pen traces its outline,
 * and then it shows. draw.io draws cells in the order they are written, each
 * shape in a group of its own with its label in the groups after it, so the
 * Nth shape group is the Nth cell, also after draw.io redraws. A draw.io from
 * another origin cannot be looked into, and then the diagram simply appears.
 */

export const diagramPen = createPenStore()

const GEOMETRY = ":scope > rect, :scope > ellipse, :scope > path, :scope > polygon, :scope > polyline, :scope > image"

type Cell = { shape: Element; labels: Element[] }

function drawio(): { frame: HTMLIFrameElement; pane: Element } | null {
    try {
        const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="proto=json"]')
        const pane = frame?.contentDocument?.querySelector(".geDiagramContainer svg > g > g:nth-child(2)")
        return frame && pane ? { frame, pane } : null
    } catch {
        return null
    }
}

/** The cells as drawn: each shape group with the label groups after it. */
function cellsOf(pane: Element): Cell[] {
    const cells: Cell[] = []
    for (const child of Array.from(pane.children)) {
        if (child.querySelector(GEOMETRY)) cells.push({ shape: child, labels: [] })
        else cells.at(-1)?.labels.push(child)
    }
    return cells
}

const setShown = (cell: Cell | undefined, shown: boolean) => {
    if (!cell) return
    for (const el of [cell.shape, ...cell.labels]) {
        const style = (el as SVGElement).style
        style.transition = shown ? "opacity 200ms ease-out" : ""
        style.opacity = shown ? "" : "0"
    }
}

/** Points along an SVG shape, in the app window. */
function sample(el: SVGGraphicsElement, outer: DOMRect): PenPoint[] | null {
    const ctm = el.getScreenCTM()
    if (!ctm) return null
    const at = (x: number, y: number) => ({ x: outer.left + ctm.a * x + ctm.c * y + ctm.e, y: outer.top + ctm.b * x + ctm.d * y + ctm.f })
    // Not `instanceof SVGGeometryElement`: draw.io's elements come from the
    // iframe's window, whose classes are not this window's, so that test always
    // failed and every cell was traced as its bounding box.
    const shape = el as SVGGeometryElement
    if (typeof shape.getTotalLength === "function" && typeof shape.getPointAtLength === "function") {
        const length = shape.getTotalLength()
        if (!length) return null
        const n = Math.min(160, Math.max(8, Math.round(length / 4)))
        return Array.from({ length: n + 1 }, (_, i) => {
            const p = shape.getPointAtLength((length * i) / n)
            return at(p.x, p.y)
        })
    }
    const b = el.getBBox()
    return [at(b.x, b.y), at(b.x + b.width, b.y), at(b.x + b.width, b.y + b.height), at(b.x, b.y + b.height), at(b.x, b.y)]
}

/**
 * A cell's outline in the app window: a shape all the way round (an ellipse
 * as an ellipse, a rhombus as a rhombus); a connector along its line, then
 * round its arrowhead.
 */
function outlineOf(cell: Cell, frame: HTMLIFrameElement): PenPoint[] | null {
    const outer = frame.getBoundingClientRect()
    const line = cell.shape.querySelector<SVGGraphicsElement>(":scope > path[fill='none']")
    const isEdge = !!line && !cell.shape.querySelector(":scope > rect, :scope > ellipse")
    if (!isEdge) {
        const geo = cell.shape.querySelector<SVGGraphicsElement>(GEOMETRY)
        return geo ? sample(geo, outer) : null
    }
    // draw.io draws the line twice (a wide invisible copy to click on); one is enough.
    const points = sample(line, outer)
    if (!points) return null
    for (const head of Array.from(cell.shape.querySelectorAll<SVGGraphicsElement>(":scope > path:not([fill='none'])"))) {
        const more = sample(head, outer)
        if (more) points.push(...more)
    }
    return points
}

let handled = 0
const waiting = new Set<number>()
let observer: MutationObserver | null = null
let watched: Element | null = null

/** Hide what draw.io just drew and hand it to the pen. */
function catchUp() {
    const found = drawio()
    if (!found) return
    const cells = cellsOf(found.pane)
    // draw.io may have redrawn a cell still waiting for the pen.
    for (const index of waiting) setShown(cells[index], false)
    for (let index = handled; index < cells.length; index++) {
        setShown(cells[index], false)
        waiting.add(index)
        diagramPen.trace({
            points: () => {
                const now = drawio()
                const cell = now && cellsOf(now.pane)[index]
                return now && cell ? outlineOf(cell, now.frame) : null
            },
            done: () => {
                waiting.delete(index)
                const now = drawio()
                if (now) setShown(cellsOf(now.pane)[index], true)
            },
        })
    }
    handled = Math.max(handled, cells.length)
}

/** After each streamed frame: watch draw.io's drawing so new cells are hidden before they are ever painted. */
export function followDrawio() {
    const found = drawio()
    if (!found) return
    if (watched !== found.pane) {
        observer?.disconnect()
        const View = found.frame.contentWindow as (Window & { MutationObserver: typeof MutationObserver }) | null
        observer = new (View?.MutationObserver ?? MutationObserver)(catchUp)
        observer.observe(found.pane, { childList: true, subtree: true })
        watched = found.pane
    }
    catchUp()
}

/** A new diagram, or the finished one: stop following and show everything. */
export function resetDrawioPen() {
    observer?.disconnect()
    observer = null
    watched = null
    const found = drawio()
    if (found) {
        const cells = cellsOf(found.pane)
        for (const index of waiting) setShown(cells[index], true)
    }
    waiting.clear()
    handled = 0
    diagramPen.clear()
}
