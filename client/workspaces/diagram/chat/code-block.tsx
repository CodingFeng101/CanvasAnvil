"use client"

import { Workflow } from "lucide-react"
import { CodeCard, type ApplyCode } from "@/shared/chat/code-card"
import { useUiLanguage } from "@/shared/i18n"

interface CodeBlockProps {
    code: string
    language?: "xml" | "json"
    onApply?: (code: string, language: "xml" | "json") => void | boolean | Promise<void | boolean>
    isStreaming?: boolean
    blockId?: string
    /**
     * These blocks appear in two places: on their own inside an assistant
     * reply, and nested inside a tool-call panel that already has its own
     * header. The nested one drops the card so the chat is not a box in a box.
     */
    framed?: boolean
}

/** The diagram canvas's framing of the shared code card. */
export function CodeBlock({
    code,
    language = "xml",
    onApply,
    isStreaming = false,
    blockId,
    framed = true,
}: CodeBlockProps) {
    const uiLang = useUiLanguage()
    return (
        <CodeCard
            code={code}
            language={language}
            isStreaming={isStreaming}
            blockId={blockId}
            framed={framed}
            onApply={onApply as ApplyCode | undefined}
            icon={<Workflow className="h-3.5 w-3.5" />}
            title={uiLang === "zh" ? "生成图表" : "Generate diagram"}
        />
    )
}
