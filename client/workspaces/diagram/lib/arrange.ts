/**
 * Choose how to lay out a diagram the model just drew: as drawn, with the
 * light tidy pass, or with ELK, by checking each candidate with the layout
 * check and keeping the best one that stays true to the drawing.
 *
 * The model can say what kind of layout it drew (the display_diagram
 * tool's `layout`). Flows get ELK in that direction; kinds whose geometry
 * means something ELK does not know about (lanes, lifelines, time axes)
 * and free illustrations only get the tidy pass. Mind maps, and diagrams
 * that declare nothing, try every ELK direction and use the one closest to
 * the sketch.
 *
 * Nothing is ever handed back that scores below the drawing itself. Every
 * candidate comes back too (the drawing, the tidy pass, the best ELK layout,
 * even one the gates or the layout kind turned down), so the user can pick
 * another; a pass that produced nothing comes back with its reason.
 */

import { elkLayoutXml, LAYOUT_KINDS, type LayoutKind } from "./elk-layout"
import { alignmentKept, lintDiagramXml, orderKept } from "./layout-lint"
import { type TidyOptions, type TidyResult, tidyDiagramXml } from "./tidy-layout"

/** What the model can declare. "auto" and an unknown value mean it did not. */
export const DIAGRAM_LAYOUTS = [
    "flow-down",
    "flow-right",
    "flow-up",
    "tree-down",
    "tree-right",
    "mindmap",
    "swimlane",
    "sequence",
    "timeline",
    "free",
    "auto",
] as const
export type DiagramLayout = (typeof DIAGRAM_LAYOUTS)[number]

const ELK_KIND: Partial<Record<DiagramLayout, LayoutKind>> = {
    "flow-down": "layered-down",
    "flow-right": "layered-right",
    "flow-up": "layered-up",
    "tree-down": "layered-down",
    "tree-right": "layered-right",
}
// A mind map has no one direction, so like an undeclared diagram it tries
// every one; the gates below keep it only where its arrangement survives.
const TIDY_ONLY = new Set<DiagramLayout>(["swimlane", "sequence", "timeline", "free"])

/**
 * ELK must keep this much of the drawing's arrangement to be used: its
 * left-of/above relations, and the rows and columns it lined up. Without
 * these gates ELK kept about 90% of the order but only about 60% of the
 * alignment on the eval diagrams (it keeps layers in line, not the columns
 * across them), and the diagrams it broke up scored well on the layout
 * check all the same. The values were chosen on the eval's dev split as
 * the best score that keeps 90%+ of both overall, then checked on holdout.
 */
const MIN_ORDER_KEPT = 0.7
const MIN_ALIGNMENT_KEPT = 0.7
/** And beat the tidy pass by this much: a rearranged diagram has to earn it. */
const ELK_MARGIN = 2

export type LayoutMethod = "original" | "tidy" | LayoutKind

/**
 * Why a layout that was offered was not the one put on the canvas.
 * - worse: the tidy pass scored below the drawing.
 * - rearranged: ELK broke up the drawing's arrangement (the share of its
 *   left-of/above relations and of its rows and columns that survived).
 * - layout: the declared kind (swimlane, sequence, …) is never re-laid out.
 * - margin: ELK did not beat what was there by ELK_MARGIN points.
 */
export type CandidateNote =
    | { why: "worse" }
    | { why: "rearranged"; order: number; aligned: number; min: number }
    | { why: "layout" }
    | { why: "margin"; margin: number }

/** One way the diagram could be laid out, with its layout-check score. */
export interface LayoutCandidate {
    method: LayoutMethod
    xml: string
    score: number
    /** Set when this one was not chosen for a reason other than its score. */
    note?: CandidateNote
}

/** A way of laying out that produced nothing, and why (the pass's own reason). */
export interface SkippedMethod {
    method: "tidy" | "elk"
    reason: string
}

export interface ArrangeResult extends TidyResult {
    chosen: LayoutMethod
    scores: { original: number; tidy: number; elk?: number }
    /** The drawing first, then the tidy pass and the best ELK layout when there are any. */
    candidates: LayoutCandidate[]
    /** The passes that could not lay this diagram out, so the user sees why an option is missing. */
    skipped?: SkippedMethod[]
}

/**
 * The tidy pass, kept only when the layout check does not score it below
 * the drawing. Synchronous, for the moment a diagram first goes up.
 */
