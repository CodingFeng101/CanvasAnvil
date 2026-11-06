/**
 * Offline experiment: lay out the diagrams of a finished run again, with the
 * tidy pass and with each ELK layout kind, and score every result with the
 * layout check. No model calls.
 *
 *   npx tsx tools/eval/diagram/elk-compare.ts <run> [split]
 *
 * The prompt's family stands in for the layout kind the model will declare
 * once the prompt asks it to; the table shows, per family, which kind (if
 * any) beats the tidy pass. A kind is worth enabling for a family only if
 * it wins on average and makes no diagram clearly worse.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { elkLayoutXml, LAYOUT_KINDS, type LayoutKind } from "../../../client/workspaces/diagram/lib/elk-layout"
import { lintDiagramXml, orderKept } from "../../../client/workspaces/diagram/lib/layout-lint"
import { tidyDiagramXml } from "../../../client/workspaces/diagram/lib/tidy-layout"
import { loadPrompts, outRoot } from "./score"

const [label, split = "all"] = process.argv.slice(2)
if (!label) {
    console.error("Usage: elk-compare.ts <run> [dev|holdout|all]")
    process.exit(1)
}

const columns = ["raw", "tidy", ...LAYOUT_KINDS] as const
type Column = (typeof columns)[number]
const scores = new Map<string, Map<Column, number[]>>()
const worse = new Map<string, Map<Column, number>>()
const order = new Map<string, Map<Column, number[]>>()
const add = <T>(m: Map<string, Map<Column, T>>, family: string, c: Column, f: (old: T | undefined) => T) => {
    const row = m.get(family) || new Map<Column, T>()
    row.set(c, f(row.get(c)))
    m.set(family, row)
}

for (const p of loadPrompts()) {
    if (split !== "all" && p.split !== split) continue
    const file = path.join(outRoot, label, `${p.id}.drawio`)
    if (!existsSync(file)) continue
    const xml = readFileSync(file, "utf8")
    const raw = lintDiagramXml(xml).score
    const tidy = lintDiagramXml(tidyDiagramXml(xml).xml).score
    const line: string[] = [`${p.id.padEnd(9)} raw ${raw} tidy ${tidy}`]
    for (const family of [p.family, "all"]) {
        add(scores, family, "raw", (o = []) => [...o, raw])
        add(scores, family, "tidy", (o = []) => [...o, tidy])
    }
    for (const kind of LAYOUT_KINDS) {
        const r = await elkLayoutXml(xml, kind)
        const s = lintDiagramXml(r.xml).score
        const kept = r.report.applied ? orderKept(xml, r.xml) : 1
        line.push(`${kind} ${r.report.applied ? `${s}/${Math.round(kept * 100)}%` : "-"}`)
        for (const family of [p.family, "all"]) add(order, family, kind, (o = []) => [...o, kept])
        for (const family of [p.family, "all"]) {
            add(scores, family, kind, (o = []) => [...o, s])
            if (s < tidy - 10) add(worse, family, kind, (o = 0) => o + 1)
        }
    }
    console.log(line.join("  "))
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
console.log(`\nMean score per family (number of diagrams 10+ points below tidy in brackets)\n`)
const rows = [["family", "n", ...columns]]
for (const [family, row] of [...scores.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push([
        family,
        String(row.get("raw")!.length),
        ...columns.map((c) => {
            const w = worse.get(family)?.get(c)
            const o = order.get(family)?.get(c)
            return `${mean(row.get(c)!).toFixed(1)}${o ? ` ${Math.round(mean(o) * 100)}%` : ""}${w ? ` (${w})` : ""}`
        }),
    ])
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
for (const r of rows) console.log(r.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  "))

export type { LayoutKind }
