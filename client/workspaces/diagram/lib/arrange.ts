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
 * Nothing is ever handed back that scores below the drawing itself.
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

export interface ArrangeResult extends TidyResult {
    chosen: "original" | "tidy" | LayoutKind
    scores: { original: number; tidy: number; elk?: number }
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
    let best: ArrangeResult =
        tidied.report.applied && tidy >= original
            ? { ...tidied, chosen: "tidy", scores: { original, tidy } }
            : {
                  xml,
                  report: { applied: false, reason: tidied.report.reason ?? "tidy made it worse", moved: 0, straightened: 0 },
                  chosen: "original",
                  scores: { original, tidy },
              }
    // Nothing to gain when ELK could not beat the score by the margin.
    if (TIDY_ONLY.has(layout) || Math.max(original, best.chosen === "tidy" ? tidy : original) + ELK_MARGIN > 100) {
        return best
    }

    const declared = ELK_KIND[layout]
    let elk: { result: TidyResult; kind: LayoutKind; score: number; kept: number } | undefined
    for (const kind of declared ? [declared] : LAYOUT_KINDS) {
        const result = await elkLayoutXml(xml, kind)
        if (!result.report.applied) continue
        const order = orderKept(xml, result.xml)
        const aligned = alignmentKept(xml, result.xml)
        if (order < MIN_ORDER_KEPT || aligned < MIN_ALIGNMENT_KEPT) continue
        const score = lintDiagramXml(result.xml).score
        const kept = order + aligned
        // The direction closest to the sketch, then the better score.
        if (!elk || kept > elk.kept + 0.02 || (Math.abs(kept - elk.kept) <= 0.02 && score > elk.score)) {
            elk = { result, kind, score, kept }
        }
    }
    if (!elk) return best
    best = { ...best, scores: { ...best.scores, elk: elk.score } }
    const floor = best.chosen === "tidy" ? tidy : original
    if (elk.score >= floor + ELK_MARGIN) return { ...elk.result, chosen: elk.kind, scores: best.scores }
    return best
}
