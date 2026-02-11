"use client"

import { Check, Copy, X } from "lucide-react"
import { Highlight, themes } from "prism-react-renderer"
import { useState } from "react"

interface CodeBlockProps {
    code: string
    language?: "xml" | "json"
}

export function CodeBlock({ code, language = "xml" }: CodeBlockProps) {
    const [copied, setCopied] = useState(false)
    const [copyFailed, setCopyFailed] = useState(false)

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setCopyFailed(false)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            setCopyFailed(true)
            setCopied(false)
            setTimeout(() => setCopyFailed(false), 1500)
        }
    }

    return (
        <div className="overflow-hidden w-full">
            <div className="mb-1 flex justify-end">
                <button
                    type="button"
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                    title={
                        copied
                            ? "Copied"
                            : copyFailed
                              ? "Copy failed"
                              : "Copy code"
                    }
                >
                    {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                    ) : copyFailed ? (
                        <X className="h-3 w-3 text-red-500" />
                    ) : (
                        <Copy className="h-3 w-3" />
                    )}
                    <span>{copied ? "Copied" : "Copy"}</span>
                </button>
            </div>
            <Highlight theme={themes.github} code={code} language={language}>
                {({
                    className: _className,
                    style,
                    tokens,
                    getLineProps,
                    getTokenProps,
                }) => (
                    <pre
                        className="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto max-h-48 scrollbar-thin break-all"
                        style={{
                            ...style,
                            fontFamily:
                                "var(--font-mono), ui-monospace, monospace",
                            backgroundColor: "transparent",
                            margin: 0,
                            padding: 0,
                            wordBreak: "break-all",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {tokens.map((line, i) => (
                            <div
                                key={i}
                                {...getLineProps({ line })}
                                style={{ wordBreak: "break-all" }}
                            >
                                {line.map((token, key) => (
                                    <span
                                        key={key}
                                        {...getTokenProps({ token })}
                                    />
                                ))}
                            </div>
                        ))}
                    </pre>
                )}
            </Highlight>
        </div>
    )
}
