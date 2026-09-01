import { generateText } from "ai"
import { CHUNK_TOKEN_TARGET, SUMMARY_CONCURRENCY, cleanExtractedText, runWithConcurrency, splitByApproxTokens } from "./files"

/**
 * Condenses an uploaded document down to something that fits in a prompt.
 *
 * Short documents get one pass per chunk plus a merge; long ones fold
 * repeatedly until few enough summaries remain. A model that answers with a
 * refusal or a request for more input is retried once, then replaced by a
 * mechanical extract — a bad summary silently poisons the diagram that
 * follows, so it must never reach the prompt.
 */

export async function summarizeChunk(model: any, chunk: string): Promise<string> {
    return generateSummaryWithRetry({
        model,
        system:
            "R - Role\nYou are a strict summarizer.\n\nI - Instructions\nOutput only direct summary text.\n\nE - End Goal\nProduce a concise faithful summary.\n\nN - Narrowing\nNo questions. No instructions. No extra framing.",
        user: `任务：仅根据下述文本输出摘要（<=300字）。禁止提问、禁止让用户补充内容、禁止输出模板化客套。\n\n文本：\n${chunk}`,
        maxOutputTokens: 600,
        maxChars: 300,
        fallbackSource: chunk,
    })
}

export function extractiveFallbackSummary(source: string, maxChars: number): string {
    const cleaned = cleanExtractedText(String(source || ""))
        .replace(/\s+/g, " ")
        .trim()
    if (!cleaned) return ""
    const sentences = cleaned
        .split(/(?<=[。！？.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    const out: string[] = []
    let total = 0
    for (const s of sentences) {
        if (s.length < 10) continue
        if (total + s.length > maxChars) break
        out.push(s)
        total += s.length + 1
        if (out.length >= 6) break
    }
    if (out.length > 0) return out.join(" ")
    return cleaned.slice(0, maxChars)
}

export function sanitizeSummaryText(summary: string, fallbackSource: string, maxChars: number): string {
    const text = String(summary || "").trim()
    if (!text) return extractiveFallbackSummary(fallbackSource, maxChars)
    const bannedPatterns = [
        /请提供/i,
        /请粘贴/i,
        /需要合并/i,
        /如有偏好/i,
        /目标读者/i,
        /是否保留术语/i,
        /是否需要强调/i,
        /I can|please provide|paste|preference/i,
    ]
    if (bannedPatterns.some((p) => p.test(text))) {
        return extractiveFallbackSummary(fallbackSource, maxChars)
    }
    return text.slice(0, Math.max(120, maxChars))
}

export function isBadSummaryText(text: string): boolean {
    const t = String(text || "").trim()
    if (!t) return true
    return [
        /请提供/i,
        /请粘贴/i,
        /需要合并/i,
        /如有偏好/i,
        /是否保留术语/i,
        /please provide|paste/i,
    ].some((p) => p.test(t))
}

export async function generateSummaryWithRetry(args: {
    model: any
    system: string
    user: string
    maxOutputTokens: number
    maxChars: number
    fallbackSource: string
}): Promise<string> {
    for (let i = 0; i < 2; i++) {
        const r = await generateText({
            model: args.model,
            messages: [
                { role: "system" as const, content: args.system },
                { role: "user" as const, content: args.user },
            ],
            maxOutputTokens: args.maxOutputTokens,
        })
        const text = sanitizeSummaryText(
            String(r.text || "").trim(),
            args.fallbackSource,
            args.maxChars,
        )
        if (!isBadSummaryText(text)) return text
    }
    return extractiveFallbackSummary(args.fallbackSource, args.maxChars)
}

export async function summarizeBlockMethod(args: { model: any; text: string }): Promise<string> {
    const chunks = splitByApproxTokens(args.text, CHUNK_TOKEN_TARGET)
    const partial = await runWithConcurrency(
        chunks,
        SUMMARY_CONCURRENCY,
        (chunk) => summarizeChunk(args.model, chunk),
    )
    const merged = partial.filter(Boolean).join("\n")
    return generateSummaryWithRetry({
        model: args.model,
        system:
            "R - Role\nYou merge chunk summaries.\n\nI - Instructions\nOutput only concise faithful summary text.\n\nE - End Goal\nProduce one merged summary.\n\nN - Narrowing\nNo questions. No instructions. No extra framing.",
        user: `任务：将以下分块摘要合并为完整摘要（<=1000字）。禁止提问、禁止请求补充材料，仅输出摘要正文。\n\n${merged}`,
        maxOutputTokens: 1800,
        maxChars: 1000,
        fallbackSource: merged,
    })
}

export async function summarizeRecursiveMethod(args: { model: any; text: string }): Promise<string> {
    const baseChunks = splitByApproxTokens(args.text, 3000)
    let level = await runWithConcurrency(
        baseChunks,
        SUMMARY_CONCURRENCY,
        (chunk) => summarizeChunk(args.model, chunk),
    )
    level = level.filter(Boolean)

    while (level.length > 2) {
        const groups: string[] = []
        for (let i = 0; i < level.length; i += 5) {
            groups.push(level.slice(i, i + 5).join("\n"))
        }
        level = await runWithConcurrency(
            groups,
            SUMMARY_CONCURRENCY,
            async (group) =>
                generateSummaryWithRetry({
                    model: args.model,
                    system:
                        "R - Role\nYou merge summaries into a higher-level summary.\n\nI - Instructions\nOutput only summary text.\n\nE - End Goal\nProduce one higher-level merged summary.\n\nN - Narrowing\nNo questions. No instructions. No extra framing.",
                    user: `任务：把这组摘要提炼成更高层摘要（<=350字）。禁止提问、禁止让用户补充，只输出摘要。\n\n${group}`,
                    maxOutputTokens: 800,
                    maxChars: 350,
                    fallbackSource: group,
                }),
        )
        level = level.filter(Boolean)
    }

    return generateSummaryWithRetry({
        model: args.model,
        system:
            "R - Role\nYou produce final executive summaries.\n\nI - Instructions\nKeep hierarchical fidelity and avoid hallucination. Output only summary text.\n\nE - End Goal\nProduce one final executive summary.\n\nN - Narrowing\nNo questions. No requests for more info. No extra framing.",
        user: `任务：输出最终摘要（<=1000字）。禁止提问、禁止请求更多信息，仅输出摘要正文。\n\n${level.join("\n")}`,
        maxOutputTokens: 1800,
        maxChars: 1000,
        fallbackSource: level.join("\n"),
    })
}
