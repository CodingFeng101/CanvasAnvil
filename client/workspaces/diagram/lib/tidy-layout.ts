/**
 * Tidies the layout of a diagram the model drew, before it reaches the canvas.
 *
 * The model is good at relations and bad at arithmetic. In a recorded
 * architecture diagram every row it drew had equal widths and equal gaps, yet
 * not one of its fourteen edges joined two centres that lined up: a box sat
 * 12px to the side of the box under it, and orthogonal routing turned each of
 * those slips into a small Z. So the coordinates are read as a sketch of what
 * the model meant — these boxes are a row, these two belong in one column —
 * and the geometry is recomputed from that:
 *
 *   1. group boxes into rows (per container), give each row one centre line
 *      and, where the widths are already close, one width
 *   2. reorder boxes inside a row when that removes crossings and bends
 *   3. place the fullest row evenly, then line every other box up under or
 *      over the boxes it connects to, keeping order and a minimum gap
 *   4. snap to the 10px grid, grow containers that no longer hold their row
 *   5. route edges: straight where the ends now line up, otherwise one jog in
 *      the gap between the two rows
 *
 * Only layered, orthogonally-routed diagrams are touched. A mind map, a ring
 * or a free scatter has no rows to recover, and guessing at one would wreck
 * it, so those come back unchanged.
 *
 * Plain string work on the XML, no DOM, so it runs the same in the browser
 * and in the Node test runner, and leaves every cell it does not move
 * byte-for-byte as the model wrote it.
 */

export interface TidyOptions {
    /**
     * Ids of the cells an edit touched. When set, only the rows holding those
     * cells are laid out again; everything else stays where it is.
     */
    only?: Iterable<string>
}

export type Direction = "TB" | "LR" | "grid" | "elk"

export interface TidyReport {
    applied: boolean
    /** Why nothing was changed, when applied is false. */
    reason?: string
    /**
     * TB and LR: layered along one direction. grid: rows and columns both,
     * for flows that turn corners.
     */
    direction?: Direction
    moved: number
    straightened: number
}

export interface TidyResult {
    xml: string
    report: TidyReport
}

export interface Box {
    x: number
    y: number
    w: number
    h: number
}

const GRID = 10
const SIZE_STEP = 20
const MIN_GAP = 20
const MAX_GAP = 80
const LANE_STEP = 4
const MAX_PASSES = 4
const OVERLAP_MIN = 20

// ---------------------------------------------------------------------------
// XML scanning
// ---------------------------------------------------------------------------

