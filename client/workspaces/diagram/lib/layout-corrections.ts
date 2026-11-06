/**
 * What the app did to each diagram the model drew, keyed by the tool call
 * that drew it, so the chat can show it as a step of its own under that
 * call: the layout check before and after, what moved, and a way to flip
 * between the model's layout and the corrected one.
 *
 * Saved to localStorage next to the chat, so a reloaded chat keeps its
 * correction steps. Only the latest diagram keeps both versions of its
 * XML (only it can be switched); older ones keep just the summary.
 */

import { useSyncExternalStore } from "react"
import { lintDiagramXml, type LintReport, type LintRule } from "./layout-lint"

export type CorrectionMethod = "original" | "tidy" | "layered-down" | "layered-right" | "layered-up"

export interface LayoutCorrection {
    /** The diagram as the model drew it. */
    original: string
    /** The diagram as shown after correcting; equals original when nothing changed. */
    corrected: string
    /** Whether correcting changed the diagram (kept when the XML is dropped). */
    changed: boolean
    method: CorrectionMethod
    /** A full layout is still being worked out in the background. */
    working: boolean
    /** The layout the model declared, if any. */
    layout?: string
    before: { score: number; rules: Partial<Record<LintRule, number>> }
    after: { score: number; rules: Partial<Record<LintRule, number>> }
    moved: number
    straightened: number
    /** Which of the two the canvas shows now. */
    showing: "corrected" | "original"
}

const STORAGE_KEY = "next-ai-draw-io-layout-corrections"
/** Older entries than this are dropped; a chat rarely holds more diagrams. */
const MAX_SAVED = 100

const corrections = new Map<string, LayoutCorrection>()
/** The tool call whose diagram the canvas holds; only it can be switched. */
let latestId: string | undefined
const listeners = new Set<() => void>()

function save() {
    if (typeof localStorage === "undefined") return
    try {
        const entries = [...corrections.entries()].slice(-MAX_SAVED).map(([id, c]): [string, LayoutCorrection] => [
            id,
            id === latestId ? c : { ...c, original: "", corrected: "" },
        ])
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ latestId, entries }))
    } catch {
        // Storage full or blocked: the steps still show until a reload.
    }
}

function restore() {
    if (typeof localStorage === "undefined") return
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const saved = JSON.parse(raw) as { latestId?: string; entries?: [string, LayoutCorrection][] }
        for (const [id, c] of saved.entries ?? []) {
            // A layout still running when the page went away never finishes.
            corrections.set(id, { ...c, working: false, changed: c.changed ?? c.corrected !== c.original })
        }
        latestId = saved.latestId
    } catch {
        // A damaged entry only costs the old steps.
    }
}
restore()

const emit = () => {
    save()
    for (const l of listeners) l()
}

function countRules(report: LintReport) {
    const rules: Partial<Record<LintRule, number>> = {}
    for (const i of report.issues) rules[i.rule] = (rules[i.rule] ?? 0) + 1
    return { score: report.score, rules }
}

export interface CorrectionInput {
    original: string
    corrected: string
    method: CorrectionMethod
    working?: boolean
    layout?: string
    moved?: number
    straightened?: number
}

/** Record (or replace) the correction for one tool call. */
export function recordCorrection(toolCallId: string, input: CorrectionInput): void {
    const before = countRules(lintDiagramXml(input.original))
    const after = input.corrected === input.original ? before : countRules(lintDiagramXml(input.corrected))
    corrections.set(toolCallId, {
        original: input.original,
        corrected: input.corrected,
        changed: input.corrected !== input.original,
        method: input.method,
        working: input.working ?? false,
        layout: input.layout,
        before,
        after,
        moved: input.moved ?? 0,
        straightened: input.straightened ?? 0,
        showing: "corrected",
    })
    latestId = toolCallId
    emit()
}

/** Change a recorded correction, e.g. when the background layout finishes. */
export function updateCorrection(toolCallId: string, patch: Partial<LayoutCorrection>): void {
    const current = corrections.get(toolCallId)
    if (!current) return
    corrections.set(toolCallId, { ...current, ...patch })
    emit()
}

export function getCorrection(toolCallId: string): LayoutCorrection | undefined {
    return corrections.get(toolCallId)
}

export function clearCorrections(): void {
    corrections.clear()
    latestId = undefined
    emit()
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useLayoutCorrection(toolCallId: string): LayoutCorrection | undefined {
    return useSyncExternalStore(
        subscribe,
        () => corrections.get(toolCallId),
        () => undefined,
    )
}

export function useLatestCorrectionId(): string | undefined {
    return useSyncExternalStore(
        subscribe,
        () => latestId,
        () => undefined,
    )
}
