"use client"

/**
 * A diagram tool call shown as a chain of steps, the way agent UIs show
 * their work:
 *
 *   thinking   — the model's reasoning, and the plan it wrote first in
 *                the tool call (what the diagram shows, its layout, groups)
 *   drawing    — the draw.io code it produced, with a count of what it holds
 *   correction — what the app did to the layout, the layout check before
 *                and after, and a switch back to the model's own layout
 *
 * One line runs down the left joining the steps. Only the latest diagram
 * can be switched: an older one would replace whatever the canvas holds now.
 */

import type { ReactNode } from "react"
import { Brain, Check, FileCode, FilePen, FilePlus2, FileText, Wand2 } from "lucide-react"
import { Step, StepList, type StepState } from "@/shared/chat"
import { cn } from "@/shared/lib/utils"
import { parseLayout } from "@/workspaces/diagram/lib/arrange"
import type { LintRule } from "@/workspaces/diagram/lib/layout-lint"
import {
    type CorrectionCandidate,
    type LayoutCorrection,
    type SkippedCorrection,
    updateCorrection,
    useLatestCorrectionId,
    useLayoutCorrection,
} from "@/workspaces/diagram/lib/layout-corrections"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"
import { useDiagram } from "@/workspaces/diagram/state/diagram-context"

type Key = Parameters<ReturnType<typeof useDiagramT>>[0]
/**
 * What happens before the diagram: reading the uploaded files. Sent as the "data-sketch" part
 * (the name saved messages carry); a sketch in an old message is no longer shown.
 */
export type PrepData = {
    files?: { state: "running" | "done" | "error"; names?: string[]; seconds?: number; error?: string }
}

export function PrepSteps({ data }: { data: PrepData }) {
    const t = useDiagramT()
    const files = data.files
    if (!files) return null
    const names = files.names ?? []
    return (
        <StepList>
            <Step
                icon={FileText}
                title={files.state === "running" ? t("steps.reading") : files.state === "done" ? t("steps.read") : t("steps.read_failed")}
                meta={files.state === "running" ? undefined : t("steps.read_meta", { n: names.length, s: files.seconds ?? 0 })}
                state={files.state === "error" ? "warning" : files.state}
                last
                defaultOpen={false}
            >
                {names.length > 0 || files.error ? (
                    <div className="space-y-1 text-sm text-muted-foreground">
                        {names.map((name, i) => (
                            <p key={i} className="truncate">
                                {name}
                            </p>
                        ))}
                        {files.error && <p className="text-xs whitespace-pre-wrap">{files.error}</p>}
                    </div>
                ) : null}
            </Step>
        </StepList>
    )
}

const RULES: LintRule[] = [
    "overlap",
    "edge-through-shape",
    "container-escape",
    "container-overlap",
    "text-overflow",
    "dangling-edge",
    "near-miss",
]

function issueChanges(c: LayoutCorrection) {
    const fixed: { rule: LintRule; n: number }[] = []
    const left: { rule: LintRule; n: number }[] = []
    for (const rule of RULES) {
        const before = c.before.rules[rule] ?? 0
        const after = c.after.rules[rule] ?? 0
        if (before > after) fixed.push({ rule, n: before - after })
        if (after > 0) left.push({ rule, n: after })
    }
    return { fixed, left }
}

/** The layout pass's own reason, in words the user reads. */
function skipReason(reason: string, t: ReturnType<typeof useDiagramT>) {
    if (/no rows or columns/.test(reason)) return t("correction.skip.norows")
    if (/^nothing/.test(reason)) return t("correction.skip.neat")
    if (/too few/.test(reason)) return t("correction.skip.few")
    if (/overlap/.test(reason)) return t("correction.skip.overlap")
    if (/orthogonal/.test(reason)) return t("correction.skip.orthogonal")
    return t("correction.skip.error", { reason: reason.replace(/^error:\s*/, "") })
}

const count = (xml: string, kind: "vertex" | "edge") =>
    (xml.match(new RegExp(`<mxCell\\b[^>]*\\b${kind}="1"`, "g")) || []).length

export interface DiagramStepsProps {
    toolCallId: string
    toolName: "display_diagram" | "append_diagram" | "edit_diagram"
    state?: string
    /** The model's reasoning before this call, if the provider sends it. */
    reasoning: string[]
    reasoningStreaming: boolean
    /** The plan the model wrote first in the tool call. */
    plan?: string
    xml?: string
    operationCount?: number
    truncated: boolean
    errorText?: string
    /** The code view: XML or the list of edit operations. */
    code: ReactNode
}

