/**
 * Score a generated run: every diagram as the model drew it, and again as
 * the app would show it (arrangeDiagramXml: as drawn, tidied or laid out
 * by ELK, whichever checks best).
 *
 *   npx tsx tools/eval/diagram/score.ts <run>
 *
 * Reads out/<run>/generations.json and the .drawio files beside it, writes
 * out/<run>/results.json. Scoring needs no model, so after a change to the
 * tidy pass or the layout check, rescoring a saved run shows its effect on
 * exactly the same diagrams.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { type LintReport, lintDiagramXml } from "../../../client/workspaces/diagram/lib/layout-lint"
import { arrangeDiagramXml, parseLayout } from "../../../client/workspaces/diagram/lib/arrange"
import type { EvalPrompt, Generation } from "./conversation"

const here = path.dirname(fileURLToPath(import.meta.url))
export const outRoot = path.join(here, "out")

export interface LintSummary {
    score: number
    errors: number
    warnings: number
    crossings: number
    bends: number
    shapes: number
    edges: number
    rules: Record<string, number>
}

export interface EvalResult {
    id: string
    family: string
    lang: string
    level: string
    split: string
    ok: boolean
    failure?: string
    rounds: number
    seconds: number
    tools: string[]
    raw?: LintSummary
    /** The layout the model declared, if any. */
    layout?: string
    tidied?: LintSummary & { applied: boolean; direction?: string; reason?: string }
}

export function loadPrompts(): EvalPrompt[] {
    return (JSON.parse(readFileSync(path.join(here, "prompts.json"), "utf8")) as { prompts: EvalPrompt[] }).prompts
}

function summarise(report: LintReport): LintSummary {
    const rules: Record<string, number> = {}
    for (const i of report.issues) rules[i.rule] = (rules[i.rule] || 0) + 1
    return {
        score: report.score,
        errors: report.errors,
        warnings: report.warnings,
        crossings: report.metrics.crossings,
        bends: report.metrics.bends,
        shapes: report.metrics.shapes,
        edges: report.metrics.edges,
        rules,
    }
}

export async function scoreRun(label: string): Promise<EvalResult[]> {
    const dir = path.join(outRoot, label)
    const meta = JSON.parse(readFileSync(path.join(dir, "generations.json"), "utf8")) as {
        generations: Generation[]
        [k: string]: unknown
    }
    const prompts = new Map(loadPrompts().map((p) => [p.id, p]))
    const results: EvalResult[] = []
    for (const g of meta.generations) {
        const p = prompts.get(g.id)
        const base = {
            id: g.id,
            family: p?.family ?? "?",
            lang: p?.lang ?? "?",
            level: p?.level ?? "?",
            split: p?.split ?? "?",
            rounds: g.rounds,
            seconds: g.seconds,
            tools: g.tools,
            ...(g.layout ? { layout: g.layout } : {}),
        }
        const file = path.join(dir, `${g.id}.drawio`)
        if (g.failure || !existsSync(file)) {
            results.push({ ...base, ok: false, failure: g.failure ?? "no diagram saved" })
            continue
        }
        const xml = readFileSync(file, "utf8")
        const arranged = await arrangeDiagramXml(xml, parseLayout(g.layout))
        results.push({
            ...base,
            ok: true,
            raw: summarise(lintDiagramXml(xml)),
            tidied: {
                ...summarise(lintDiagramXml(arranged.xml)),
                applied: arranged.report.applied,
                direction: arranged.chosen === "tidy" ? `tidy ${arranged.report.direction}` : arranged.chosen,
                reason: arranged.report.reason,
            },
        })
    }
    results.sort((a, b) => a.id.localeCompare(b.id))
    const { generations: _generations, ...rest } = meta
    writeFileSync(
        path.join(dir, "results.json"),
        JSON.stringify({ ...rest, scoredAt: new Date().toISOString(), results }, null, 2),
    )
    return results
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const label = process.argv[2]
    if (!label) {
        console.error("Usage: score.ts <run>")
        process.exit(1)
    }
    const results = await scoreRun(label)
    console.log(`Scored ${results.length} prompts in ${label}`)
}