export function tidyIfBetter(xml: string, options: TidyOptions = {}): TidyResult {
    const tidied = tidyDiagramXml(xml, options)
    if (!tidied.report.applied) return tidied
    if (lintDiagramXml(tidied.xml).score >= lintDiagramXml(xml).score) return tidied
    return { xml, report: { applied: false, reason: "tidy made it worse", moved: 0, straightened: 0 } }
}

export function parseLayout(value: unknown): DiagramLayout {
    return (DIAGRAM_LAYOUTS as readonly string[]).includes(String(value)) ? (value as DiagramLayout) : "auto"
}

export async function arrangeDiagramXml(xml: string, layout: DiagramLayout = "auto"): Promise<ArrangeResult> {
    const original = lintDiagramXml(xml).score
    const tidied = tidyDiagramXml(xml)
    const tidy = tidied.report.applied ? lintDiagramXml(tidied.xml).score : original
    const candidates: LayoutCandidate[] = [{ method: "original", xml, score: original }]
    const skipped: SkippedMethod[] = []
    if (tidied.report.applied) candidates.push({ method: "tidy", xml: tidied.xml, score: tidy, ...(tidy < original ? { note: { why: "worse" as const } } : {}) })
    else skipped.push({ method: "tidy", reason: tidied.report.reason ?? "nothing to tidy" })
    let best: ArrangeResult =
        tidied.report.applied && tidy >= original
            ? { ...tidied, chosen: "tidy", scores: { original, tidy }, candidates, skipped }
            : {
                  xml,
                  report: { applied: false, reason: tidied.report.reason ?? "tidy made it worse", moved: 0, straightened: 0 },
                  chosen: "original",
                  scores: { original, tidy },
                  candidates,
                  skipped,
              }
    // ELK is never chosen for kinds whose geometry means something, or when it
    // could not beat the score by the margin; it is still offered to the user.
    const mayChoose = !TIDY_ONLY.has(layout) && Math.max(original, best.chosen === "tidy" ? tidy : original) + ELK_MARGIN <= 100

    const declared = ELK_KIND[layout]
    let elk: { result: TidyResult; kind: LayoutKind; score: number; kept: number } | undefined
    // The best-scoring ELK layout of all, gates or not: offered to the user, never chosen by itself.
    let offered: (LayoutCandidate & { order: number; aligned: number }) | undefined
    let elkReason = "nothing to change"
    for (const kind of declared ? [declared] : LAYOUT_KINDS) {
        const result = await elkLayoutXml(xml, kind)
        if (!result.report.applied) {
            elkReason = result.report.reason ?? elkReason
            continue
        }
        const score = lintDiagramXml(result.xml).score
        const order = orderKept(xml, result.xml)
        const aligned = alignmentKept(xml, result.xml)
        if (!offered || score > offered.score) offered = { method: kind, xml: result.xml, score, order, aligned }
        if (order < MIN_ORDER_KEPT || aligned < MIN_ALIGNMENT_KEPT) continue
        const kept = order + aligned
        // The direction closest to the sketch, then the better score.
        if (!elk || kept > elk.kept + 0.02 || (Math.abs(kept - elk.kept) <= 0.02 && score > elk.score)) {
            elk = { result, kind, score, kept }
        }
    }
    // The ELK layout shown to the user: the one that passed the gates, else the best of all.
    const floor = best.chosen === "tidy" ? tidy : original
    const elkWins = !!elk && mayChoose && elk.score >= floor + ELK_MARGIN
    let shownElk: LayoutCandidate | undefined
    if (elk) {
        shownElk = { method: elk.kind, xml: elk.result.xml, score: elk.score }
        if (!elkWins) shownElk.note = TIDY_ONLY.has(layout) ? { why: "layout" } : { why: "margin", margin: ELK_MARGIN }
    } else if (offered) {
        shownElk = {
            method: offered.method,
            xml: offered.xml,
            score: offered.score,
            note: TIDY_ONLY.has(layout)
                ? { why: "layout" }
                : { why: "rearranged", order: offered.order, aligned: offered.aligned, min: Math.min(MIN_ORDER_KEPT, MIN_ALIGNMENT_KEPT) },
        }
    }
    if (shownElk) candidates.push(shownElk)
    else skipped.push({ method: "elk", reason: elkReason })
    if (!elk || !elkWins) return best
    best = { ...best, scores: { ...best.scores, elk: elk.score } }
    return { ...elk.result, chosen: elk.kind, scores: best.scores, candidates, skipped }
}
