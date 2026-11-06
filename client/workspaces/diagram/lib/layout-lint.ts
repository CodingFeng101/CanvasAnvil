/**
 * A layout check for any draw.io diagram, whatever kind it is.
 *
 * The rules are ones every readable diagram keeps, so they apply the same to
 * a flowchart, a mind map, an ER diagram or a network map: shapes do not sit
 * on each other, a shape stays inside the container it belongs to,
 * containers do not overlap, lines do not run through shapes, text fits its
 * shape, edges have both ends. On top of those come softer measures —
 * crossings, bends, near-misses where two connected shapes were almost
 * lined up — that make a diagram tidier but are not errors.
 *
 * Used to score generated diagrams in the evaluation, and to decide whether
 * a diagram is bad enough to send back to the model.
 *
 * Edges drawn without waypoints are routed by draw.io itself; their path is
 * approximated here the way orthogonal routing would draw it.
 */

import { type Box, type DiagramEdge, type DiagramShape, readDiagramModel } from "./tidy-layout"

export type LintRule =
    | "overlap"
    | "container-escape"
    | "container-overlap"
    | "edge-through-shape"
    | "text-overflow"
    | "dangling-edge"
    | "near-miss"

export interface LintIssue {
    rule: LintRule
    severity: "error" | "warning"
    ids: string[]
}

export interface LintMetrics {
    shapes: number
    edges: number
    crossings: number
    bends: number
}

export interface LintReport {
    issues: LintIssue[]
    metrics: LintMetrics
    /** 100 for a clean diagram, down to 0. */
    score: number
    errors: number
    warnings: number
}

type Point = [number, number]

const SEVERITY: Record<LintRule, "error" | "warning"> = {
    overlap: "error",
    "container-escape": "error",
    "container-overlap": "error",
    "edge-through-shape": "error",
    "text-overflow": "warning",
    "dangling-edge": "warning",
    "near-miss": "warning",
}

/** Points lost per issue, and the most one rule can cost. */
const PENALTY: Record<"error" | "warning", { each: number; cap: number }> = {
    error: { each: 8, cap: 40 },
    warning: { each: 2, cap: 20 },
}
const CROSSING_PENALTY = { each: 1, cap: 15 }
/** Some bends are needed; many are a sign of shapes placed off each other's lines. */
const BEND_PENALTY = { each: 0.5, cap: 10 }

const cx = (b: Box) => b.x + b.w / 2
const cy = (b: Box) => b.y + b.h / 2

/** How far two boxes overlap on each axis; positive on both means they intersect. */
function overlapOf(a: Box, b: Box): [number, number] {
    return [
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    ]
}

function containsBox(outer: Box, inner: Box, tol = 2): boolean {
    return (
        inner.x >= outer.x - tol &&
        inner.y >= outer.y - tol &&
        inner.x + inner.w <= outer.x + outer.w + tol &&
        inner.y + inner.h <= outer.y + outer.h + tol
    )
}

function styleValue(style: string, key: string): string | undefined {
    for (const entry of style.split(";")) {
        const eq = entry.indexOf("=")
        if (eq > 0 && entry.slice(0, eq).trim() === key) return entry.slice(eq + 1).trim()
    }
    return undefined
}

