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

import { BrainIcon, ChevronDown, FileCode, Wand2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Shimmer } from "@/shared/chat"
import { cn } from "@/shared/lib/utils"
import { parseLayout } from "@/workspaces/diagram/lib/arrange"
import type { LintRule } from "@/workspaces/diagram/lib/layout-lint"
import {
    type LayoutCorrection,
    updateCorrection,
    useLatestCorrectionId,
    useLayoutCorrection,
} from "@/workspaces/diagram/lib/layout-corrections"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"
import { useDiagram } from "@/workspaces/diagram/state/diagram-context"

type Key = Parameters<ReturnType<typeof useDiagramT>>[0]
type StepState = "running" | "done" | "warning" | "error"

function Step({
    icon,
    title,
    meta,
    state,
    last,
    collapsible = true,
    defaultOpen = true,
    children,
}: {
    icon: ReactNode
    title: ReactNode
    meta?: ReactNode
    state: StepState
    last: boolean
    collapsible?: boolean
    defaultOpen?: boolean
    children?: ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    const hasBody = Boolean(children)
    const header = (
        <>
            <span className="text-sm font-medium text-foreground/85">{title}</span>
            {meta && <span className="min-w-0 truncate text-xs text-muted-foreground">{meta}</span>}
            {collapsible && hasBody && (
                <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                />
            )}
        </>
    )
    return (
        <li className="relative flex gap-3 pb-3 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-border" />}
            <span
                className={cn(
                    "relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background",
                    state === "error"
                        ? "border-destructive/50 text-destructive"
                        : state === "warning"
                          ? "border-warning/50 text-warning"
                          : state === "running"
                            ? "border-primary/50 text-primary-strong"
                            : "border-border text-muted-foreground",
                )}
            >
                {state === "running" ? (
                    <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                    icon
                )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
                {collapsible && hasBody ? (
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        aria-expanded={open}
                        className="flex w-full min-w-0 items-center gap-2 text-left hover:opacity-80"
                    >
                        {header}
                    </button>
                ) : (
                    <div className="flex min-w-0 items-center gap-2">{header}</div>
                )}
                {hasBody && (open || !collapsible) && <div className="mt-1.5">{children}</div>}
            </div>
        </li>
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
        <ol className="my-3 list-none pl-0">
            {hasThinking && (
                <Step
                    icon={<BrainIcon className="h-3.5 w-3.5" />}
                    title={thinkingRunning ? <Shimmer duration={1}>{t("steps.thinking")}</Shimmer> : t("steps.thought")}
                    state={thinkingRunning ? "running" : "done"}
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
                icon={<FileCode className="h-3.5 w-3.5" />}
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
        </ol>
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
    const changed = correction.corrected !== correction.original
    const { fixed, left } = issueChanges(correction)
    const layout = parseLayout(correction.layout)
    const show = (which: "corrected" | "original") => {
        if (which === correction.showing) return
        const error = load(which === "corrected" ? correction.corrected : correction.original, true)
        if (!error) updateCorrection(toolCallId, { showing: which })
    }
    const issues = (list: { rule: LintRule; n: number }[]) =>
        list.map((f) => t("correction.issue", { n: f.n, rule: t(`rule.${f.rule}` as Key) })).join(t("correction.sep"))

    return (
        <Step
            icon={<Wand2 className="h-3.5 w-3.5" />}
            title={correction.working ? <Shimmer duration={1}>{t("correction.working")}</Shimmer> : t("correction.title")}
            meta={
                changed ? (
                    <span title={t("correction.score_hint")} className="tabular-nums">
                        {t("correction.score", { before: correction.before.score, after: correction.after.score })}
                    </span>
                ) : (
                    t("correction.unchanged")
                )
            }
            state={correction.working ? "running" : "done"}
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
                {changed && canSwitch && !correction.working && (
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