export function DiagramSteps(props: DiagramStepsProps) {
    const t = useDiagramT()
    const correction = useLayoutCorrection(props.toolCallId)
    const latestId = useLatestCorrectionId()
    const { loadDiagram } = useDiagram()
    const { state, plan, reasoning, toolName } = props

    const streaming = state === "input-streaming"
    const thoughts = reasoning.map((r) => r.trim()).filter(Boolean)
    const planText = (plan ?? "").trim()
    const hasThinking = thoughts.length > 0 || planText.length > 0 || props.reasoningStreaming
    const thinkingRunning = props.reasoningStreaming || (streaming && !props.xml && !props.operationCount)

    const drawState: StepState =
        state === "output-error" ? (props.truncated ? "warning" : "error") : state === "output-available" ? "done" : "running"
    const drawTitle =
        toolName === "edit_diagram"
            ? t("steps.edit")
            : toolName === "append_diagram"
              ? t("steps.append")
              : t("steps.draw")
    const drawMeta =
        toolName === "edit_diagram"
            ? t("steps.operations", { n: props.operationCount ?? 0 })
            : props.xml
              ? t("steps.cells", { shapes: count(props.xml, "vertex"), edges: count(props.xml, "edge") })
              : undefined

    return (
        <StepList>
            {hasThinking && (
                <Step
                    icon={Brain}
                    title={thinkingRunning ? t("steps.thinking") : t("steps.thought")}
                    state={thinkingRunning ? "running" : "done"} defaultOpen={thinkingRunning}
                    last={false}
                >
                    <div className="space-y-2 text-sm text-muted-foreground">
                        {thoughts.map((text, i) => (
                            <p key={i} className="whitespace-pre-wrap">
                                {text}
                            </p>
                        ))}
                        {planText && <p className="whitespace-pre-wrap text-foreground/80">{planText}</p>}
                    </div>
                </Step>
            )}
            <Step
                icon={toolName === "edit_diagram" ? FilePen : toolName === "append_diagram" ? FilePlus2 : FileCode}
                title={drawTitle}
                meta={
                    <>
                        {drawMeta}
                        {drawState === "warning" && <span className="text-warning"> · {t("tool.status.truncated")}</span>}
                        {drawState === "error" && <span className="text-destructive"> · {t("tool.status.error")}</span>}
                    </>
                }
                state={drawState}
                last={!correction}
                defaultOpen={false}
            >
                {props.code}
                {props.errorText && state === "output-error" && (
                    <p className="mt-2 text-xs text-destructive whitespace-pre-wrap">{props.errorText}</p>
                )}
            </Step>
            {correction && (
                <CorrectionStep
                    toolCallId={props.toolCallId}
                    correction={correction}
                    canSwitch={latestId === props.toolCallId}
                    load={loadDiagram}
                />
            )}
        </StepList>
    )
}

