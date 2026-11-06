/**
 * Lay a diagram out with the Eclipse Layout Kernel (elkjs), layered in the
 * direction the diagram flows.
 *
 * The model's diagram is the input, not something to throw away. The XML
 * order of its cells and the positions it drew are passed to ELK as
 * preferences (model order, semi-interactive crossing minimisation), its
 * containers stay containers with room for their titles, and its sizes are
 * kept, only rounded onto the 20px step. ELK then decides positions and
 * orthogonal edge routes.
 *
 * Kinds whose geometry carries meaning ELK does not know about — sequence
 * diagrams, timelines, swimlanes, free illustrations — are not laid out
 * here; the caller keeps the light tidy pass for those.
 *
 * ELK is about 1.5 MB, so it is loaded on first use.
 */

import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs/lib/elk-api"
import {
    type Box,
    buildModel,
    containerPad,
    emit,
    headerOf,
    isOrthogonal,
    overlapsBox,
    type Pad,
    type Point,
    type Routing,
    styleHas,
    styleValue,
    type TidyResult,
    type Vertex,
} from "./tidy-layout"

/**
 * Only ELK's layered algorithm is used. Its tree (mrtree), radial and
 * stress algorithms were tried on the eval diagrams: they scored well
 * below layered, do not route edges, and radial hung on a diagram with
 * groups. Trees and mind maps lay out well as layered graphs.
 */
export type LayoutKind = "layered-down" | "layered-right" | "layered-up"

export const LAYOUT_KINDS: readonly LayoutKind[] = ["layered-down", "layered-right", "layered-up"]

const ALGORITHM: Record<LayoutKind, LayoutOptions> = {
    "layered-down": { "elk.algorithm": "layered", "elk.direction": "DOWN" },
    "layered-right": { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
    "layered-up": { "elk.algorithm": "layered", "elk.direction": "UP" },
}

const COMMON: LayoutOptions = {
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.spacing.nodeNode": "40",
    "elk.spacing.edgeNode": "20",
    "elk.spacing.edgeEdge": "12",
    "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    "elk.layered.spacing.edgeNodeBetweenLayers": "20",
    // Layers and back edges come from where the model drew the shapes, the
    // order within a layer from the sketch too (see bySketch). On the eval
    // diagrams this kept 92% of the drawing's left-of/above relations
    // against 82% with ELK's own layering, for the same layout score.
    "elk.layered.layering.strategy": "INTERACTIVE",
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.json.edgeCoords": "ROOT",
}

const GRID = 10
const SIZE_STEP = 20
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step
const snap = (v: number) => Math.round(v / GRID) * GRID
const cx = (b: Box) => b.x + b.w / 2
const cy = (b: Box) => b.y + b.h / 2

type Elk = { layout(graph: ElkNode): Promise<ElkNode> }
let elkPromise: Promise<Elk> | null = null
function loadElk(): Promise<Elk> {
    elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => {
        const ELK = (m as unknown as { default: new () => Elk }).default
        return new ELK()
    })
    return elkPromise
}

function unchanged(xml: string, reason: string): TidyResult {
    return { xml, report: { applied: false, reason, moved: 0, straightened: 0 } }
}

export async function elkLayoutXml(xml: string, kind: LayoutKind, extra: LayoutOptions = {}): Promise<TidyResult> {
    try {
        return await layout(xml, kind, extra)
    } catch (error) {
        return unchanged(xml, `error: ${error instanceof Error ? error.message : String(error)}`)
    }
}