const ATTRS = String.raw`((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)`
const CELL_RE = new RegExp(String.raw`<mxCell\b${ATTRS}\s*(?:\/>|>([\s\S]*?)<\/mxCell>)`, "g")
const GEOMETRY_RE = new RegExp(String.raw`<mxGeometry\b${ATTRS}\s*(\/?)>`)
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const POINTS_RE = /<Array\b[^>]*\bas\s*=\s*["']points["'][^>]*?(?:\/>|>[\s\S]*?<\/Array>)/g

interface RawCell {
    id: string
    start: number
    end: number
    attrText: string
    attrs: Record<string, string>
    body: string | null
}

function parseAttrs(text: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    for (const m of text.matchAll(ATTR_RE)) {
        attrs[m[1]] = m[2] ?? m[3] ?? ""
    }
    return attrs
}

function scanCells(xml: string): RawCell[] {
    const cells: RawCell[] = []
    for (const m of xml.matchAll(CELL_RE)) {
        const attrText = m[1] || ""
        const attrs = parseAttrs(attrText)
        if (!attrs.id) continue
        cells.push({
            id: attrs.id,
            start: m.index ?? 0,
            end: (m.index ?? 0) + m[0].length,
            attrText,
            attrs,
            body: m[2] ?? null,
        })
    }
    return cells
}

function readGeometry(body: string | null): Box | null {
    if (!body) return null
    const m = body.match(GEOMETRY_RE)
    if (!m) return null
    const g = parseAttrs(m[1] || "")
    const num = (v: string | undefined) => {
        const n = Number(v)
        return Number.isFinite(n) ? n : 0
    }
    return { x: num(g.x), y: num(g.y), w: num(g.width), h: num(g.height) }
}

function setAttr(attrText: string, name: string, value: string): string {
    const re = new RegExp(String.raw`(\s${name}\s*=\s*)(?:"[^"]*"|'[^']*')`)
    if (re.test(attrText)) return attrText.replace(re, `$1"${value}"`)
    return `${attrText} ${name}="${value}"`
}

function fmt(n: number): string {
    return String(Math.round(n * 100) / 100)
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function styleEntries(style: string): string[] {
    return String(style || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
}

export function styleValue(style: string, key: string): string | undefined {
    for (const entry of styleEntries(style)) {
        const eq = entry.indexOf("=")
        if (eq < 0) {
            if (entry === key) return ""
        } else if (entry.slice(0, eq) === key) {
            return entry.slice(eq + 1)
        }
    }
    return undefined
}

export function styleHas(style: string, key: string): boolean {
    return styleValue(style, key) !== undefined
}

function setStyle(style: string, updates: Record<string, string | null>): string {
    const keys = new Set(Object.keys(updates))
    const kept = styleEntries(style).filter((entry) => {
        const eq = entry.indexOf("=")
        return !keys.has(eq < 0 ? entry : entry.slice(0, eq))
    })
    for (const [k, v] of Object.entries(updates)) {
        if (v !== null) kept.push(`${k}=${v}`)
    }
    return kept.length ? `${kept.join(";")};` : ""
}

export function isOrthogonal(style: string): boolean {
    const edgeStyle = styleValue(style, "edgeStyle") || ""
    return /orthogonalEdgeStyle|elbowEdgeStyle/i.test(edgeStyle)
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#xa;": "\n", "&#10;": "\n", "&nbsp;": " " }

/**
 * Roughly how wide a label is, so a box is never narrowed below its text.
 * CJK glyphs are about one em, everything else about 0.6 em.
 */
function labelWidth(value: string, style: string): number {
    const fontSize = Number(styleValue(style, "fontSize")) || 12
    const text = String(value || "")
        .replace(/&lt;|&gt;|&amp;|&quot;|&#xa;|&#10;|&nbsp;/g, (m) => ENTITIES[m])
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(div|p)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
    let widest = 0
    for (const line of text.split("\n")) {
        let w = 0
        for (const ch of line) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.6
        widest = Math.max(widest, w * fontSize)
    }
    return widest + 16
}

function hasFixedSize(style: string): boolean {
    return (
        styleValue(style, "aspect") === "fixed" ||
        styleHas(style, "image") ||
        styleValue(style, "shape") === "image" ||
        /^mxgraph\./.test(styleValue(style, "shape") || "")
    )
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const cx = (b: Box) => b.x + b.w / 2
const cy = (b: Box) => b.y + b.h / 2
const area = (b: Box) => b.w * b.h
const snap = (v: number) => Math.round(v / GRID) * GRID
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step

function contains(outer: Box, inner: Box, tol = 1): boolean {
    return (
        inner.x >= outer.x - tol &&
        inner.y >= outer.y - tol &&
        inner.x + inner.w <= outer.x + outer.w + tol &&
        inner.y + inner.h <= outer.y + outer.h + tol
    )
}

function containsPoint(b: Box, x: number, y: number): boolean {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function transpose(b: Box): Box {
    return { x: b.y, y: b.x, w: b.h, h: b.w }
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function segmentHitsBox(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    b: Box,
): boolean {
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    const top = Math.min(y1, y2)
    const bottom = Math.max(y1, y2)
    return right > b.x + 1 && left < b.x + b.w - 1 && bottom > b.y + 1 && top < b.y + b.h - 1
}

// ---------------------------------------------------------------------------
// The diagram model
// ---------------------------------------------------------------------------

export interface Vertex {
    id: string
    cell: RawCell
    parent: string
    style: string
    /** Absolute box as the model drew it. */
    abs: Box
    container: boolean
    fixedSize: boolean
    /** Innermost container this vertex sits in, or "" for the page. */
    region: string
    depth: number
}

export interface Edge {
    id: string
    cell: RawCell
    source: string
    target: string
    style: string
}

export interface Model {
    cells: RawCell[]
    vertices: Map<string, Vertex>
    leaves: Vertex[]
    containers: Vertex[]
    edges: Edge[]
}

export function buildModel(xml: string): Model {
    const cells = scanCells(xml)
    const byId = new Map(cells.map((c) => [c.id, c]))
    const rel = new Map<string, Box>()
    for (const c of cells) {
        if (c.attrs.vertex !== "1") continue
        const parent = byId.get(c.attrs.parent || "")
        if (parent?.attrs.edge === "1") continue
        const g = readGeometry(c.body)
        if (!g || g.w <= 0 || g.h <= 0) continue
        rel.set(c.id, g)
    }

    const absCache = new Map<string, Box>()
    const absOf = (id: string, depth = 0): Box => {
        const cached = absCache.get(id)
        if (cached) return cached
        const r = rel.get(id)!
        const parentId = byId.get(id)?.attrs.parent || ""
        let box = r
        if (rel.has(parentId) && depth < 20) {
            const p = absOf(parentId, depth + 1)
            box = { x: r.x + p.x, y: r.y + p.y, w: r.w, h: r.h }
        }
        absCache.set(id, box)
        return box
    }

    const vertices = new Map<string, Vertex>()
    for (const id of rel.keys()) {
        const cell = byId.get(id)!
        const style = cell.attrs.style || ""
        vertices.set(id, {
            id,
            cell,
            parent: cell.attrs.parent || "",
            style,
            abs: absOf(id),
            container: false,
            fixedSize: hasFixedSize(style),
            region: "",
            depth: 0,
        })
    }

    const all = [...vertices.values()]
    for (const v of all) {
        const explicit =
            styleHas(v.style, "swimlane") ||
            styleValue(v.style, "container") === "1" ||
            styleHas(v.style, "group") ||
            all.some((o) => o.parent === v.id)
        v.container =
            explicit ||
            all.some(
                (o) => o !== v && area(o.abs) < area(v.abs) * 0.9 && contains(v.abs, o.abs),
            )
    }
    const containers = all.filter((v) => v.container)

    const regionOf = (v: Vertex): string => {
        const parent = vertices.get(v.parent)
        if (parent?.container) return parent.id
        let best: Vertex | null = null
        for (const c of containers) {
            if (c === v || area(c.abs) <= area(v.abs)) continue
            if (!containsPoint(c.abs, cx(v.abs), cy(v.abs))) continue
            if (!best || area(c.abs) < area(best.abs)) best = c
        }
        return best?.id || ""
    }
    for (const v of all) v.region = regionOf(v)
    for (const v of all) {
        let depth = 0
        let r = v.region
        while (r && depth < 20) {
            depth++
            r = vertices.get(r)?.region || ""
        }
        v.depth = depth
    }

    const leaves = all.filter((v) => !v.container)
    const leafIds = new Set(leaves.map((v) => v.id))
    const edges: Edge[] = []
    for (const c of cells) {
        if (c.attrs.edge !== "1") continue
        const { source = "", target = "" } = c.attrs
        if (!leafIds.has(source) || !leafIds.has(target) || source === target) continue
        edges.push({ id: c.id, cell: c, source, target, style: c.attrs.style || "" })
    }

    return { cells, vertices, leaves, containers, edges }
}

/**
 * Absolute boxes and edges of a diagram, for checking a layout from outside:
 * the tests measure alignment and grid use through this.
 */
export function readDiagramLayout(xml: string): {
    boxes: Map<string, Box>
    leaves: string[]
    edges: { id: string; source: string; target: string; style: string; points: number }[]
} {
    const model = buildModel(xml)
    return {
        boxes: new Map([...model.vertices.values()].map((v) => [v.id, v.abs])),
        leaves: model.leaves.map((v) => v.id),
        edges: model.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            style: e.style,
            points: (e.cell.body?.match(/<mxPoint\b/g) || []).filter(Boolean).length,
        })),
    }
}

export interface DiagramShape {
    id: string
    /** Absolute box. */
    box: Box
    style: string
    value: string
    container: boolean
    /** Innermost container the shape sits in, or "" for the page. */
    region: string
    /** Free text with no edges: a title or a note. */
    label: boolean
}

export interface DiagramEdge {
    id: string
    source: string
    target: string
    style: string
    /** Absolute waypoints. */
    points: [number, number][]
    /** exitX/exitY and entryX/entryY when the style pins them. */
    exit: [number, number] | null
    entry: [number, number] | null
}

/**
 * Every shape and every edge between two shapes, in absolute coordinates.
 * Edges whose source or target is missing are counted, not returned.
 */
export function readDiagramModel(xml: string): {
    shapes: Map<string, DiagramShape>
    edges: DiagramEdge[]
    danglingEdges: string[]
} {
    const model = buildModel(xml)
    const linked = new Set<string>()
    const edges: DiagramEdge[] = []
    const danglingEdges: string[] = []
    for (const c of model.cells) {
        if (c.attrs.edge !== "1") continue
        const { source = "", target = "" } = c.attrs
        linked.add(source)
        linked.add(target)
        if (!model.vertices.has(source) || !model.vertices.has(target)) {
            danglingEdges.push(c.id)
            continue
        }
        const style = c.attrs.style || ""
        const origin = model.vertices.get(c.attrs.parent || "")?.abs
        const points: [number, number][] = []
        const array = c.body?.match(POINTS_RE)?.[0] || ""
        for (const m of array.matchAll(/<mxPoint\b([^>]*)>?/g)) {
            const a = parseAttrs(m[1] || "")
            points.push([Number(a.x || 0) + (origin?.x ?? 0), Number(a.y || 0) + (origin?.y ?? 0)])
        }
        const pair = (kx: string, ky: string): [number, number] | null => {
            const x = styleValue(style, kx)
            const y = styleValue(style, ky)
            return x !== undefined && y !== undefined && x !== "" && y !== "" ? [Number(x), Number(y)] : null
        }
        edges.push({
            id: c.id,
            source,
            target,
            style,
            points,
            exit: pair("exitX", "exitY"),
            entry: pair("entryX", "entryY"),
        })
    }
    const shapes = new Map<string, DiagramShape>()
    for (const v of model.vertices.values()) {
        shapes.set(v.id, {
            id: v.id,
            box: v.abs,
            style: v.style,
            value: v.cell.attrs.value || "",
            container: v.container,
            region: v.region,
            label: !v.container && styleHas(v.style, "text") && !linked.has(v.id),
        })
    }
    return { shapes, edges, danglingEdges }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface Node {
    id: string
    region: string
    /** Working-space box (transposed for left-to-right diagrams). */
    box: Box
    orig: Box
    fixedSize: boolean
    /** Narrowest the box may get along the row and keep its label. */
    minW: number
}

interface Row {
    index: number
    region: string
    members: Node[]
    locked: boolean
}

function clusterRows(nodes: Node[]): Row[] {
    const byRegion = new Map<string, Node[]>()
    for (const n of nodes) {
        const list = byRegion.get(n.region) || []
        list.push(n)
        byRegion.set(n.region, list)
    }
    const rows: Row[] = []
    for (const [region, list] of byRegion) {
        const sorted = [...list].sort((a, b) => cy(a.box) - cy(b.box) || cx(a.box) - cx(b.box))
        let current: Node[] = []
        let anchorY = 0
        let anchorH = 0
        for (const n of sorted) {
            const tol = Math.max(12, 0.4 * Math.min(anchorH || n.box.h, n.box.h))
            if (current.length && Math.abs(cy(n.box) - anchorY) <= tol) {
                current.push(n)
            } else {
                if (current.length) rows.push({ index: 0, region, members: current, locked: false })
                current = [n]
                anchorY = cy(n.box)
                anchorH = n.box.h
            }
        }
        if (current.length) rows.push({ index: 0, region, members: current, locked: false })
    }
    rows.sort((a, b) => {
        const ay = median(a.members.map((m) => cy(m.box)))
        const by = median(b.members.map((m) => cy(m.box)))
        return ay - by || cx(a.members[0].box) - cx(b.members[0].box)
    })
    rows.forEach((r, i) => {
        r.index = i
        r.members.sort((a, b) => cx(a.box) - cx(b.box))
    })
    return rows
}

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

interface DirectionScore {
    ok: boolean
    sameRow: number
}

function scoreDirection(model: Model, flip: boolean): DirectionScore {
    const nodes: Node[] = model.leaves.map((v) => {
        const box = flip ? transpose(v.abs) : v.abs
        return { id: v.id, region: v.region, box, orig: box, fixedSize: v.fixedSize, minW: 0 }
    })
    const rows = clusterRows(nodes)
    const rowOf = new Map<string, Row>()
    for (const r of rows) for (const m of r.members) rowOf.set(m.id, r)
    const boxOf = new Map(nodes.map((n) => [n.id, n.box]))
    let sameRow = 0
    let crossAxis = 0
    for (const e of model.edges) {
        if (rowOf.get(e.source) === rowOf.get(e.target)) {
            sameRow++
            continue
        }
        const s = boxOf.get(e.source)!
        const t = boxOf.get(e.target)!
        const separated = s.y + s.h <= t.y || t.y + t.h <= s.y
        if (separated && Math.abs(cy(t) - cy(s)) >= Math.abs(cx(t) - cx(s))) crossAxis++
    }
    // Rows must be bands with air between them. Two "rows" whose boxes
    // overlap vertically are a scatter, and lining each up on its own
    // would stack boxes on top of each other.
    let banded = true
    const byRegion = new Map<string, Row[]>()
    for (const r of rows) byRegion.set(r.region, [...(byRegion.get(r.region) || []), r])
    for (const list of byRegion.values()) {
        const bands = list
            .map((r) => [
                Math.min(...r.members.map((m) => m.box.y)),
                Math.max(...r.members.map((m) => m.box.y + m.box.h)),
            ])
            .sort((a, b) => a[0] - b[0])
        for (let i = 1; i < bands.length; i++) {
            if (bands[i][0] < bands[i - 1][1] - 2) banded = false
        }
    }
    const total = model.edges.length
    const avgRow = nodes.length / Math.max(1, rows.length)
    const ok =
        banded &&
        sameRow <= 0.3 * total &&
        rows.length >= 2 &&
        (avgRow >= 1.8 || crossAxis >= 0.7 * total)
    return { ok, sameRow }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

interface Region {
    box: Box
    pad: { l: number; r: number; t: number; b: number }
}

interface Layout {
    rows: Row[]
    rowOf: Map<string, Row>
    nodes: Map<string, Node>
    neighbours: Map<string, string[]>
    regions: Map<string, Region>
    /** Containers stacked flush with each other, keyed by any member. */
    stacks: Map<string, string[]>
    only: Set<string> | null
    /** Inner bounds per container for the placement in progress. */
    bounds: Map<string, [number, number]>
    /** Smallest gap a row may close to when lining up with its neighbours. */
    alignGap: number
}

function isotonic(values: number[]): number[] {
    const blocks: { sum: number; n: number }[] = []
    for (const v of values) {
        blocks.push({ sum: v, n: 1 })
        while (blocks.length > 1) {
            const b = blocks[blocks.length - 1]
            const a = blocks[blocks.length - 2]
            if (a.sum / a.n <= b.sum / b.n) break
            blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n })
        }
    }
    return blocks.flatMap((b) => Array(b.n).fill(b.sum / b.n))
}

function innerBounds(layout: Layout, region: string): [number, number] {
    return layout.bounds.get(region) ?? [-Infinity, Infinity]
}

function resetBounds(layout: Layout) {
    layout.bounds = new Map()
    for (const [id, r] of layout.regions) {
        layout.bounds.set(id, [r.box.x + r.pad.l, r.box.x + r.box.w - r.pad.r])
    }
}

/**
 * A row wider than its container will make the container grow, and every
 * container stacked flush with it grows too; the rows placed after it should
 * get that room rather than be squeezed into the old width.
 */
function widenStack(layout: Layout, region: string, left: number, right: number) {
    for (const id of layout.stacks.get(region) || [region]) {
        const b = layout.bounds.get(id)
        if (b) layout.bounds.set(id, [Math.min(b[0], left), Math.max(b[1], right)])
    }
}

/**
 * Spread a row across its container. A row the model already spaced evenly
 * keeps its spacing, so a second pass over a tidied diagram changes nothing.
 */
function placeEven(layout: Layout, row: Row, order: Node[], centres: Map<string, number>) {
    const sumW = order.reduce((a, m) => a + m.box.w, 0)
    const n = order.length
    const [L, R] = innerBounds(layout, row.region)
    const bounded = Number.isFinite(L)
    const origLeft = Math.min(...order.map((m) => m.orig.x))
    const origRight = Math.max(...order.map((m) => m.orig.x + m.orig.w))
    const origMiddle = (origLeft + origRight) / 2
    const gaps = order.slice(1).map((m, i) => m.orig.x - (order[i].orig.x + order[i].orig.w))

    const put = (left: number, gap: number) => {
        let x = left
        for (const m of order) {
            centres.set(m.id, x + m.box.w / 2)
            x += m.box.w + gap
        }
    }
    const fitLeft = (left: number, blockW: number) =>
        bounded && blockW <= R - L ? Math.min(Math.max(left, L), R - blockW) : left

    if (n === 1) {
        const w = order[0].box.w
        put(snap(fitLeft(origMiddle - w / 2, w)), 0)
        return
    }

    const uniform =
        gaps.length > 0 && Math.max(...gaps) - Math.min(...gaps) <= 2 && Math.min(...gaps) >= GRID - 1
    if (uniform) {
        const gap = Math.max(GRID, snap(median(gaps)))
        const blockW = sumW + (n - 1) * gap
        if (!bounded || blockW <= R - L) {
            put(snap(fitLeft(origMiddle - blockW / 2, blockW)), gap)
            return
        }
    }

    let gap: number
    let middle: number
    if (bounded) {
        gap = (R - L - sumW) / (n + 1)
        if (gap < MIN_GAP) gap = (R - L - sumW) / (n - 1)
        middle = (L + R) / 2
    } else {
        gap = gaps.length ? Math.max(MIN_GAP, median(gaps)) : MIN_GAP
        middle = origMiddle
    }
    gap = Math.max(GRID, Math.min(MAX_GAP, Math.floor(gap / GRID) * GRID))
    const blockW = sumW + (n - 1) * gap
    put(snap(middle - blockW / 2), gap)
}

/** Line each box up with the boxes it connects to, keeping order and gaps. */
function placeAligned(layout: Layout, row: Row, order: Node[], centres: Map<string, number>) {
    const desired: (number | null)[] = order.map((m) => {
        const placed = (layout.neighbours.get(m.id) || [])
            .filter((id) => layout.rowOf.get(id) !== row && centres.has(id))
            .map((id) => centres.get(id)!)
        return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : null
    })
    if (desired.every((d) => d === null)) {
        placeEven(layout, row, order, centres)
        return
    }
    const shifts = order
        .map((m, i) => (desired[i] === null ? null : desired[i]! - cx(m.orig)))
        .filter((s): s is number => s !== null)
    const shift = shifts.reduce((a, b) => a + b, 0) / shifts.length
    const target = order.map((m, i) => desired[i] ?? cx(m.orig) + shift)

    const gap = layout.alignGap
    const offsets: number[] = [0]
    for (let i = 1; i < order.length; i++) {
        offsets.push(offsets[i - 1] + (order[i - 1].box.w + order[i].box.w) / 2 + gap)
    }
    const z = isotonic(target.map((t, i) => t - offsets[i]))
    let c = z.map((v, i) => v + offsets[i]).map(snap)
    for (let i = 1; i < c.length; i++) {
        const sep = (order[i - 1].box.w + order[i].box.w) / 2 + gap
        if (c[i] - c[i - 1] < sep) c[i] = c[i - 1] + ceilTo(sep, GRID)
    }

    // A row that spills a little past its container makes the container
    // grow; alignment is worth more than the container's old width. Only a
    // row that would spill far is pulled back inside.
    const [L, R] = innerBounds(layout, row.region)
    if (Number.isFinite(L)) {
        const left = c[0] - order[0].box.w / 2
        const right = c[c.length - 1] + order[order.length - 1].box.w / 2
        const spill = Math.max(L - left, right - R)
        if (spill > 2 * MAX_GAP) {
            let move = 0
            if (right - left > R - L) move = (L + R) / 2 - (left + right) / 2
            else if (left < L) move = L - left
            else move = R - right
            c = c.map((v) => snap(v + move))
        }
        widenStack(
            layout,
            row.region,
            c[0] - order[0].box.w / 2,
            c[c.length - 1] + order[order.length - 1].box.w / 2,
        )
    }
    order.forEach((m, i) => centres.set(m.id, c[i]))
}

function largestRow(rows: Row[]): Row {
    let anchor = rows[0]
    for (const r of rows) if (r.members.length > anchor.members.length) anchor = r
    return anchor
}

function placeAll(
    layout: Layout,
    orders: Map<Row, Node[]>,
    anchor: Row = largestRow(layout.rows),
): Map<string, number> {
    const centres = new Map<string, number>()
    const { rows, only } = layout
    resetBounds(layout)
    layout.alignGap = MIN_GAP
    if (only) {
        for (const r of rows) {
            if (r.members.some((m) => only.has(m.id))) continue
            for (const m of r.members) centres.set(m.id, cx(m.orig))
        }
        for (const r of rows) {
            if (!r.members.some((m) => only.has(m.id))) continue
            const kept = r.members.filter((m) => !only.has(m.id)).sort((a, b) => a.orig.x - b.orig.x)
            const gaps = kept.slice(1).map((m, i) => m.orig.x - (kept[i].orig.x + kept[i].orig.w))
            layout.alignGap = gaps.length
                ? Math.max(GRID, Math.min(MIN_GAP, snap(median(gaps))))
                : MIN_GAP
            placeAligned(layout, r, orders.get(r)!, centres)
        }
        return centres
    }
    const anchorOrder = orders.get(anchor)!
    placeEven(layout, anchor, anchorOrder, centres)
    const first = anchorOrder[0]
    const last = anchorOrder[anchorOrder.length - 1]
    widenStack(
        layout,
        anchor.region,
        centres.get(first.id)! - first.box.w / 2,
        centres.get(last.id)! + last.box.w / 2,
    )
    // Rows lining up with the anchor may pack as tightly as it does.
    let anchorGap = MIN_GAP
    for (let i = 1; i < anchorOrder.length; i++) {
        const a = anchorOrder[i - 1]
        const b = anchorOrder[i]
        const g = centres.get(b.id)! - b.box.w / 2 - (centres.get(a.id)! + a.box.w / 2)
        anchorGap = Math.min(anchorGap, g)
    }
    layout.alignGap = Math.max(GRID, anchorGap)
    const rest = rows
        .filter((r) => r !== anchor)
        .sort(
            (a, b) =>
                Math.abs(a.index - anchor.index) - Math.abs(b.index - anchor.index) ||
                a.index - b.index,
        )
    for (const r of rest) placeAligned(layout, r, orders.get(r)!, centres)
    return centres
}

/**
 * Where a vertical line can join two boxes stacked one over the other: at
 * the centres when they line up, otherwise anywhere both boxes share at
 * least OVERLAP_MIN of width, as close to the two centres as that allows.
 * Null when they do not overlap enough and the edge needs a jog.
 */
function sharedColumn(a: number, aw: number, b: number, bw: number): number | null {
    if (Math.abs(a - b) < 1) return a
    const left = Math.max(a - aw / 2, b - bw / 2) + OVERLAP_MIN / 2
    const right = Math.min(a + aw / 2, b + bw / 2) - OVERLAP_MIN / 2
    if (right < left) return null
    return snap(Math.min(right, Math.max(left, (a + b) / 2)))
}

function layoutCost(layout: Layout, centres: Map<string, number>, edges: Edge[]): number {
    let bends = 0
    let drift = 0
    const spans: { a: number; b: number; ra: number; rb: number }[] = []
    for (const e of edges) {
        const rs = layout.rowOf.get(e.source)!
        const rt = layout.rowOf.get(e.target)!
        if (rs === rt) continue
        const a = centres.get(e.source)!
        const b = centres.get(e.target)!
        const aw = layout.nodes.get(e.source)!.box.w
        const bw = layout.nodes.get(e.target)!.box.w
        if (sharedColumn(a, aw, b, bw) === null) bends++
        else if (Math.abs(a - b) >= 1) bends += 0.25
        drift += Math.abs(a - b)
        spans.push(rs.index < rt.index ? { a, b, ra: rs.index, rb: rt.index } : { a: b, b: a, ra: rt.index, rb: rs.index })
    }
    let crossings = 0
    for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
            const p = spans[i]
            const q = spans[j]
            if (p.ra !== q.ra || p.rb !== q.rb) continue
            if ((p.a - q.a) * (p.b - q.b) < 0) crossings++
        }
    }
    // A layout that lines everything up by doubling the diagram's width is
    // not tidier; every 100px of growth costs as much as a bend.
    let left = Infinity
    let right = -Infinity
    let origLeft = Infinity
    let origRight = -Infinity
    for (const n of layout.nodes.values()) {
        const c = centres.get(n.id)
        if (c === undefined) continue
        left = Math.min(left, c - n.box.w / 2)
        right = Math.max(right, c + n.box.w / 2)
        origLeft = Math.min(origLeft, n.orig.x)
        origRight = Math.max(origRight, n.orig.x + n.orig.w)
    }
    const growth = Math.max(0, right - left - (origRight - origLeft))
    return crossings * 3 + bends + growth / 100 + drift / 10000
}

function sweep(layout: Layout, orders: Map<Row, Node[]>, downward: boolean): Map<Row, Node[]> {
    const next = new Map(orders)
    const rows = downward ? layout.rows : [...layout.rows].reverse()
    for (const row of rows.slice(1)) {
        if (row.locked || row.members.length < 2) continue
        const centres = placeAll(layout, next)
        const from = (id: string) => {
            const r = layout.rowOf.get(id)!
            return downward ? r.index < row.index : r.index > row.index
        }
        const keyed = next.get(row)!.map((m, i) => {
            const ns = (layout.neighbours.get(m.id) || []).filter(from)
            const key = ns.length
                ? ns.reduce((a, id) => a + centres.get(id)!, 0) / ns.length
                : centres.get(m.id)!
            return { m, key, i }
        })
        keyed.sort((a, b) => a.key - b.key || a.i - b.i)
        next.set(
            row,
            keyed.map((k) => k.m),
        )
    }
    return next
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export interface Route {
    exit: Point
    entry: Point
    points: Point[]
}

function routeEdges(
    layout: Layout,
    edges: Edge[],
    boxes: Map<string, Box>,
    containerBoxes: Map<string, Box>,
    touched: (e: Edge) => boolean,
): { routes: Map<string, Route>; straight: number } {
    const routes = new Map<string, Route>()
    let straight = 0
    const leafBoxes = [...boxes.entries()]
    const lanes = new Map<number, { left: number; right: number; offset: number }[]>()

    const blocked = (poly: [number, number][], skip: Set<string>) => {
        for (const [id, b] of leafBoxes) {
            if (skip.has(id)) continue
            for (let i = 1; i < poly.length; i++) {
                if (segmentHitsBox(poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1], b)) return true
            }
        }
        return false
    }

    for (const e of edges) {
        if (!isOrthogonal(e.style) || !touched(e)) continue
        const s = boxes.get(e.source)!
        const t = boxes.get(e.target)!
        const rs = layout.rowOf.get(e.source)!
        const rt = layout.rowOf.get(e.target)!
        const skip = new Set([e.source, e.target])

        if (rs === rt) {
            const order = [...rs.members].sort((a, b) => cx(boxes.get(a.id)!) - cx(boxes.get(b.id)!))
            const i = order.findIndex((m) => m.id === e.source)
            const j = order.findIndex((m) => m.id === e.target)
            if (Math.abs(i - j) !== 1 || Math.abs(cy(s) - cy(t)) >= 1) continue
            const right = cx(t) > cx(s)
            routes.set(e.id, { exit: [right ? 1 : 0, 0.5], entry: [right ? 0 : 1, 0.5], points: [] })
            straight++
            continue
        }

        const down = cy(t) > cy(s)
        const sx = cx(s)
        const tx = cx(t)
        const sy = down ? s.y + s.h : s.y
        const ty = down ? t.y : t.y + t.h
        const exit: [number, number] = [0.5, down ? 1 : 0]
        const entry: [number, number] = [0.5, down ? 0 : 1]

        const column = sharedColumn(sx, s.w, tx, t.w)
        if (column !== null && !blocked([[column, sy], [column, ty]], skip)) {
            const at = (b: Box) => (column - b.x) / b.w
            routes.set(e.id, {
                exit: [at(s), exit[1]],
                entry: [at(t), entry[1]],
                points: [],
            })
            straight++
            continue
        }

        const upper = down ? rs : rt
        const lower = down ? rt : rs
        const upperBottom = down ? sy : ty
        const lowerTop = down ? ty : sy
        let runY = (upperBottom + lowerTop) / 2
        const ru = containerBoxes.get(upper.region)
        const rl = containerBoxes.get(lower.region)
        if (ru && rl && upper.region !== lower.region) {
            const gapTop = ru.y + ru.h
            const gapBottom = rl.y
            if (gapTop <= gapBottom && gapTop >= upperBottom && gapBottom <= lowerTop) {
                runY = (gapTop + gapBottom) / 2
            }
        }
        runY = Math.round(runY)
        const left = Math.min(sx, tx)
        const right = Math.max(sx, tx)
        const taken = lanes.get(runY) || []
        let offset = 0
        for (let k = 1; taken.some((l) => l.offset === offset && l.left < right && left < l.right); k++) {
            offset = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * LANE_STEP
        }
        const y = runY + offset
        const poly: [number, number][] = [[sx, sy], [sx, y], [tx, y], [tx, ty]]
        if (blocked(poly, skip)) continue
        taken.push({ left, right, offset })
        lanes.set(runY, taken)
        routes.set(e.id, { exit, entry, points: [[sx, y], [tx, y]] })
    }
    return { routes, straight }
}

// ---------------------------------------------------------------------------
// Grid mode
// ---------------------------------------------------------------------------

/**
 * Some flows turn corners: a pipeline runs right along one lane, drops into
 * the next and snakes back. There is no single direction to layer along, yet
 * the model still drew columns and rows — it put the retrieval step under the
 * chunking step on purpose. Grid mode recovers both, spaces them evenly,
 * packs each container tight around what it holds with its title on top,
 * stacks containers without overlap, and routes every edge as the simplest
 * straight, L or Z line that hits no box.
 *
 * Returns undefined when the diagram is not a grid, so the caller can try
 * something else.
 */
const GRID_GAP_MIN = 40

type Side = "L" | "R" | "T" | "B"
export type Point = [number, number]
export type Routing = Route | { auto: true }

export interface Pad {
    l: number
    r: number
    t: number
    b: number
}

interface Title {
    v: Vertex
    side: "top" | "left"
    align: "left" | "center" | "right"
}

function sameBox(a: Box, b: Box): boolean {
    return (
        Math.abs(a.x - b.x) < 0.01 &&
        Math.abs(a.y - b.y) < 0.01 &&
        Math.abs(a.w - b.w) < 0.01 &&
        Math.abs(a.h - b.h) < 0.01
    )
}

export function overlapsBox(a: Box, b: Box): boolean {
    return a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1
}

/** Group values whose key lies within tolerance of the group's first member. */
function chain<T>(items: T[], key: (t: T) => number, tol: (a: T, b: T) => number): T[][] {
    const groups: T[][] = []
    for (const it of [...items].sort((a, b) => key(a) - key(b))) {
        const g = groups[groups.length - 1]
        if (g && Math.abs(key(it) - key(g[0])) <= tol(g[0], it)) g.push(it)
        else groups.push([it])
    }
    return groups
}

/** One gap for the whole grid, from the gaps the model drew. */
function gapFrom(gaps: number[], fallback: number): number {
    const positive = gaps.filter((g) => g > 0)
    const g = positive.length ? snap(median(positive)) : fallback
    return Math.max(GRID_GAP_MIN, Math.min(MAX_GAP, g))
}

export function containerPad(c: Vertex): Pad {
    const swimlane = styleHas(c.style, "swimlane")
    const header = swimlane ? Number(styleValue(c.style, "startSize") ?? 23) || 23 : 0
    const horizontalHeader = styleValue(c.style, "horizontal") !== "0"
    const base = styleHas(c.style, "group") ? 0 : 20
    return {
        l: base + (swimlane && !horizontalHeader ? header : 0),
        r: base,
        t: swimlane && horizontalHeader ? header + 10 : base,
        b: base,
    }
}

/** Height of a swimlane's own header band, 0 for other containers. */
export function headerOf(c: Vertex): number {
    if (!styleHas(c.style, "swimlane") || styleValue(c.style, "horizontal") === "0") return 0
    return Number(styleValue(c.style, "startSize") ?? 23) || 23
}

function tidyGrid(model: Model, xml: string, only: Set<string> | null): TidyResult | null | undefined {
    const fail = (reason: string): TidyResult => ({
        xml,
        report: { applied: false, reason, moved: 0, straightened: 0 },
    })

    // Free text with no edges is a title or a note, not part of the grid.
    const linked = new Set<string>()
    for (const c of model.cells) {
        if (c.attrs.edge !== "1") continue
        linked.add(c.attrs.source || "")
        linked.add(c.attrs.target || "")
    }
    const labels = model.leaves.filter((v) => styleHas(v.style, "text") && !linked.has(v.id))
    const labelIds = new Set(labels.map((v) => v.id))
    const leaves = model.leaves.filter((v) => !labelIds.has(v.id))
    if (leaves.length < 4) return undefined

    const cols = chain(
        leaves,
        (v) => cx(v.abs),
        (a, b) => Math.max(12, 0.25 * Math.min(a.abs.w, b.abs.w)),
    )
    const rows: Vertex[][] = []
    const rowRegion: string[] = []
    const byRegion = new Map<string, Vertex[]>()
    for (const v of leaves) byRegion.set(v.region, [...(byRegion.get(v.region) || []), v])
    for (const [region, list] of byRegion) {
        const tol = (a: Vertex, b: Vertex) => Math.max(12, 0.3 * Math.min(a.abs.h, b.abs.h))
        for (const r of chain(list, (v) => cy(v.abs), tol)) {
            rows.push(r)
            rowRegion.push(region)
        }
    }
    const colOf = new Map<string, number>()
    const rowOf = new Map<string, number>()
    cols.forEach((list, i) => list.forEach((v) => colOf.set(v.id, i)))
    rows.forEach((list, i) => list.forEach((v) => rowOf.set(v.id, i)))

    // A grid has far fewer rows and columns than boxes, puts one box in a
    // cell, and most of its edges run along a row or down a column.
    if (rows.length + cols.length > 1.5 * leaves.length) return undefined
    const along = model.edges.filter(
        (e) => rowOf.get(e.source) === rowOf.get(e.target) || colOf.get(e.source) === colOf.get(e.target),
    ).length
    if (along < 0.4 * model.edges.length) return undefined
    if (!only) {
        const seen = new Set<string>()
        for (const v of leaves) {
            const cell = `${rowOf.get(v.id)}:${colOf.get(v.id)}`
            if (seen.has(cell)) return undefined
            seen.add(cell)
        }
    }

    const affected = (v: Vertex) => !only || only.has(v.id)
    if (only && !leaves.some(affected)) return null

    // Sizes: one width per column and one height per row where they are
    // already close, then onto the size step.
    const size = new Map(leaves.map((v) => [v.id, { w: v.abs.w, h: v.abs.h }]))
    const unify = (list: Vertex[], key: "w" | "h", floor: number) => {
        const free = list.filter((v) => !v.fixedSize)
        if (free.length < 2) return
        const values = free.map((v) => size.get(v.id)![key])
        const max = Math.max(...values)
        if (max - Math.min(...values) <= Math.max(floor, 0.15 * max)) {
            for (const v of free) size.get(v.id)![key] = max
        }
    }
    if (!only) {
        for (const list of cols) unify(list, "w", SIZE_STEP)
        for (const list of rows) unify(list, "h", SIZE_STEP / 2)
        for (const v of leaves) {
            if (v.fixedSize) continue
            const s = size.get(v.id)!
            s.w = ceilTo(s.w, SIZE_STEP)
            s.h = ceilTo(s.h, SIZE_STEP)
        }
    } else {
        // A box an edit added takes the size its column and row already use.
        const peerSize = (peers: Vertex[], key: "w" | "h", own: number) => {
            const values = peers.filter((o) => !affected(o) && !o.fixedSize).map((o) => o.abs[key])
            const uniform = values.length > 0 && values.every((x) => x === values[0])
            return uniform && Math.abs(values[0] - own) <= 0.25 * values[0] ? values[0] : ceilTo(own, SIZE_STEP)
        }
        for (const v of leaves) {
            if (!affected(v) || v.fixedSize) continue
            const s = size.get(v.id)!
            s.w = peerSize(cols[colOf.get(v.id)!], "w", s.w)
            s.h = peerSize(rows[rowOf.get(v.id)!], "h", s.h)
        }
    }

    const box = new Map<string, Box>()
    const cbox = new Map<string, Box>()
    const lbox = new Map<string, Box>()
    let colGap = GRID_GAP_MIN
    let rowGap = GRID_GAP_MIN
    const rowH = rows.map((list) => Math.max(...list.map((v) => size.get(v.id)!.h)))

    if (only) {
        // Edit: the touched boxes join the column and row lines already
        // there; nothing else moves, containers only grow.
        for (const v of leaves) {
            if (!affected(v)) {
                box.set(v.id, { ...v.abs })
                continue
            }
            const s = size.get(v.id)!
            const colPeers = cols[colOf.get(v.id)!].filter((o) => !affected(o))
            const rowPeers = rows[rowOf.get(v.id)!].filter((o) => !affected(o))
            const c = colPeers.length ? median(colPeers.map((o) => cx(o.abs))) : snap(cx(v.abs))
            const m = rowPeers.length ? median(rowPeers.map((o) => cy(o.abs))) : snap(cy(v.abs))
            box.set(v.id, { x: c - s.w / 2, y: m - s.h / 2, w: s.w, h: s.h })
        }
        for (const c of [...model.containers].sort((a, b) => b.depth - a.depth)) {
            const pad = containerPad(c)
            const kids = [
                ...leaves.filter((v) => v.region === c.id).map((v) => box.get(v.id)!),
                ...model.containers.filter((o) => o.region === c.id).map((o) => cbox.get(o.id)!),
            ]
            const b = { ...c.abs }
            if (kids.length) {
                const left = Math.min(b.x, ...kids.map((k) => k.x - pad.l))
                const top = Math.min(b.y, ...kids.map((k) => k.y - pad.t))
                const right = Math.max(b.x + b.w, ...kids.map((k) => k.x + k.w + pad.r))
                const bottom = Math.max(b.y + b.h, ...kids.map((k) => k.y + k.h + pad.b))
                if (left < b.x || top < b.y || right > b.x + b.w || bottom > b.y + b.h) {
                    b.x = Math.floor(left / GRID) * GRID
                    b.y = Math.floor(top / GRID) * GRID
                    b.w = ceilTo(right, GRID) - b.x
                    b.h = ceilTo(bottom, GRID) - b.y
                }
            }
            cbox.set(c.id, b)
        }
        for (const l of labels) lbox.set(l.id, { ...l.abs })
    } else {
        // Columns: centred on the line the model meant, one gap between
        // neighbours unless the model clearly left room on purpose.
        const colW = cols.map((list) => Math.max(...list.map((v) => size.get(v.id)!.w)))
        const colC0 = cols.map((list) => median(list.map((v) => cx(v.abs))))
        const colGaps = colC0.slice(1).map((c, i) => c - colC0[i] - (colW[i] + colW[i + 1]) / 2)
        colGap = gapFrom(colGaps, GRID_GAP_MIN)
        const colC = [snap(colC0[0])]
        for (let i = 1; i < cols.length; i++) {
            const g = colGaps[i - 1] > 2 * colGap + 20 ? snap(colGaps[i - 1]) : colGap
            colC.push(ceilTo(colC[i - 1] + (colW[i - 1] + colW[i]) / 2 + g, GRID))
        }
        for (const v of leaves) {
            const s = size.get(v.id)!
            box.set(v.id, { x: colC[colOf.get(v.id)!] - s.w / 2, y: 0, w: s.w, h: s.h })
        }
        const span = (bs: Box[]) => Math.max(...bs.map((b) => b.x + b.w)) - Math.min(...bs.map((b) => b.x))
        if (span([...box.values()]) > 1.5 * span(leaves.map((v) => v.abs)) + 100) return undefined

        const rowGaps: number[] = []
        for (let i = 1; i < rows.length; i++) {
            if (rowRegion[i] !== rowRegion[i - 1]) continue
            const a = median(rows[i - 1].map((v) => cy(v.abs)))
            const b = median(rows[i].map((v) => cy(v.abs)))
            rowGaps.push(b - a - (rowH[i - 1] + rowH[i]) / 2)
        }
        rowGap = gapFrom(rowGaps, colGap)

        // Container padding, with room for a title the model floated
        // somewhere inside it.
        const pads = new Map<string, Pad>()
        const titles = new Map<string, Title>()
        for (const c of model.containers) {
            const pad = containerPad(c)
            const label = labels.filter((l) => l.region === c.id).sort((a, b) => a.abs.y - b.abs.y)[0]
            if (label) {
                const inside = leaves.filter((v) => v.region === c.id)
                const onLeft =
                    inside.length > 0 &&
                    label.abs.x + label.abs.w <= Math.min(...inside.map((v) => v.abs.x)) + 2 &&
                    !inside.every((v) => v.abs.y >= label.abs.y + label.abs.h)
                if (onLeft) {
                    pad.l = Math.max(pad.l, ceilTo(10 + label.abs.w + 20, GRID))
                    titles.set(c.id, { v: label, side: "left", align: "left" })
                } else {
                    const rel = (cx(label.abs) - c.abs.x) / c.abs.w
                    pad.t = headerOf(c) + ceilTo(10 + label.abs.h + 10, GRID)
                    titles.set(c.id, {
                        v: label,
                        side: "top",
                        align: rel < 0.35 ? "left" : rel > 0.65 ? "right" : "center",
                    })
                }
            }
            pads.set(c.id, pad)
        }

        // Container widths, innermost first; stacked siblings share one.
        const hasKids = new Set<string>()
        const depths = [...new Set(model.containers.map((c) => c.depth))].sort((a, b) => b - a)
        for (const d of depths) {
            const level = model.containers.filter((c) => c.depth === d)
            for (const c of level) {
                const pad = pads.get(c.id)!
                const kids = [
                    ...leaves.filter((v) => v.region === c.id).map((v) => box.get(v.id)!),
                    ...model.containers.filter((o) => o.region === c.id).map((o) => cbox.get(o.id)!),
                ]
                if (!kids.length) {
                    cbox.set(c.id, { ...c.abs })
                    continue
                }
                hasKids.add(c.id)
                let left = Math.min(...kids.map((b) => b.x)) - pad.l
                let right = Math.max(...kids.map((b) => b.x + b.w)) + pad.r
                const t = titles.get(c.id)
                if (t?.side === "top" && right - left < t.v.abs.w + 40) {
                    const grow = (t.v.abs.w + 40 - (right - left)) / 2
                    left -= grow
                    right += grow
                }
                const x = Math.floor(left / GRID) * GRID
                cbox.set(c.id, { x, y: c.abs.y, w: ceilTo(right, GRID) - x, h: c.abs.h })
            }
            for (const c of level) {
                const stack = level.filter(
                    (o) =>
                        o.region === c.region &&
                        Math.abs(o.abs.x - c.abs.x) <= 5 &&
                        Math.abs(o.abs.w - c.abs.w) <= 5,
                )
                if (stack.length < 2) continue
                const left = Math.min(...stack.map((o) => cbox.get(o.id)!.x))
                const right = Math.max(...stack.map((o) => cbox.get(o.id)!.x + cbox.get(o.id)!.w))
                for (const o of stack) {
                    const b = cbox.get(o.id)!
                    b.x = left
                    b.w = right - left
                }
            }
        }

        // Heights, top down: rows follow each other at one gap, containers
        // fit what they hold and push down whatever they would overlap.
        type Item = { top: number; bottom: number; row?: Vertex[]; h?: number; c?: Vertex }
        const layoutRegion = (region: string, innerTop: number | null): number | null => {
            const items: Item[] = []
            rows.forEach((r, i) => {
                if (rowRegion[i] !== region) return
                items.push({
                    top: Math.min(...r.map((v) => v.abs.y)),
                    bottom: Math.max(...r.map((v) => v.abs.y + v.abs.h)),
                    row: r,
                    h: rowH[i],
                })
            })
            for (const c of model.containers) {
                if (c.region === region) items.push({ top: c.abs.y, bottom: c.abs.y + c.abs.h, c })
            }
            items.sort((a, b) => a.top - b.top)
            const placed: { left: number; right: number; bottom: number; origBottom: number; row: boolean }[] = []
            for (const it of items) {
                let left: number
                let right: number
                if (it.row) {
                    const bs = it.row.map((v) => box.get(v.id)!)
                    left = Math.min(...bs.map((b) => b.x))
                    right = Math.max(...bs.map((b) => b.x + b.w))
                } else {
                    const b = cbox.get(it.c!.id)!
                    left = b.x
                    right = b.x + b.w
                }
                let y: number | null = null
                for (const p of placed) {
                    const rowsBoth = p.row && !!it.row
                    if (!rowsBoth && !(left < p.right && p.left < right)) continue
                    const was = it.top - p.origBottom
                    const gap = rowsBoth ? rowGap : was >= 0 ? Math.min(snap(was), MAX_GAP) : MIN_GAP
                    y = Math.max(y ?? -Infinity, p.bottom + gap)
                }
                if (y === null) y = innerTop ?? snap(it.top)
                let bottom: number
                if (it.row) {
                    for (const v of it.row) {
                        const b = box.get(v.id)!
                        b.y = y + (it.h! - b.h) / 2
                    }
                    bottom = y + it.h!
                } else {
                    const c = it.c!
                    const b = cbox.get(c.id)!
                    b.y = y
                    if (hasKids.has(c.id)) {
                        const pad = pads.get(c.id)!
                        const content = layoutRegion(c.id, y + pad.t)
                        let h = ceilTo((content ?? y + pad.t) + pad.b, GRID) - y
                        const t = titles.get(c.id)
                        if (t?.side === "left") h = Math.max(h, ceilTo(t.v.abs.h + 20, GRID))
                        b.h = h
                    }
                    bottom = y + b.h
                }
                placed.push({ left, right, bottom, origBottom: it.bottom, row: !!it.row })
            }
            return placed.length ? Math.max(...placed.map((p) => p.bottom)) : null
        }
        layoutRegion("", null)

        for (const [id, t] of titles) {
            const c = cbox.get(id)!
            const l = t.v.abs
            if (t.side === "left") {
                lbox.set(t.v.id, { x: c.x + 10, y: c.y + (c.h - l.h) / 2, w: l.w, h: l.h })
                continue
            }
            const header = headerOf(model.vertices.get(id)!)
            const band = pads.get(id)!.t - header
            const x =
                t.align === "left" ? c.x + 20 : t.align === "right" ? c.x + c.w - 20 - l.w : c.x + (c.w - l.w) / 2
            lbox.set(t.v.id, { x, y: c.y + header + (band - l.h) / 2, w: l.w, h: l.h })
        }

        // The page title keeps its place over the drawing; other notes
        // follow the box they sit next to.
        const bounds = (bs: Box[]) => ({
            l: Math.min(...bs.map((b) => b.x)),
            t: Math.min(...bs.map((b) => b.y)),
            r: Math.max(...bs.map((b) => b.x + b.w)),
        })
        const nb = bounds([...box.values(), ...cbox.values()])
        const ob = bounds([...leaves.map((v) => v.abs), ...model.containers.map((c) => c.abs)])
        for (const l of labels) {
            if (lbox.has(l.id)) continue
            const a = l.abs
            if (l.region === "" && a.y + a.h <= ob.t + 5) {
                const centred = Math.abs(cx(a) - (ob.l + ob.r) / 2) <= 0.1 * (ob.r - ob.l)
                const x = centred ? (nb.l + nb.r) / 2 - a.w / 2 : a.x + nb.l - ob.l
                lbox.set(l.id, { x, y: a.y + nb.t - ob.t, w: a.w, h: a.h })
                continue
            }
            let nearest = leaves[0]
            const dist = (v: Vertex) => Math.hypot(cx(v.abs) - cx(a), cy(v.abs) - cy(a))
            for (const v of leaves) if (dist(v) < dist(nearest)) nearest = v
            const n = box.get(nearest.id)!
            lbox.set(l.id, { ...a, x: a.x + cx(n) - cx(nearest.abs), y: a.y + cy(n) - cy(nearest.abs) })
        }

        // Keep the drawing's corner where it was on the canvas.
        const all = [...box.values(), ...cbox.values(), ...lbox.values()]
        const before = [...model.leaves.map((v) => v.abs), ...model.containers.map((c) => c.abs)]
        const dx = snap(Math.min(...before.map((b) => b.x)) - Math.min(...all.map((b) => b.x)))
        const dy = snap(Math.min(...before.map((b) => b.y)) - Math.min(...all.map((b) => b.y)))
        for (const b of all) {
            b.x += dx
            b.y += dy
        }
    }

    // Never hand back boxes on top of each other that the model kept apart.
    const placedBox = (v: Vertex) => box.get(v.id) ?? lbox.get(v.id) ?? cbox.get(v.id)!
    const shapes = [...leaves, ...labels]
    for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
            const a = shapes[i]
            const b = shapes[j]
            if (overlapsBox(placedBox(a), placedBox(b)) && !overlapsBox(a.abs, b.abs)) {
                return fail("tidying would overlap boxes")
            }
        }
    }
    const within = (v: Vertex, c: Vertex) => {
        for (let r = v.region, n = 0; r && n < 20; r = model.vertices.get(r)?.region || "", n++) {
            if (r === c.id) return true
        }
        return false
    }
    for (const c of model.containers) {
        for (const v of [...shapes, ...model.containers]) {
            if (v === c || within(v, c) || within(c, v)) continue
            if (overlapsBox(placedBox(v), cbox.get(c.id)!) && !overlapsBox(v.abs, c.abs)) {
                return fail("tidying would overlap a container")
            }
        }
    }

    const touched = (e: Edge) => !only || only.has(e.source) || only.has(e.target)
    const { routes, straight } = routeGrid(
        model.edges.filter((e) => isOrthogonal(e.style) && touched(e)),
        box,
        new Map([...box, ...lbox]),
        [...cbox.values()],
        rowGap,
        colGap,
    )

    const newAbs = new Map<string, Box>()
    for (const v of model.vertices.values()) {
        newAbs.set(v.id, box.get(v.id) ?? cbox.get(v.id) ?? lbox.get(v.id) ?? v.abs)
    }
    const out = emit(model, xml, newAbs, routes)
    if (!out) return null
    return { xml: out.xml, report: { applied: true, direction: "grid", moved: out.moved, straightened: straight } }
}

interface Candidate {
    cost: number
    sides: [Side, Side]
    poly: Point[]
}

/**
 * Every simple way to join two boxes with horizontal and vertical lines:
 * straight, one bend (L), two bends through the gap between them (Z), or a
 * detour round the outside (U).
 */
function candidates(
    S: Box,
    T: Box,
    gapBetween: (upper: Box, lower: Box) => number,
    rowGap: number,
    colGap: number,
): Candidate[] {
    const out: Candidate[] = []
    const right = cx(T) > cx(S)
    const down = cy(T) > cy(S)
    const sx = right ? S.x + S.w : S.x
    const tx = right ? T.x : T.x + T.w
    const sy = down ? S.y + S.h : S.y
    const ty = down ? T.y : T.y + T.h
    const hSep = right ? T.x >= S.x + S.w + 10 : S.x >= T.x + T.w + 10
    const vSep = down ? T.y >= S.y + S.h + 10 : S.y >= T.y + T.h + 10
    const hSides: [Side, Side] = right ? ["R", "L"] : ["L", "R"]
    const vSides: [Side, Side] = down ? ["B", "T"] : ["T", "B"]
    const outside = (v: number, lo: number, hi: number) => v <= lo - 10 || v >= hi + 10

    if (hSep) {
        const y = sharedColumn(cy(S), S.h, cy(T), T.h)
        if (y !== null) {
            out.push({ cost: Math.abs(cy(S) - cy(T)) < 1 ? 0 : 0.2, sides: hSides, poly: [[sx, y], [tx, y]] })
        }
    }
    if (vSep) {
        const x = sharedColumn(cx(S), S.w, cx(T), T.w)
        if (x !== null) {
            out.push({ cost: Math.abs(cx(S) - cx(T)) < 1 ? 0 : 0.2, sides: vSides, poly: [[x, sy], [x, ty]] })
        }
    }
    if (outside(cx(T), S.x, S.x + S.w) && outside(cy(S), T.y, T.y + T.h)) {
        out.push({ cost: 1, sides: [hSides[0], vSides[1]], poly: [[sx, cy(S)], [cx(T), cy(S)], [cx(T), ty]] })
    }
    if (outside(cx(S), T.x, T.x + T.w) && outside(cy(T), S.y, S.y + S.h)) {
        out.push({ cost: 1, sides: [vSides[0], hSides[1]], poly: [[cx(S), sy], [cx(S), cy(T)], [tx, cy(T)]] })
    }
    if (vSep && Math.abs(cx(S) - cx(T)) >= 1) {
        const mid = down ? gapBetween(S, T) : gapBetween(T, S)
        ;[mid, mid - GRID, mid + GRID].forEach((y, k) => {
            if ((y - sy) * (ty - y) <= 0) return
            out.push({
                cost: 2 + k * 0.1,
                sides: vSides,
                poly: [[cx(S), sy], [cx(S), y], [cx(T), y], [cx(T), ty]],
            })
        })
    }
    if (hSep && Math.abs(cy(S) - cy(T)) >= 1) {
        const mid = snap((sx + tx) / 2)
        ;[mid, mid - GRID, mid + GRID].forEach((x, k) => {
            if ((x - sx) * (tx - x) <= 0) return
            out.push({
                cost: 2 + k * 0.1,
                sides: hSides,
                poly: [[sx, cy(S)], [x, cy(S)], [x, cy(T)], [tx, cy(T)]],
            })
        })
    }
    if (hSep && !vSep) {
        const above = Math.min(S.y, T.y) - rowGap / 2
        const below = Math.max(S.y + S.h, T.y + T.h) + rowGap / 2
        out.push({
            cost: 2.5,
            sides: ["T", "T"],
            poly: [[cx(S), S.y], [cx(S), above], [cx(T), above], [cx(T), T.y]],
        })
        out.push({
            cost: 2.6,
            sides: ["B", "B"],
            poly: [[cx(S), S.y + S.h], [cx(S), below], [cx(T), below], [cx(T), T.y + T.h]],
        })
    }
    if (vSep && !hSep) {
        const leftX = Math.min(S.x, T.x) - colGap / 2
        const rightX = Math.max(S.x + S.w, T.x + T.w) + colGap / 2
        out.push({
            cost: 2.5,
            sides: ["R", "R"],
            poly: [[S.x + S.w, cy(S)], [rightX, cy(S)], [rightX, cy(T)], [T.x + T.w, cy(T)]],
        })
        out.push({
            cost: 2.6,
            sides: ["L", "L"],
            poly: [[S.x, cy(S)], [leftX, cy(S)], [leftX, cy(T)], [T.x, cy(T)]],
        })
    }
    return out
}

/**
 * Route each edge as the cheapest candidate that crosses no box. A line that
 * would leave a side another line enters, run on top of another line, or
 * cross one costs extra, so a box does not end up with an arrow coming in
 * where another goes out. An edge with no clean route is left to draw.io.
 */
function routeGrid(
    edges: Edge[],
    boxes: Map<string, Box>,
    obstacles: Map<string, Box>,
    containers: Box[],
    rowGap: number,
    colGap: number,
): { routes: Map<string, Routing>; straight: number } {
    const routes = new Map<string, Routing>()
    const sides = new Map<string, { in: number; out: number }>()
    const drawn: { e: Edge; a: Point; b: Point }[] = []
    let straight = 0

    const blocked = (poly: Point[], skip: Set<string>) => {
        for (const [id, b] of obstacles) {
            if (skip.has(id)) continue
            for (let i = 1; i < poly.length; i++) {
                if (segmentHitsBox(poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1], b)) return true
            }
        }
        return false
    }
    // A Z between two lanes runs in the gap between the lanes, not just
    // between the two boxes.
    const gapBetween = (upper: Box, lower: Box) => {
        let top = upper.y + upper.h
        let bottom = lower.y
        for (const c of containers) {
            const hasUpper = containsPoint(c, cx(upper), cy(upper))
            const hasLower = containsPoint(c, cx(lower), cy(lower))
            if (hasUpper && !hasLower && c.y + c.h <= lower.y) top = Math.max(top, c.y + c.h)
            if (hasLower && !hasUpper && c.y >= upper.y + upper.h) bottom = Math.min(bottom, c.y)
        }
        if (top > bottom) {
            top = upper.y + upper.h
            bottom = lower.y
        }
        return snap((top + bottom) / 2)
    }
    const sideCost = (id: string, side: Side, dir: "in" | "out") => {
        const u = sides.get(`${id}:${side}`)
        if (!u) return 0
        return dir === "out" ? 1.5 * u.in + 0.3 * u.out : 1.5 * u.out + 0.3 * u.in
    }
    const lineCost = (e: Edge, poly: Point[]) => {
        let cost = 0
        for (let i = 1; i < poly.length; i++) {
            const a = poly[i - 1]
            const b = poly[i]
            const vertical = Math.abs(a[0] - b[0]) < 1
            for (const d of drawn) {
                const dVertical = Math.abs(d.a[0] - d.b[0]) < 1
                if (vertical === dVertical) {
                    const k = vertical ? 0 : 1
                    const j = vertical ? 1 : 0
                    if (Math.abs(a[k] - d.a[k]) >= 1) continue
                    const lo = Math.max(Math.min(a[j], b[j]), Math.min(d.a[j], d.b[j]))
                    const hi = Math.min(Math.max(a[j], b[j]), Math.max(d.a[j], d.b[j]))
                    if (hi - lo > 2) cost += d.e.source === e.source || d.e.target === e.target ? 0.3 : 3
                } else {
                    const [h1, h2, v1, v2] = vertical ? [d.a, d.b, a, b] : [a, b, d.a, d.b]
                    const x = v1[0]
                    const y = h1[1]
                    if (
                        x > Math.min(h1[0], h2[0]) + 1 &&
                        x < Math.max(h1[0], h2[0]) - 1 &&
                        y > Math.min(v1[1], v2[1]) + 1 &&
                        y < Math.max(v1[1], v2[1]) - 1
                    ) {
                        cost += 0.5
                    }
                }
            }
        }
        return cost
    }

    const options = new Map<string, Candidate[]>()
    for (const e of edges) {
        const skip = new Set([e.source, e.target])
        const list = candidates(boxes.get(e.source)!, boxes.get(e.target)!, gapBetween, rowGap, colGap)
        options.set(
            e.id,
            list.filter((c) => !blocked(c.poly, skip)),
        )
    }
    // Straight edges first, so the bends work round them.
    const cheapest = (e: Edge) => Math.min(Infinity, ...options.get(e.id)!.map((c) => c.cost))
    const order = [...edges].sort((a, b) => cheapest(a) - cheapest(b))
    const ratio = (b: Box, p: Point): Point => [
        Math.min(1, Math.max(0, (p[0] - b.x) / b.w)),
        Math.min(1, Math.max(0, (p[1] - b.y) / b.h)),
    ]
    const bump = (id: string, side: Side, dir: "in" | "out") => {
        const key = `${id}:${side}`
        const u = sides.get(key) || { in: 0, out: 0 }
        u[dir]++
        sides.set(key, u)
    }
    for (const e of order) {
        let best: Candidate | null = null
        let bestCost = Infinity
        for (const c of options.get(e.id)!) {
            const cost =
                c.cost +
                sideCost(e.source, c.sides[0], "out") +
                sideCost(e.target, c.sides[1], "in") +
                lineCost(e, c.poly)
            if (cost < bestCost - 1e-6) {
                best = c
                bestCost = cost
            }
        }
        if (!best) {
            routes.set(e.id, { auto: true })
            continue
        }
        bump(e.source, best.sides[0], "out")
        bump(e.target, best.sides[1], "in")
        for (let i = 1; i < best.poly.length; i++) drawn.push({ e, a: best.poly[i - 1], b: best.poly[i] })
        routes.set(e.id, {
            exit: ratio(boxes.get(e.source)!, best.poly[0]),
            entry: ratio(boxes.get(e.target)!, best.poly[best.poly.length - 1]),
            points: best.poly.slice(1, -1),
        })
        if (best.poly.length === 2) straight++
    }
    return { routes, straight }
}

