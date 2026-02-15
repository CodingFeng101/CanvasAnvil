import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Cpu, Play, X } from "lucide-react";
import { Highlight, themes, type Language } from "prism-react-renderer";
import { useUiLanguage } from "@/lib/use-ui-language";

interface CodeBlockProps {
    code: string;
    language?: string;
    isStreaming?: boolean;
    blockId?: string;
    onApply?: (code: string, language: string) => void | boolean | Promise<void | boolean>;
}

const openStateById = new Map<string, boolean>();

function formatXmlLike(input: string): string {
    const source = String(input || "").trim();
    if (!source) return source;

    const normalized = source.replace(/\r\n/g, "\n").replace(/>\s*</g, ">\n<");
    const lines = normalized.split("\n");
    let indent = 0;
    const unit = "  ";

    return lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            if (/^<\//.test(line)) indent = Math.max(indent - 1, 0);
            const formatted = `${unit.repeat(indent)}${line}`;

            const isOpeningTag =
                /^<[^!?/][^>]*>$/.test(line) &&
                !/\/>$/.test(line) &&
                !/^<[^>]+>.*<\/[^>]+>$/.test(line);
            if (isOpeningTag) indent += 1;

            return formatted;
        })
        .join("\n");
}

export function CodeBlock({
    code,
    language = "xml",
    isStreaming: _isStreaming = false,
    blockId: _blockId,
    onApply,
}: CodeBlockProps) {
    const uiLang = useUiLanguage();
    const tr = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText);
    const [isExpanded, setIsExpanded] = useState(() => {
        if (_blockId && openStateById.has(_blockId)) return Boolean(openStateById.get(_blockId));
        return true;
    });
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState(false);
    const [applyFailed, setApplyFailed] = useState(false);
    const normalizedLanguage = useMemo(() => (language || "text").toLowerCase(), [language]);
    const normalizedCode = useMemo(() => String(code ?? ""), [code]);
    const prismLanguage = useMemo<Language>(() => {
        const lang = normalizedLanguage;
        if (lang === "svg") return "xml";
        if (lang === "yml") return "yaml";
        if (lang === "shell" || lang === "sh" || lang === "zsh") return "bash";
        if (lang === "ts") return "typescript";
        if (lang === "tsx") return "tsx";
        if (lang === "js") return "javascript";
        if (lang === "md") return "markdown";
        const allowed = new Set([
            "text",
            "xml",
            "json",
            "javascript",
            "typescript",
            "tsx",
            "jsx",
            "python",
            "bash",
            "yaml",
            "markdown",
            "css",
            "html",
        ]);
        if (allowed.has(lang)) return lang as Language;
        return "text";
    }, [normalizedLanguage]);

    const displayCode = useMemo(() => {
        if (prismLanguage === "xml" || prismLanguage === "html") {
            return formatXmlLike(normalizedCode);
        }
        if (prismLanguage === "json") {
            try {
                return JSON.stringify(JSON.parse(normalizedCode), null, 2);
            } catch {
                return normalizedCode;
            }
        }
        return normalizedCode;
    }, [normalizedCode, prismLanguage]);

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(normalizedCode);
            setCopied(true);
            setCopyFailed(false);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopyFailed(true);
            setCopied(false);
            setTimeout(() => setCopyFailed(false), 1500);
        }
    };

    const applyCode = async () => {
        if (!onApply || applying) return;
        try {
            setApplying(true);
            const result = await onApply(normalizedCode, normalizedLanguage);
            if (result === false) {
                setApplyFailed(true);
                setApplied(false);
                setTimeout(() => setApplyFailed(false), 1500);
                return;
            }
            setApplied(true);
            setApplyFailed(false);
            setTimeout(() => setApplied(false), 1500);
        } catch {
            setApplyFailed(true);
            setApplied(false);
            setTimeout(() => setApplyFailed(false), 1500);
        } finally {
            setApplying(false);
        }
    };

    const setExpanded = (next: boolean) => {
        setIsExpanded(next);
        if (_blockId) openStateById.set(_blockId, next);
    };

    return (
        <div className="my-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-muted/30">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <Cpu className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">{tr("生成 CAD", "Generate CAD")}</span>
                </div>
                <div className="flex items-center gap-2">
                    {_isStreaming ? (
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            {tr("完成", "Complete")}
                        </span>
                    )}
                    <div className="flex items-center gap-1">
                        {onApply && (
                            <button
                                type="button"
                                onClick={applyCode}
                                disabled={applying}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                title={applied ? tr("已应用", "Applied") : applyFailed ? tr("应用失败", "Apply failed") : tr("应用到画布", "Apply to canvas")}
                            >
                                {applying ? (
                                    <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                ) : applied ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                ) : applyFailed ? (
                                    <X className="h-3 w-3 text-red-500" />
                                ) : (
                                    <Play className="h-3 w-3" />
                                )}
                                <span>{applying ? tr("应用中", "Applying") : applied ? tr("已应用", "Applied") : tr("应用", "Apply")}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setExpanded(!isExpanded)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="px-4 py-3 border-t border-border/40 bg-muted/20">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] uppercase text-muted-foreground">{normalizedLanguage}</span>
                        <button
                            type="button"
                            onClick={copyCode}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                            title={
                                copied
                                    ? tr("已复制", "Copied")
                                    : copyFailed
                                      ? tr("复制失败", "Copy failed")
                                      : tr("复制代码", "Copy code")
                            }
                        >
                            {copied ? (
                                <Check className="h-3 w-3 text-green-500" />
                            ) : copyFailed ? (
                                <X className="h-3 w-3 text-red-500" />
                            ) : (
                                <Copy className="h-3 w-3" />
                            )}
                            <span>{copied ? tr("已复制", "Copied") : tr("复制", "Copy")}</span>
                        </button>
                    </div>
                    <Highlight theme={themes.github} code={displayCode} language={prismLanguage}>
                        {({
                            className: _className,
                            style,
                            tokens,
                            getLineProps,
                            getTokenProps,
                        }) => (
                            <pre
                                className="text-[11px] leading-relaxed overflow-x-hidden overflow-y-auto max-h-48 scrollbar-thin whitespace-pre-wrap break-words"
                                style={{
                                    ...style,
                                    fontFamily:
                                        "var(--font-mono), ui-monospace, monospace",
                                    backgroundColor: "transparent",
                                    margin: 0,
                                    padding: 0,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {tokens.map((line, i) => (
                                    <div
                                        key={i}
                                        {...getLineProps({ line })}
                                        style={{ wordBreak: "break-word" }}
                                    >
                                        {line.map((token, key) => (
                                            <span key={key} {...getTokenProps({ token })} />
                                        ))}
                                    </div>
                                ))}
                            </pre>
                        )}
                    </Highlight>
                </div>
            )}
        </div>
    );
}
