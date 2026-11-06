/**
 * Summarise one eval run, or compare two.
 *
 *   npx tsx tools/eval/diagram/report.ts <run>            one run
 *   npx tsx tools/eval/diagram/report.ts <before> <after> what changed
 *
 * Runs are folder names under tools/eval/diagram/out/. Scores are the layout
 * check's 0–100. "raw" is the diagram as the model drew it, "tidied" after
 * the tidy pass; a regression is a diagram the tidy pass made worse. When
 * comparing, dev and holdout are reported apart: a change is accepted on
 * holdout, which it was never tuned on.
 *
 * Model output varies from run to run, so differences of a few points on a
 * family of four prompts are noise; look at the overall numbers first.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { EvalResult } from "./score"

const here = path.dirname(fileURLToPath(import.meta.url))

function load(label: string): EvalResult[] {
    const file = path.join(here, "out", label, "results.json")
    return (JSON.parse(readFileSync(file, "utf8")) as { results: EvalResult[] }).results
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-")
const signed = (n: number) => (Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(1)}` : "-")

interface Stats {
    n: number
    failed: number
    raw: number
    tidied: number
    errors: number
    applied: number
    regressions: number
}

function stats(results: EvalResult[]): Stats {
    const ok = results.filter((r) => r.ok)
    return {
        n: results.length,
        failed: results.length - ok.length,
        raw: mean(ok.map((r) => r.raw!.score)),
        tidied: mean(ok.map((r) => r.tidied!.score)),
        errors: mean(ok.map((r) => r.tidied!.errors)),
        applied: ok.filter((r) => r.tidied!.applied).length,
        regressions: ok.filter((r) => r.tidied!.score < r.raw!.score - 0.5).length,
    }
}

function table(rows: string[][]) {
    const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
    for (const r of rows) console.log(r.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  "))
}

function groupBy(results: EvalResult[], key: (r: EvalResult) => string) {
    const groups = new Map<string, EvalResult[]>()
    for (const r of results) groups.set(key(r), [...(groups.get(key(r)) || []), r])
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function single(label: string) {
    const results = load(label)
    console.log(`Run ${label}: ${results.length} prompts\n`)
    const rows = [["group", "n", "failed", "raw", "tidied", "errors", "tidy applied", "tidy made worse"]]
    const add = (name: string, s: Stats) =>
        rows.push([name, String(s.n), String(s.failed), f1(s.raw), f1(s.tidied), f1(s.errors), String(s.applied), String(s.regressions)])
    add("all", stats(results))
    for (const [k, rs] of groupBy(results, (r) => r.split)) add(`split:${k}`, stats(rs))
    for (const [k, rs] of groupBy(results, (r) => r.lang)) add(`lang:${k}`, stats(rs))
    for (const [k, rs] of groupBy(results, (r) => r.family)) add(k, stats(rs))
    table(rows)

    const rules: Record<string, number> = {}
    for (const r of results) if (r.ok) for (const [k, v] of Object.entries(r.tidied!.rules)) rules[k] = (rules[k] || 0) + v
    console.log("\nIssues left after tidying:", Object.keys(rules).length ? rules : "none")
    const failed = results.filter((r) => !r.ok)
    if (failed.length) {
        console.log("\nFailures:")
        for (const r of failed) console.log(`  ${r.id}: ${r.failure}`)
    }
    const worse = results.filter((r) => r.ok && r.tidied!.score < r.raw!.score - 0.5)
    if (worse.length) {
        console.log("\nMade worse by tidying:")
        for (const r of worse) console.log(`  ${r.id}: ${r.raw!.score} -> ${r.tidied!.score} (${r.tidied!.direction})`)
    }
}

function compare(before: string, after: string) {
    const a = new Map(load(before).map((r) => [r.id, r]))
    const b = load(after).filter((r) => a.has(r.id))
    console.log(`${before} -> ${after}: ${b.length} prompts in both\n`)
    const rows = [["group", "n", "failed", "raw", "Δraw", "tidied", "Δtidied", "errors", "Δerrors"]]
    const add = (name: string, rs: EvalResult[]) => {
        const sa = stats(rs.map((r) => a.get(r.id)!))
        const sb = stats(rs)
        rows.push([
            name,
            String(sb.n),
            `${sa.failed}->${sb.failed}`,
            f1(sb.raw),
            signed(sb.raw - sa.raw),
            f1(sb.tidied),
            signed(sb.tidied - sa.tidied),
            f1(sb.errors),
            signed(sb.errors - sa.errors),
        ])
    }
    add("all", b)
    for (const [k, rs] of groupBy(b, (r) => r.split)) add(`split:${k}`, rs)
    for (const [k, rs] of groupBy(b, (r) => r.family)) add(k, rs)
    table(rows)

    const worse = b.filter((r) => {
        const old = a.get(r.id)!
        return old.ok && (!r.ok || r.tidied!.score < old.tidied!.score - 10)
    })
    if (worse.length) {
        console.log("\nClearly worse than before (10+ points or now failing):")
        for (const r of worse) {
            const old = a.get(r.id)!
            console.log(`  ${r.id}: ${old.tidied!.score} -> ${r.ok ? r.tidied!.score : `failed: ${r.failure}`}`)
        }
    }
}

const [first, second] = process.argv.slice(2)
if (!first) {
    console.error("Usage: report.ts <run> [<run to compare>]")
    process.exit(1)
}
if (second) compare(first, second)
else single(first)
