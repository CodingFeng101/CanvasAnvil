import { isMinimalDiagram } from "./messages"

/**
 * Decides what the user is asking Flow for.
 *
 * A tweak to one node and a request for a whole new diagram need different
 * treatment: the first must preserve the existing XML, the second may replace
 * it. Getting this wrong silently discards the user's diagram, so an explicit
 * "regenerate" phrase always wins over the local-edit heuristics.
 */

export type FlowRequestRoute = "local_edit" | "full_generation"

let flowDeepThinkingImagePromptTemplateCache: string | null = null

export function normalizeIntentText(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

export function isLikelyLocalEditRequest(text: string): boolean {
    const normalized = normalizeIntentText(text)
    if (!normalized) return false

    const patterns = [
        /修改|改成|调整|优化|补充|添加|增加|删除|移除|替换|重命名|改颜色|移动|对齐|局部|节点|连线|箭头|文案/,
        /\b(edit|update|modify|adjust|tweak|refine|add|remove|delete|rename|move|reposition|change|fix|patch)\b/,
    ]

    return patterns.some((pattern) => pattern.test(normalized))
}

export function isExplicitFullRegenerationRequest(text: string): boolean {
    const normalized = normalizeIntentText(text)
    if (!normalized) return false

    const patterns = [
        /重新生成|重画|从头|全新|重做|整体重构|替换整个|重建|重新画|新建一个/,
        /\b(regenerate|from scratch|redraw|rebuild|replace the entire|new diagram|create a new)\b/,
    ]

    return patterns.some((pattern) => pattern.test(normalized))
}

export function classifyFlowRequest(params: {
    xml: string
    userText: string
}): FlowRequestRoute {
    if (isMinimalDiagram(params.xml || "")) return "full_generation"
    if (isExplicitFullRegenerationRequest(params.userText)) {
        return "full_generation"
    }
    if (isLikelyLocalEditRequest(params.userText)) return "local_edit"
    return "local_edit"
}

export function shouldRunDeepThinking(params: {
    deepThinkingEnabled: boolean
    route: FlowRequestRoute
}): boolean {
    if (!params.deepThinkingEnabled) return false
    return params.route === "full_generation"
}