// ---------------------------------------------------------------------------
// Writing back
// ---------------------------------------------------------------------------

/**
 * Rewrite the cells whose geometry or route changed, leaving every other byte
 * of the XML as it was. Boxes come in absolute and are written relative to
 * their parent; waypoints are written relative to the edge's parent.
 */
export function emit(
    model: Model,
    xml: string,
    newAbs: Map<string, Box>,
    routes: Map<string, Routing>,
): { xml: string; moved: number } | null {
    let moved = 0
    const replacements = new Map<string, string>()
    const absOf = (id: string) => newAbs.get(id) ?? model.vertices.get(id)?.abs ?? null

    for (const v of model.vertices.values()) {
        const a = absOf(v.id)!
        const parentAbs = model.vertices.has(v.parent) ? absOf(v.parent) : null
        const rel = parentAbs ? { x: a.x - parentAbs.x, y: a.y - parentAbs.y, w: a.w, h: a.h } : a
        if (sameBox(rel, readGeometry(v.cell.body)!)) continue
        if (!v.container) moved++
        const body = v.cell.body!.replace(GEOMETRY_RE, (_m, attrs: string, close: string) => {
            let next = attrs || ""
            next = setAttr(next, "x", fmt(rel.x))
            next = setAttr(next, "y", fmt(rel.y))
            next = setAttr(next, "width", fmt(rel.w))
            next = setAttr(next, "height", fmt(rel.h))
            return `<mxGeometry${next}${close}>`
        })
        replacements.set(v.id, `<mxCell${v.cell.attrText}>${body}</mxCell>`)
    }

    for (const e of model.edges) {
        const route = routes.get(e.id)
        if (!route) continue
        const ratio = (n: number) => String(Math.round(n * 10000) / 10000)
        const ends =
            "auto" in route
                ? { exitX: null, exitY: null, entryX: null, entryY: null }
                : {
                      exitX: ratio(route.exit[0]),
                      exitY: ratio(route.exit[1]),
                      entryX: ratio(route.entry[0]),
                      entryY: ratio(route.entry[1]),
                  }
        const style = setStyle(e.style, { ...ends, exitDx: null, exitDy: null, entryDx: null, entryDy: null })
        const attrText = setAttr(e.cell.attrText, "style", style)
        let body = (e.cell.body ?? '<mxGeometry relative="1" as="geometry"/>').replace(POINTS_RE, "")
        if (!("auto" in route) && route.points.length) {
            const parent = e.cell.attrs.parent || ""
            const origin = model.vertices.has(parent) ? absOf(parent) : null
            const ox = origin?.x ?? 0
            const oy = origin?.y ?? 0
            const pts = route.points.map(([x, y]) => `<mxPoint x="${fmt(x - ox)}" y="${fmt(y - oy)}"/>`).join("")
            const array = `<Array as="points">${pts}</Array>`
            body = body.replace(GEOMETRY_RE, (_m, attrs: string, close: string) =>
                close ? `<mxGeometry${attrs}>${array}</mxGeometry>` : `<mxGeometry${attrs}>${array}`,
            )
        }
        const next = `<mxCell${attrText}>${body}</mxCell>`
        if (next !== xml.slice(e.cell.start, e.cell.end)) replacements.set(e.id, next)
    }

    if (!replacements.size) return null
    let out = ""
    let cursor = 0
    for (const c of model.cells) {
        const next = replacements.get(c.id)
        if (next === undefined) continue
        out += xml.slice(cursor, c.start) + next
        cursor = c.end
    }
    out += xml.slice(cursor)
    return { xml: out, moved }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function tidyDiagramXml(xml: string, options: TidyOptions = {}): TidyResult {
    const unchanged = (reason: string): TidyResult => ({
        xml,
        report: { applied: false, reason, moved: 0, straightened: 0 },
    })
    try {
        // Each pass reads the previous one's output as its sketch, so a pass
        // can find alignments the one before it opened up. Stop once a pass
        // changes nothing; the result is then stable under another tidy.
        let current = tidy(xml, options)
        if (!current) return unchanged("nothing to tidy")
        let moved = current.report.moved
        // Later passes stay in the first pass's mode: a grid tidied once can
        // look layered to the next pass, and switching modes would undo it.
        const mode = current.report.direction
        for (let pass = 1; pass < MAX_PASSES; pass++) {
            const next = tidy(current.xml, options, mode)
            if (!next || next.xml === current.xml) break
            moved = Math.max(moved, next.report.moved)
            current = next
        }
        return { xml: current.xml, report: { ...current.report, moved } }
    } catch (error) {
        return unchanged(`error: ${error instanceof Error ? error.message : String(error)}`)
    }
}

function tidy(xml: string, options: TidyOptions, mode?: Direction): TidyResult | null {
    const model = buildModel(xml)
    const fail = (reason: string): TidyResult => ({
        xml,
        report: { applied: false, reason, moved: 0, straightened: 0 },
    })
    if (model.leaves.length < 3 || model.edges.length < 2) return fail("too few boxes or edges")
    const orthogonal = model.edges.filter((e) => isOrthogonal(e.style)).length
    if (orthogonal < 0.6 * model.edges.length) return fail("edges are not orthogonal")

    const only = options.only ? new Set(options.only) : null
    const off: DirectionScore = { ok: false, sameRow: 0 }
    const tb = !mode || mode === "TB" ? scoreDirection(model, false) : off
    const lr = !mode || mode === "LR" ? scoreDirection(model, true) : off
    let flip: boolean
    if (tb.ok && (!lr.ok || tb.sameRow <= lr.sameRow)) flip = false
    else if (tb.ok && lr.ok) flip = true
    else {
        // No single direction fits: rows of pipelines in lanes, a flow that
        // snakes back. Look for a grid before falling back to columns.
        if (!mode || mode === "grid") {
            const grid = tidyGrid(model, xml, only)
            if (grid !== undefined) return grid
        }
        if (lr.ok) flip = true
        else return fail("no rows or columns to recover")
    }

    const work = (b: Box) => (flip ? transpose(b) : b)

    // Containers, in working space, with their inner padding.
    const regions = new Map<string, Region>()
    for (const c of model.containers) {
        const swimlane = styleHas(c.style, "swimlane")
        const header = swimlane ? Number(styleValue(c.style, "startSize") ?? 23) || 23 : 0
        const horizontalHeader = styleValue(c.style, "horizontal") !== "0"
        const base = styleHas(c.style, "group") ? 0 : 20
        const real = {
            l: base + (swimlane && !horizontalHeader ? header : 0),
            r: base,
            t: (swimlane && horizontalHeader ? header + 10 : base),
            b: base,
        }
        const pad = flip ? { l: real.t, t: real.l, r: real.b, b: real.r } : real
        regions.set(c.id, { box: work(c.abs), pad })
    }

    // Leaves, resized onto the size step unless their shape forbids it.
    const nodes = new Map<string, Node>()
    for (const v of model.leaves) {
        const box = work(v.abs)
        const label = flip ? box.w : Math.min(box.w, labelWidth(v.cell.attrs.value || "", v.style))
        nodes.set(v.id, {
            id: v.id,
            region: v.region,
            box: { ...box },
            orig: box,
            fixedSize: v.fixedSize,
            minW: label,
        })
    }
    const rows = clusterRows([...nodes.values()])
    const rowOf = new Map<string, Row>()
    for (const r of rows) for (const m of r.members) rowOf.set(m.id, r)

    const affected = (r: Row) => !only || r.members.some((m) => only.has(m.id))
    if (only && !rows.some(affected)) return null

    // Sizes. Boxes in a row that are nearly one size become one size; rows
    // joined by edges whose sizes are close share one width, so a box can sit
    // squarely over the box it points at; then every size goes onto the
    // 20px step, which keeps centred boxes on the 10px grid.
    const resizable = (r: Row) => r.members.filter((m) => !m.fixedSize)
    for (const r of rows) {
        if (!affected(r)) continue
        const list = resizable(r)
        if (list.length < 2) continue
        const ws = list.map((m) => m.box.w)
        const hs = list.map((m) => m.box.h)
        const maxW = Math.max(...ws)
        const maxH = Math.max(...hs)
        if (maxW - Math.min(...ws) <= Math.max(SIZE_STEP, 0.15 * maxW)) {
            for (const m of list) m.box.w = maxW
        }
        if (maxH - Math.min(...hs) <= Math.max(SIZE_STEP / 2, 0.15 * maxH)) {
            for (const m of list) m.box.h = maxH
        }
    }
    if (!only) {
        const rowWidth = (r: Row): number | null => {
            const list = resizable(r)
            if (!list.length || list.length !== r.members.length) return null
            const w = list[0].box.w
            return list.every((m) => m.box.w === w) ? w : null
        }
        const group = new Map(rows.map((r) => [r, r]))
        const find = (r: Row): Row => (group.get(r) === r ? r : find(group.get(r)!))
        for (const e of model.edges) {
            const a = rowOf.get(e.source)!
            const b = rowOf.get(e.target)!
            const wa = rowWidth(a)
            const wb = rowWidth(b)
            if (a === b || wa === null || wb === null) continue
            if (Math.abs(wa - wb) <= 0.25 * Math.max(wa, wb)) group.set(find(a), find(b))
        }
        const groups = new Map<Row, Row[]>()
        for (const r of rows) {
            if (rowWidth(r) === null) continue
            const root = find(r)
            groups.set(root, [...(groups.get(root) || []), r])
        }
        for (const members of groups.values()) {
            if (members.length < 2) continue
            const nodesIn = members.flatMap((r) => r.members)
            const width = Math.max(
                Math.min(...members.map((r) => rowWidth(r)!)),
                ...nodesIn.map((m) => m.minW),
            )
            for (const m of nodesIn) m.box.w = width
        }
    }
    for (const r of rows) {
        if (!affected(r)) continue
        for (const m of resizable(r)) {
            m.box.w = ceilTo(m.box.w, SIZE_STEP)
            m.box.h = ceilTo(m.box.h, SIZE_STEP)
        }
    }

    const neighbours = new Map<string, string[]>()
    for (const e of model.edges) {
        if (rowOf.get(e.source) === rowOf.get(e.target)) {
            rowOf.get(e.source)!.locked = true
            continue
        }
        neighbours.set(e.source, [...(neighbours.get(e.source) || []), e.target])
        neighbours.set(e.target, [...(neighbours.get(e.target) || []), e.source])
    }

    const stacks = new Map<string, string[]>()
    for (const c of model.containers) {
        const cb = regions.get(c.id)!.box
        const members = model.containers
            .filter((o) => {
                const ob = regions.get(o.id)!.box
                return o.region === c.region && Math.abs(ob.x - cb.x) <= 5 && Math.abs(ob.w - cb.w) <= 5
            })
            .map((o) => o.id)
        stacks.set(c.id, members)
    }

    const layout: Layout = {
        rows,
        rowOf,
        nodes,
        neighbours,
        regions,
        stacks,
        only,
        bounds: new Map(),
        alignGap: MIN_GAP,
    }

    // Which row sets the spacing, and in what order each row runs: keep the
    // model's order and the fullest row unless another choice is strictly
    // better on crossings, then bends.
    let orders = new Map(rows.map((r) => [r, [...r.members]]))
    let anchor = largestRow(rows)
    if (!only) {
        const down = sweep(layout, orders, true)
        const orderChoices = [orders, down, sweep(layout, down, false)]
        const anchorChoices = [
            anchor,
            ...rows
                .filter((r) => r !== anchor && r.members.length >= 2)
                .sort((a, b) => b.members.length - a.members.length)
                .slice(0, 6),
        ]
        let bestCost = Infinity
        for (const o of orderChoices) {
            for (const a of anchorChoices) {
                const cost = layoutCost(layout, placeAll(layout, o, a), model.edges)
                if (cost < bestCost - 1e-6) {
                    bestCost = cost
                    orders = o
                    anchor = a
                }
            }
        }
    }

    const centres = placeAll(layout, orders, anchor)
    const boxes = new Map<string, Box>()
    for (const r of rows) {
        const line = snap(median(r.members.map((m) => cy(m.orig))))
        for (const m of r.members) {
            if (!affected(r)) {
                boxes.set(m.id, m.orig)
                continue
            }
            const c = centres.get(m.id)!
            boxes.set(m.id, { x: c - m.box.w / 2, y: line - m.box.h / 2, w: m.box.w, h: m.box.h })
        }
    }

    // Containers grow to hold what is now inside them; stacked ones stay flush.
    const containerBoxes = new Map<string, Box>()
    const containers = [...model.containers].sort((a, b) => b.depth - a.depth)
    for (const c of containers) {
        const region = regions.get(c.id)!
        const box = { ...region.box }
        const inside = [
            ...model.leaves.filter((v) => v.region === c.id).map((v) => boxes.get(v.id)!),
            ...model.containers.filter((o) => o.region === c.id).map((o) => containerBoxes.get(o.id)!),
        ].filter(Boolean)
        if (inside.length) {
            const left = Math.min(box.x, ...inside.map((b) => b.x - region.pad.l))
            const top = Math.min(box.y, ...inside.map((b) => b.y - region.pad.t))
            const right = Math.max(box.x + box.w, ...inside.map((b) => b.x + b.w + region.pad.r))
            const bottom = Math.max(box.y + box.h, ...inside.map((b) => b.y + b.h + region.pad.b))
            box.x = left
            box.y = top
            box.w = right - left
            box.h = bottom - top
        }
        containerBoxes.set(c.id, box)
    }
    for (const c of model.containers) {
        const stack = (stacks.get(c.id) || []).map((id) => model.vertices.get(id)!)
        if (stack.length < 2) continue
        const left = Math.min(...stack.map((o) => containerBoxes.get(o.id)!.x))
        const right = Math.max(...stack.map((o) => containerBoxes.get(o.id)!.x + containerBoxes.get(o.id)!.w))
        for (const o of stack) {
            const b = containerBoxes.get(o.id)!
            b.x = left
            b.w = right - left
        }
    }
    for (const [id, b] of containerBoxes) {
        const orig = regions.get(id)!.box
        if (b.x === orig.x && b.y === orig.y && b.w === orig.w && b.h === orig.h) continue
        const x = Math.floor(b.x / GRID) * GRID
        const y = Math.floor(b.y / GRID) * GRID
        containerBoxes.set(id, {
            x,
            y,
            w: ceilTo(b.x + b.w, GRID) - x,
            h: ceilTo(b.y + b.h, GRID) - y,
        })
    }

    // Growing containers and re-spreading rows can push the drawing off its
    // old corner; move it back so it does not jump on the canvas.
    if (!only) {
        const all = [...boxes.values(), ...containerBoxes.values()]
        const before = [...nodes.values()].map((n) => n.orig).concat([...regions.values()].map((r) => r.box))
        const dx = snap(Math.min(...before.map((b) => b.x)) - Math.min(...all.map((b) => b.x)))
        const dy = snap(Math.min(...before.map((b) => b.y)) - Math.min(...all.map((b) => b.y)))
        if (dx || dy) {
            for (const b of all) {
                b.x += dx
                b.y += dy
            }
        }
    }

    // Last line of defence: never hand back boxes sitting on each other that
    // the model had kept apart.
    const leafList = [...nodes.values()]
    const overlaps = (a: Box, b: Box) =>
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1
    for (let i = 0; i < leafList.length; i++) {
        for (let j = i + 1; j < leafList.length; j++) {
            const a = leafList[i]
            const b = leafList[j]
            if (overlaps(boxes.get(a.id)!, boxes.get(b.id)!) && !overlaps(a.orig, b.orig)) {
                return fail("tidying would overlap boxes")
            }
        }
    }

    const touchedEdge = (e: Edge) =>
        !only || [e.source, e.target].some((id) => affected(rowOf.get(id)!))
    const { routes, straight } = routeEdges(layout, model.edges, boxes, containerBoxes, touchedEdge)

    // Back to real space and into the XML.
    const real = (b: Box) => (flip ? transpose(b) : b)
    const swap = (p: Point): Point => (flip ? [p[1], p[0]] : p)
    const newAbs = new Map<string, Box>()
    for (const v of model.vertices.values()) {
        const b = boxes.get(v.id) ?? containerBoxes.get(v.id)
        newAbs.set(v.id, b ? real(b) : v.abs)
    }
    const realRoutes = new Map<string, Routing>()
    for (const [id, r] of routes) {
        realRoutes.set(id, { exit: swap(r.exit), entry: swap(r.entry), points: r.points.map(swap) })
    }
    // An edge whose ends moved but that found no clean route would keep
    // waypoints drawn for the old positions; let draw.io route it instead.
    const movedBox = (id: string) => !sameBox(newAbs.get(id)!, model.vertices.get(id)!.abs)
    for (const e of model.edges) {
        if (realRoutes.has(e.id) || !isOrthogonal(e.style) || !touchedEdge(e)) continue
        if (movedBox(e.source) || movedBox(e.target)) realRoutes.set(e.id, { auto: true })
    }

    const out = emit(model, xml, newAbs, realRoutes)
    if (!out) return null
    return {
        xml: out.xml,
        report: { applied: true, direction: flip ? "LR" : "TB", moved: out.moved, straightened: straight },
    }
}