function isOrthogonal(style: string): boolean {
    return /orthogonalEdgeStyle|elbowEdgeStyle/i.test(styleValue(style, "edgeStyle") || "")
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#xa;": "\n", "&#10;": "\n", "&nbsp;": " " }

function labelLines(value: string): string[] {
    return String(value || "")
        .replace(/&lt;|&gt;|&amp;|&quot;|&#xa;|&#10;|&nbsp;/g, (m) => ENTITIES[m])
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(div|p|li)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
}

function textWidth(line: string, fontSize: number): number {
    let w = 0
    for (const ch of line) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.6
    return w * fontSize
}

/** Whether a shape's text needs more room than the shape has. */
function textOverflows(s: DiagramShape): boolean {
    if (s.container || s.label) return false
    // Labels placed outside the shape (icons, images) have their own room.
    if (styleValue(s.style, "verticalLabelPosition") || styleValue(s.style, "labelPosition")) return false
    const lines = labelLines(s.value)
    if (!lines.length) return false
    const fontSize = Number(styleValue(s.style, "fontSize")) || 12
    const inner = s.box.w - 8
    if (inner <= 0) return true
    const wraps = styleValue(s.style, "whiteSpace") === "wrap"
    let count = 0
    for (const line of lines) {
        const w = textWidth(line, fontSize)
        if (!wraps && w > inner + 4) return true
        count += wraps ? Math.max(1, Math.ceil(w / inner)) : 1
    }
    return count * fontSize * 1.2 > s.box.h + 2
}

/** The point on a box an edge leaves from or arrives at. */
function anchor(b: Box, ratio: Point | null, toward: Point): Point {
    if (ratio) return [b.x + ratio[0] * b.w, b.y + ratio[1] * b.h]
    // Without a pinned port the line starts on the side facing the next point.
    const dx = toward[0] - cx(b)
    const dy = toward[1] - cy(b)
    if (Math.abs(dx) * b.h >= Math.abs(dy) * b.w) return [dx >= 0 ? b.x + b.w : b.x, cy(b)]
    return [cx(b), dy >= 0 ? b.y + b.h : b.y]
}

/** Where an edge runs, from its source's border to its target's. */
export function edgePath(e: DiagramEdge, s: Box, t: Box): Point[] {
    if (e.points.length) {
        const first = e.points[0]
        const last = e.points[e.points.length - 1]
        return [anchor(s, e.exit, first), ...e.points, anchor(t, e.entry, last)]
    }
    if (!isOrthogonal(e.style)) {
        return [anchor(s, e.exit, [cx(t), cy(t)]), anchor(t, e.entry, [cx(s), cy(s)])]
    }
    // Orthogonal with no waypoints: straight where the boxes share a span,
    // otherwise one Z through the middle of the gap.
    const start = anchor(s, e.exit, [cx(t), cy(t)])
    const end = anchor(t, e.entry, [cx(s), cy(s)])
    if (Math.abs(start[0] - end[0]) < 1 || Math.abs(start[1] - end[1]) < 1) return [start, end]
    const horizontal = start[0] === s.x || start[0] === s.x + s.w
    if (horizontal) {
        const mid = (start[0] + end[0]) / 2
        return [start, [mid, start[1]], [mid, end[1]], end]
    }
    const mid = (start[1] + end[1]) / 2
    return [start, [start[0], mid], [end[0], mid], end]
}

function segmentHitsBox(a: Point, b: Point, box: Box, margin = 2): boolean {
    // Liang–Barsky clip of the segment against the shrunken box.
    const x0 = box.x + margin
    const y0 = box.y + margin
    const x1 = box.x + box.w - margin
    const y1 = box.y + box.h - margin
    if (x1 <= x0 || y1 <= y0) return false
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    let t0 = 0
    let t1 = 1
    const clip = (p: number, q: number) => {
        if (p === 0) return q >= 0
        const r = q / p
        if (p < 0) {
            if (r > t1) return false
            if (r > t0) t0 = r
        } else {
            if (r < t0) return false
            if (r < t1) t1 = r
        }
        return true
    }
    return (
        clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1]) && t0 < t1
    )
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
    const d = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const d1 = d(q1, q2, p1)
    const d2 = d(q1, q2, p2)
    const d3 = d(p1, p2, q1)
    const d4 = d(p1, p2, q2)
    return d1 * d2 < -1e-6 && d3 * d4 < -1e-6
}