async function layout(xml: string, kind: LayoutKind, extra: LayoutOptions): Promise<TidyResult> {
    const model = buildModel(xml)
    const linked = new Set<string>()
    for (const c of model.cells) {
        if (c.attrs.edge !== "1") continue
        linked.add(c.attrs.source || "")
        linked.add(c.attrs.target || "")
    }
    const labels = model.leaves.filter((v) => styleHas(v.style, "text") && !linked.has(v.id))
    const labelIds = new Set(labels.map((v) => v.id))
    const leaves = model.leaves.filter((v) => !labelIds.has(v.id))
    if (leaves.length < 2 || !model.edges.length) return unchanged(xml, "too few shapes or edges")

    // A container's title is the topmost free text inside it.
    const titles = new Map<string, Vertex>()
    for (const c of model.containers) {
        const t = labels.filter((l) => l.region === c.id).sort((a, b) => a.abs.y - b.abs.y)[0]
        if (t) titles.set(c.id, t)
    }
    const pads = new Map<string, Pad>()
    for (const c of model.containers) {
        const pad = containerPad(c)
        const t = titles.get(c.id)
        if (t) pad.t = headerOf(c) + ceilTo(10 + t.abs.h + 10, GRID)
        pads.set(c.id, pad)
    }

    const size = (v: Vertex) =>
        v.fixedSize ? { w: v.abs.w, h: v.abs.h } : { w: ceilTo(v.abs.w, SIZE_STEP), h: ceilTo(v.abs.h, SIZE_STEP) }
    // Icons and images often carry their label above or below the shape;
    // ELK has to keep that band clear too.
    const labelBand = (v: Vertex) => {
        const where = styleValue(v.style, "verticalLabelPosition")
        if (where !== "bottom" && where !== "top") return { top: 0, bottom: 0 }
        const text = (v.cell.attrs.value || "")
            .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>|\\n|&#xa;|&#10;/gi, "\n")
            .replace(/&lt;[^&]*&gt;|<[^>]+>/g, "")
        if (!text.trim()) return { top: 0, bottom: 0 }
        const band = text.split("\n").length * 16 + 8
        return where === "bottom" ? { top: 0, bottom: band } : { top: band, bottom: 0 }
    }
    const bands = new Map(leaves.map((v) => [v.id, labelBand(v)]))
    // Containers lay out their insides with the same options as the page.
    // ELK's model-order option fails (elkjs 0.10) once edges cross into
    // containers; there, positions guide the crossing minimisation instead.
    const nested = model.containers.some((c) => leaves.some((v) => v.region === c.id))
    const order: LayoutOptions = nested
        ? {
              "elk.layered.considerModelOrder.strategy": "NONE",
              "elk.layered.crossingMinimization.semiInteractive": "true",
          }
        : {}
    const options: LayoutOptions = { ...COMMON, ...ALGORITHM[kind], ...order, ...extra }
    const parentAbs = (region: string) => model.vertices.get(region)?.abs ?? { x: 0, y: 0, w: 0, h: 0 }
    const ancestors = (id: string): string[] => {
        const out: string[] = []
        for (let r = model.vertices.get(id)?.region || "", n = 0; r && n < 20; r = model.vertices.get(r)?.region || "", n++) {
            out.push(r)
        }
        return out
    }

    // The ELK graph mirrors the container tree; each edge lives in the
    // innermost container holding both its ends.
    const elkNodes = new Map<string, ElkNode>()
    const nodeFor = (v: Vertex): ElkNode => {
        const p = parentAbs(v.region)
        const node: ElkNode = { id: v.id, x: v.abs.x - p.x, y: v.abs.y - p.y }
        if (v.container) {
            const kids = [
                ...leaves.filter((o) => o.region === v.id),
                ...model.containers.filter((o) => o.region === v.id),
            ].sort(bySketch(kind))
            if (kids.length) {
                const pad = pads.get(v.id)!
                node.layoutOptions = {
                    ...options,
                    "elk.padding": `[top=${pad.t},left=${pad.l},bottom=${pad.b},right=${pad.r}]`,
                }
                node.children = kids.map(nodeFor)
                node.edges = []
            } else {
                node.width = v.abs.w
                node.height = v.abs.h
            }
        } else {
            const s = size(v)
            const band = bands.get(v.id)!
            node.width = s.w
            node.height = s.h + band.top + band.bottom
        }
        elkNodes.set(v.id, node)
        return node
    }
    const top = [...leaves.filter((v) => !v.region), ...model.containers.filter((c) => !c.region)].sort(
        bySketch(kind),
    )
    const root: ElkNode = {
        id: "__root__",
        layoutOptions: options,
        children: top.map(nodeFor),
        edges: [],
    }
    const sketch = bySketch(kind)
    const edgesInOrder = [...model.edges].sort(
        (e, f) =>
            sketch(model.vertices.get(e.source)!, model.vertices.get(f.source)!) ||
            sketch(model.vertices.get(e.target)!, model.vertices.get(f.target)!),
    )
    for (const e of edgesInOrder) {
        const a = ancestors(e.source)
        const b = new Set(ancestors(e.target))
        const home = a.find((r) => b.has(r))
        const holder = (home && elkNodes.get(home)?.edges ? elkNodes.get(home)! : root) as ElkNode
        holder.edges!.push({ id: e.id, sources: [e.source], targets: [e.target] } as ElkExtendedEdge)
    }

    const elk = await loadElk()
    const out = await elk.layout(root)

    // Absolute boxes, centres rounded so lines between aligned shapes stay
    // straight.
    const box = new Map<string, Box>()
    const cbox = new Map<string, Box>()
    const routesRaw = new Map<string, { start: Point; end: Point; bends: Point[] }>()
    const walk = (n: ElkNode, ox: number, oy: number) => {
        for (const child of n.children || []) {
            const x = ox + (child.x || 0)
            const y = oy + (child.y || 0)
            const w = child.width || 0
            const h = child.height || 0
            const v = model.vertices.get(child.id)
            if (v?.container) {
                const bx = Math.floor(x)
                const by = Math.floor(y)
                cbox.set(child.id, { x: bx, y: by, w: Math.ceil(x + w) - bx, h: Math.ceil(y + h) - by })
            } else if (v) {
                const band = bands.get(child.id) ?? { top: 0, bottom: 0 }
                const bh = h - band.top - band.bottom
                const top = y + band.top
                box.set(child.id, { x: Math.round(x + w / 2) - w / 2, y: Math.round(top + bh / 2) - bh / 2, w, h: bh })
            }
            walk(child, x, y)
        }
        for (const e of n.edges || []) {
            const s = (e as ElkExtendedEdge).sections?.[0]
            if (!s) continue
            const pt = (p: { x: number; y: number }): Point => [p.x, p.y]
            routesRaw.set(e.id, {
                start: pt(s.startPoint),
                end: pt(s.endPoint),
                bends: (s.bendPoints || []).map((p) => [Math.round(p.x), Math.round(p.y)] as Point),
            })
        }
    }
    walk(out, 0, 0)
    for (const c of model.containers) if (!cbox.has(c.id)) cbox.set(c.id, { ...c.abs })

    // Titles on top of their container; the page title over the drawing;
    // other notes follow the shape nearest to them.
    const lbox = new Map<string, Box>()
    for (const [id, t] of titles) {
        const c = cbox.get(id)!
        const header = headerOf(model.vertices.get(id)!)
        const band = pads.get(id)!.t - header
        lbox.set(t.id, { x: c.x + (c.w - t.abs.w) / 2, y: c.y + header + (band - t.abs.h) / 2, w: t.abs.w, h: t.abs.h })
    }
    const bounds = (bs: Box[]) => ({
        l: Math.min(...bs.map((b) => b.x)),
        t: Math.min(...bs.map((b) => b.y)),
        r: Math.max(...bs.map((b) => b.x + b.w)),
        b: Math.max(...bs.map((b) => b.y + b.h)),
    })
    const nb = bounds([...box.values(), ...cbox.values()])
    const ob = bounds([...leaves.map((v) => v.abs), ...model.containers.map((c) => c.abs)])
    for (const l of labels) {
        if (lbox.has(l.id)) continue
        const a = l.abs
        // Text outside the drawing (title, subtitle, legend, footer) stays
        // on its side of it, at the same distance.
        const above = a.y + a.h <= ob.t + 5
        const below = a.y >= ob.b - 5
        const left = a.x + a.w <= ob.l + 5
        const right = a.x >= ob.r - 5
        if (!l.region && (above || below || left || right)) {
            const centredX = Math.abs(cx(a) - (ob.l + ob.r) / 2) <= 0.1 * (ob.r - ob.l)
            const centredY = Math.abs(cy(a) - (ob.t + ob.b) / 2) <= 0.1 * (ob.b - ob.t)
            let x = centredX ? (nb.l + nb.r) / 2 - a.w / 2 : a.x + nb.l - ob.l
            let y = centredY ? (nb.t + nb.b) / 2 - a.h / 2 : a.y + nb.t - ob.t
            if (above) y = nb.t - (ob.t - a.y)
            else if (below) y = nb.b + (a.y - ob.b)
            if (left) x = nb.l - (ob.l - a.x)
            else if (right) x = nb.r + (a.x - ob.r)
            lbox.set(l.id, { x, y, w: a.w, h: a.h })
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

    // Never hand back shapes on top of each other.
    const shapes = [...leaves, ...labels]
    const placed = (v: Vertex) => box.get(v.id) ?? lbox.get(v.id)!
    for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
            if (overlapsBox(placed(shapes[i]), placed(shapes[j])) && !overlapsBox(shapes[i].abs, shapes[j].abs)) {
                return unchanged(xml, `layout would overlap ${shapes[i].id} and ${shapes[j].id}`)
            }
        }
    }

    const routes = new Map<string, Routing>()
    let straight = 0
    const ratio = (b: Box, p: Point): Point => [
        Math.min(1, Math.max(0, (p[0] - b.x) / b.w)),
        Math.min(1, Math.max(0, (p[1] - b.y) / b.h)),
    ]
    for (const e of model.edges) {
        const r = routesRaw.get(e.id)
        if (!isOrthogonal(e.style) || !r) {
            // Curved and straight styles draw themselves between the shapes.
            routes.set(e.id, { auto: true })
            continue
        }
        const shift = (p: Point): Point => [p[0] + dx, p[1] + dy]
        routes.set(e.id, {
            exit: ratio(box.get(e.source)!, shift(r.start)),
            entry: ratio(box.get(e.target)!, shift(r.end)),
            points: r.bends.map(shift),
        })
        if (!r.bends.length) straight++
    }

    const newAbs = new Map<string, Box>()
    for (const v of model.vertices.values()) newAbs.set(v.id, box.get(v.id) ?? cbox.get(v.id) ?? lbox.get(v.id) ?? v.abs)
    const written = emit(model, xml, newAbs, routes)
    if (!written) return unchanged(xml, "nothing to change")
    return { xml: written.xml, report: { applied: true, direction: "elk", moved: written.moved, straightened: straight } }
}

/**
 * Shapes in the order the model drew them across the flow: left to right
 * for a top-down layout, top to bottom for a left-to-right one. ELK keeps
 * this order where it can, so the layout stays close to the sketch.
 */
function bySketch(kind: LayoutKind) {
    const across = kind === "layered-right" ? (v: Vertex) => [cy(v.abs), cx(v.abs)] : (v: Vertex) => [cx(v.abs), cy(v.abs)]
    return (a: Vertex, b: Vertex) => {
        const [a1, a2] = across(a)
        const [b1, b2] = across(b)
        return Math.abs(a1 - b1) > 1 ? a1 - b1 : a2 - b2
    }
}
