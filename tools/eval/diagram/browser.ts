/**
 * Run the eval set from inside the app's own page, with the model settings
 * the app already has saved, so no key has to be copied anywhere.
 *
 * Start the receiver, which saves what the page sends and scores it:
 *
 *   npx tsx tools/eval/diagram/receive.ts
 *
 * then, in the browser console of the running app (Vite serves this file):
 *
 *   const { runInPage } = await import("/tools/eval/diagram/browser.ts")
 *   window.diagramEval = runInPage({ label: "baseline" })
 *
 * The settings travel only where the chat panel sends them, to the app's
 * own /api/chat. The receiver gets the diagrams and timings, never the
 * settings. Progress is on the returned object.
 */

import { getAIConfig } from "../../../client/ai/storage"
import { type EvalPrompt, type Generation, generate } from "./conversation"
import set from "./prompts.json"

export interface PageRunOptions {
    label: string
    split?: "dev" | "holdout" | "all"
    only?: string[]
    concurrency?: number
    receiver?: string
}

export interface PageRunProgress {
    label: string
    total: number
    done: number
    failed: number
    running: boolean
    error?: string
    log: { id: string; ok: boolean; seconds: number; failure?: string }[]
    finished: Promise<void>
}

export function runInPage(options: PageRunOptions): PageRunProgress {
    const { label, split = "all", only = [], concurrency = 3, receiver = "http://localhost:8790/" } = options
    const prompts = (set.prompts as EvalPrompt[]).filter(
        (p) => (split === "all" || p.split === split) && (!only.length || only.includes(p.id) || only.includes(p.family)),
    )
    const progress: PageRunProgress = {
        label,
        total: prompts.length,
        done: 0,
        failed: 0,
        running: true,
        log: [],
        finished: Promise.resolve(),
    }
    const post = (route: string, body: unknown) =>
        fetch(new URL(route, receiver), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((r) => {
            if (!r.ok) throw new Error(`receiver ${route}: HTTP ${r.status}`)
        })

    progress.finished = (async () => {
        const config = getAIConfig()
        if (!config.textApiKey || !config.textModel) throw new Error("No model or API key in this browser's settings")
        const target = { appUrl: `${location.origin}/`, aiConfig: { ...config } }
        let next = 0
        const worker = async () => {
            while (next < prompts.length) {
                const prompt = prompts[next++]
                const g: Generation = await generate(target, prompt)
                await post("generation", { label, generation: g })
                progress.done++
                if (!g.xml) progress.failed++
                progress.log.push({ id: g.id, ok: Boolean(g.xml), seconds: g.seconds, failure: g.failure })
            }
        }
        await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
        let host = ""
        try {
            host = new URL(config.textBaseUrl).host
        } catch {
            // An unparsable base URL is recorded as unknown.
        }
        await post("done", { label, meta: { label, model: config.textModel, host, split } })
    })()
        .catch((error) => {
            progress.error = error instanceof Error ? error.message : String(error)
        })
        .finally(() => {
            progress.running = false
        })
    return progress
}