export function lintDiagramXml(xml: string): LintReport {
    const { shapes, edges, danglingEdges } = readDiagramModel(xml)
    const issues: LintIssue[] = []
    const add = (rule: LintRule, ids: string[]) => issues.push({ rule, severity: SEVERITY[rule], ids })

    const all = [...shapes.values()]
    // Lines drawn as shapes (a sequence diagram's lifelines, dividers) and
    // invisible anchor points have no area: they cross other shapes and
    // groups by design and hold no text box.
    const thin = (s: DiagramShape) => s.box.w <= 2 || s.box.h <= 2 || styleValue(s.style, "shape") === "line"
    const solid = all.filter((s) => !s.container && !thin(s))
    const containers = all.filter((s) => s.container)
    const ancestors = (s: DiagramShape) => {
        const out = new Set<string>()
        for (let r = s.region, n = 0; r && n < 20; r = shapes.get(r)?.region || "", n++) out.add(r)
        return out
    }

    for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
            const a = solid[i]
            const b = solid[j]
            const [ox, oy] = overlapOf(a.box, b.box)
            if (ox > 4 && oy > 4 && !containsBox(a.box, b.box, 0) && !containsBox(b.box, a.box, 0)) {
                add("overlap", [a.id, b.id])
            }
        }
    }
    for (const s of all) {
        if (thin(s)) continue
        const region = shapes.get(s.region)
        if (region && !containsBox(region.box, s.box)) add("container-escape", [s.id, region.id])
    }
    for (let i = 0; i < containers.length; i++) {
        for (let j = i + 1; j < containers.length; j++) {
            const a = containers[i]
            const b = containers[j]
            if (ancestors(a).has(b.id) || ancestors(b).has(a.id)) continue
            const [ox, oy] = overlapOf(a.box, b.box)
            if (ox > 4 && oy > 4 && !containsBox(a.box, b.box) && !containsBox(b.box, a.box)) {
                add("container-overlap", [a.id, b.id])
            }
        }
    }
    for (const s of solid) if (textOverflows(s)) add("text-overflow", [s.id])
    for (const id of danglingEdges) add("dangling-edge", [id])

    let bends = 0
    const paths: { e: DiagramEdge; path: Point[] }[] = []
    for (const e of edges) {
        const s = shapes.get(e.source)!
        const t = shapes.get(e.target)!
        const path = edgePath(e, s.box, t.box)
        paths.push({ e, path })
        bends += path.length - 2
        const ends = new Set([e.source, e.target, ...ancestors(s), ...ancestors(t)])
        const hit = solid.find(
            (o) => !ends.has(o.id) && path.slice(1).some((p, i) => segmentHitsBox(path[i], p, o.box)),
        )
        if (hit) add("edge-through-shape", [e.id, hit.id])
        // Two connected shapes a few pixels off one line: an alignment the
        // model meant and missed, which orthogonal routing turns into a kink.
        if (isOrthogonal(e.style) && !e.points.length) {
            const dx = Math.abs(cx(s.box) - cx(t.box))
            const dy = Math.abs(cy(s.box) - cy(t.box))
            const slipX = Math.max(12, 0.2 * Math.min(s.box.w, t.box.w))
            const slipY = Math.max(12, 0.2 * Math.min(s.box.h, t.box.h))
            if ((dx > 0.5 && dx <= slipX) || (dy > 0.5 && dy <= slipY)) add("near-miss", [e.id])
        }
    }

    let crossings = 0
    for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
            const a = paths[i]
            const b = paths[j]
            const shared = [a.e.source, a.e.target].some((id) => id === b.e.source || id === b.e.target)
            if (shared) continue
            for (let p = 1; p < a.path.length; p++) {
                for (let q = 1; q < b.path.length; q++) {
                    if (segmentsCross(a.path[p - 1], a.path[p], b.path[q - 1], b.path[q])) crossings++
                }
            }
        }
    }

    let score = 100
    const perRule = new Map<LintRule, number>()
    for (const issue of issues) perRule.set(issue.rule, (perRule.get(issue.rule) || 0) + 1)
    for (const [rule, n] of perRule) {
        const p = PENALTY[SEVERITY[rule]]
        score -= Math.min(p.cap, n * p.each)
    }
    score -= Math.min(CROSSING_PENALTY.cap, crossings * CROSSING_PENALTY.each)
    score -= Math.min(BEND_PENALTY.cap, bends * BEND_PENALTY.each)

    const errors = issues.filter((i) => i.severity === "error").length
    return {
        issues,
        metrics: { shapes: solid.length, edges: edges.length, crossings, bends },
        score: Math.max(0, score),
        errors,
        warnings: issues.length - errors,
    }
}

/**
 * How much of the drawing's arrangement a layout kept: of the pairs of
 * shapes clearly apart on an axis, the share still in the same order on
 * that axis. 1 keeps every left-of and above; a layout can score well on
 * the layout check and still throw away what the model meant.
 */
export function orderKept(before: string, after: string): number {
    const a = readDiagramModel(before).shapes
    const b = readDiagramModel(after).shapes
    const ids = [...a.values()].filter((s) => !s.container && !s.label && b.has(s.id)).map((s) => s.id)
    let pairs = 0
    let kept = 0
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const p = a.get(ids[i])!.box
            const q = a.get(ids[j])!.box
            const p2 = b.get(ids[i])!.box
            const q2 = b.get(ids[j])!.box
            for (const [lo, size] of [["x", "w"], ["y", "h"]] as const) {
                const d = p[lo] + p[size] / 2 - (q[lo] + q[size] / 2)
                if (Math.abs(d) < Math.min(p[size], q[size]) / 2) continue
                const d2 = p2[lo] + p2[size] / 2 - (q2[lo] + q2[size] / 2)
                pairs++
                if (Math.sign(d) === Math.sign(d2)) kept++
            }
        }
    }
    return pairs ? kept / pairs : 1
}

/**
 * How many of the rows and columns the drawing lined up are still lined up:
 * of the pairs of shapes whose centres shared a line (within 2px), the
 * share that still do. Rows and columns are usually meant — a timeline's
 * cards, a layer of services — even where the layout check cannot tell.
 */
export function alignmentKept(before: string, after: string): number {
    const a = readDiagramModel(before).shapes
    const b = readDiagramModel(after).shapes
    const ids = [...a.values()].filter((s) => !s.container && !s.label && b.has(s.id)).map((s) => s.id)
    let pairs = 0
    let kept = 0
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const p = a.get(ids[i])!.box
            const q = a.get(ids[j])!.box
            const p2 = b.get(ids[i])!.box
            const q2 = b.get(ids[j])!.box
            for (const centre of [cx, cy]) {
                if (Math.abs(centre(p) - centre(q)) > 2) continue
                pairs++
                if (Math.abs(centre(p2) - centre(q2)) <= 2) kept++
            }
        }
    }
    return pairs ? kept / pairs : 1
}
