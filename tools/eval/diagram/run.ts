/**
 * Run the diagram eval set through the app's real /api/chat route with
 * credentials from the environment, then score it.
 *
 *   EVAL_API_KEY   (required) key for the OpenAI-compatible endpoint
 *   EVAL_MODEL     (required) model id
 *   EVAL_BASE_URL  endpoint, default https://api.openai.com/v1
 *   APP_URL        running app, default http://localhost:8001/
 *   EVAL_SPLIT     dev | holdout | all (default all)
 *   EVAL_ONLY      comma-separated prompt ids or families; rerunning some
 *                  prompts of an existing run keeps that run's other results
 *   EVAL_LABEL     run name, default <date>-<model>
 *   EVAL_CONCURRENCY  parallel conversations, default 3
 *
 *   npx tsx tools/eval/diagram/run.ts
 *
 * The key is only ever sent to the app; nothing written to disk holds it.
 * To use the settings already saved in the app instead, see browser.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { type EvalPrompt, type Generation, generate } from "./conversation"
import { loadPrompts, outRoot, scoreRun } from "./score"

export function selectPrompts(split: string, only: string[]): EvalPrompt[] {
    return loadPrompts().filter(
        (p) => (split === "all" || p.split === split) && (!only.length || only.includes(p.id) || only.includes(p.family)),
    )
}

export function saveGeneration(dir: string, g: Generation) {
    if (g.xml) writeFileSync(path.join(dir, `${g.id}.drawio`), g.xml)
}

/** Results already saved for this run, minus the prompts about to run again. */
export function earlierGenerations(dir: string, rerun: Set<string>): Generation[] {
    const file = path.join(dir, "generations.json")
    if (!existsSync(file)) return []
    const saved = (JSON.parse(readFileSync(file, "utf8")) as { generations: Generation[] }).generations
    return saved.filter((g) => !rerun.has(g.id))
}

export function writeGenerations(dir: string, meta: Record<string, unknown>, generations: Generation[]) {
    const list = generations.map(({ xml: _xml, ...rest }) => rest).sort((a, b) => a.id.localeCompare(b.id))
    writeFileSync(path.join(dir, "generations.json"), JSON.stringify({ ...meta, generations: list }, null, 2))
}

async function main() {
    const apiKey = process.env.EVAL_API_KEY || ""
    const model = process.env.EVAL_MODEL || ""
    if (!apiKey || !model) {
        console.error("Set EVAL_API_KEY and EVAL_MODEL (and EVAL_BASE_URL for a non-OpenAI endpoint).")
        process.exit(1)
    }
    const baseUrl = process.env.EVAL_BASE_URL || "https://api.openai.com/v1"
    const appUrl = process.env.APP_URL || "http://localhost:8001/"
    const split = process.env.EVAL_SPLIT || "all"
    const only = (process.env.EVAL_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean)
    const prompts = selectPrompts(split, only)
    const label =
        process.env.EVAL_LABEL ||
        `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${model.replace(/[^\w.-]/g, "_")}`
    const dir = path.join(outRoot, label)
    mkdirSync(dir, { recursive: true })
    console.log(`Running ${prompts.length} prompts against ${appUrl} with ${model} -> ${dir}`)

    const target = { appUrl, aiConfig: { textApiKey: apiKey, textBaseUrl: baseUrl, textModel: model } }
    const generations: Generation[] = []
    const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY) || 3)
    let next = 0
    const worker = async () => {
        while (next < prompts.length) {
            const prompt = prompts[next++]
            const g = await generate(target, prompt)
            saveGeneration(dir, g)
            generations.push(g)
            console.log(`[${generations.length}/${prompts.length}] ${prompt.id} ${g.xml ? `ok in ${g.seconds}s` : `FAILED: ${g.failure}`}`)
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    const kept = earlierGenerations(dir, new Set(prompts.map((p) => p.id)))
    writeGenerations(dir, { label, model, host: new URL(baseUrl).host, split, at: new Date().toISOString() }, [
        ...kept,
        ...generations,
    ])
    await scoreRun(label)
    console.log(`\nSummarise with: npx tsx tools/eval/diagram/report.ts ${label}`)
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("run.")) {
    main().catch((error) => {
        console.error(error)
        process.exit(1)
    })
}
