/**
 * Receive the diagrams an in-page eval run (browser.ts) generates, save them
 * like run.ts does, and score the run when the page says it is done.
 *
 *   npx tsx tools/eval/diagram/receive.ts      (EVAL_RECEIVER_PORT, default 8790)
 *
 * Listens on localhost only and accepts requests from localhost pages only.
 */

import { mkdirSync } from "node:fs"
import http from "node:http"
import path from "node:path"
import type { Generation } from "./conversation"
import { saveGeneration, writeGenerations } from "./run"
import { outRoot, scoreRun } from "./score"

const port = Number(process.env.EVAL_RECEIVER_PORT) || 8790
const runs = new Map<string, Generation[]>()

const safeLabel = (label: unknown) => {
    const s = String(label ?? "")
    if (!/^[\w.-]{1,80}$/.test(s)) throw new Error("label must be letters, digits, '.', '_' or '-'")
    return s
}

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || ""
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
    if (origin && !local) {
        res.writeHead(403).end()
        return
    }
    if (origin) {
        res.setHeader("access-control-allow-origin", origin)
        res.setHeader("access-control-allow-headers", "content-type")
        res.setHeader("access-control-allow-methods", "POST")
    }
    if (req.method === "OPTIONS") {
        res.writeHead(204).end()
        return
    }
    if (req.method !== "POST") {
        res.writeHead(405).end()
        return
    }
    try {
        let body = ""
        for await (const chunk of req) body += chunk
        const data = JSON.parse(body)
        const label = safeLabel(data.label)
        const dir = path.join(outRoot, label)
        mkdirSync(dir, { recursive: true })
        if (req.url === "/generation") {
            const g = data.generation as Generation
            safeLabel(g.id)
            saveGeneration(dir, g)
            const list = runs.get(label) || []
            list.push(g)
            runs.set(label, list)
            console.log(`[${label}] ${g.id} ${g.xml ? `ok in ${g.seconds}s` : `FAILED: ${g.failure}`}`)
        } else if (req.url === "/done") {
            writeGenerations(dir, { ...data.meta, label, at: new Date().toISOString() }, runs.get(label) || [])
            const results = await scoreRun(label)
            console.log(`[${label}] scored ${results.length} prompts`)
            console.log(`Summarise with: npx tsx tools/eval/diagram/report.ts ${label}`)
        } else {
            res.writeHead(404).end()
            return
        }
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}')
    } catch (error) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(error) }))
    }
})

server.listen(port, "127.0.0.1", () => console.log(`Eval receiver on http://localhost:${port}/`))