function CorrectionStep({
    toolCallId,
    correction,
    canSwitch,
    load,
}: {
    toolCallId: string
    correction: LayoutCorrection
    canSwitch: boolean
    load: (xml: string, skipValidation?: boolean) => string | null
}) {
    const t = useDiagramT()
    const changed = correction.changed
    const { fixed, left } = issueChanges(correction)
    const layout = parseLayout(correction.layout)
    const show = (which: "corrected" | "original") => {
        if (which === correction.showing || !correction.original) return
        const error = load(which === "corrected" ? correction.corrected : correction.original, true)
        if (!error) updateCorrection(toolCallId, { showing: which })
    }
    // Older steps carry no candidates and keep the two-way switch below.
    const candidates = correction.candidates ?? []
    const skipped: SkippedCorrection[] = candidates.length ? (correction.skipped ?? []) : []
    const current = correction.picked ?? (correction.showing === "original" ? "original" : correction.method)
    const currentCandidate = candidates.find((c) => c.method === current)
    const pick = (candidate: CorrectionCandidate) => {
        if (candidate.method === current) return
        const error = load(candidate.xml, true)
        if (!error) updateCorrection(toolCallId, { picked: candidate.method, showing: candidate.method === "original" ? "original" : "corrected" })
    }
    const optionName = (method: CorrectionCandidate["method"] | "elk") =>
        method === "original" ? t("correction.option.original") : method === "tidy" ? t("correction.option.tidy") : t("correction.option.elk")
    const issues = (list: { rule: LintRule; n: number }[]) =>
        list.map((f) => t("correction.issue", { n: f.n, rule: t(`rule.${f.rule}` as Key) })).join(t("correction.sep"))

    return (
        <Step
            icon={Wand2}
            title={correction.working ? t("correction.working") : t("correction.title")}
            meta={
                changed ? (
                    <span title={t("correction.score_hint")} className="tabular-nums">
                        {t("correction.score", { before: correction.before.score, after: correction.after.score })}
                    </span>
                ) : (
                    t("correction.unchanged")
                )
            }
            state={correction.working ? "running" : "done"} defaultOpen
            last
        >
            <div className="space-y-1 text-sm text-muted-foreground">
                {layout !== "auto" && (
                    <p>
                        {t("correction.declared")}
                        <span className="text-foreground/80">{t(`layout.${layout}` as Key)}</span>
                    </p>
                )}
                <p className="text-foreground/80">
                    {correction.working
                        ? t("correction.working_detail")
                        : changed
                          ? correction.method === "tidy"
                              ? t("correction.by_tidy", { moved: correction.moved, straight: correction.straightened })
                              : t("correction.by_elk", { direction: t(`method.${correction.method}` as Key) })
                          : t("correction.kept")}
                </p>
                {fixed.length > 0 && (
                    <p>
                        {t("correction.fixed")}
                        {issues(fixed)}
                    </p>
                )}
                {left.length > 0 && !correction.working && (
                    <p>
                        {t("correction.left")}
                        {issues(left)}
                    </p>
                )}
                {/* Confirmed: the choices are put away, the chat goes on from this layout. */}
                {correction.confirmed && currentCandidate && (
                    <p className="text-foreground/80">
                        {t("correction.confirmed", { name: optionName(currentCandidate.method), score: currentCandidate.score })}
                    </p>
                )}
                {/* Every layout tried, each with its score: the user tries them on the canvas and confirms one. */}
                {canSwitch && !correction.working && !correction.confirmed && candidates.length + skipped.length > 1 && (
                    <div className="pt-1.5">
                        <p className="mb-1">{t("correction.pick")}</p>
                        <div className="flex flex-wrap items-center gap-1">
                            {candidates.map((candidate) => {
                                const on = current === candidate.method
                                return (
                                    <button
                                        key={candidate.method}
                                        type="button"
                                        onClick={() => pick(candidate)}
                                        aria-pressed={on}
                                        title={candidate.method.startsWith("layered") ? t(`method.${candidate.method}` as Key) : undefined}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                                            on
                                                ? "border border-border/60 bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                    >
                                        <span>{optionName(candidate.method)}</span>
                                        <span className="tabular-nums opacity-70">{t("correction.option.score", { score: candidate.score })}</span>
                                    </button>
                                )
                            })}
                            {/* A pass that produced nothing still shows, greyed, with its reason on hover. */}
                            {skipped.map((s) => (
                                <span
                                    key={s.method}
                                    title={skipReason(s.reason, t)}
                                    aria-disabled
                                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground/50"
                                >
                                    <span>{optionName(s.method)}</span>
                                    <span className="opacity-70">{t("correction.option.na")}</span>
                                </span>
                            ))}
                            {candidates.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => updateCorrection(toolCallId, { confirmed: true })}
                                    className="ml-1 inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs text-background transition-opacity hover:opacity-85"
                                >
                                    <Check className="size-3.5" aria-hidden />
                                    {t("correction.confirm")}
                                </button>
                            )}
                        </div>
                        {skipped.map((s) => (
                            <p key={s.method} className="mt-1 text-xs text-muted-foreground/70">
                                {t("correction.skip.line", { name: optionName(s.method), reason: skipReason(s.reason, t) })}
                            </p>
                        ))}
                    </div>
                )}
                {changed && canSwitch && !correction.working && correction.original && candidates.length <= 1 && (
                    <div className="flex items-center gap-1 pt-1.5">
                        {(["corrected", "original"] as const).map((which) => (
                            <button
                                key={which}
                                type="button"
                                onClick={() => show(which)}
                                aria-pressed={correction.showing === which}
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs transition-colors",
                                    correction.showing === which
                                        ? "bg-background text-foreground shadow-sm border border-border/60"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                                )}
                            >
                                {t(which === "corrected" ? "correction.show_corrected" : "correction.show_original")}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Step>
    )
}
