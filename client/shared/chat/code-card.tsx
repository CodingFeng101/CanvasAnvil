import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Play, X } from "lucide-react";
import { Highlight } from "prism-react-renderer";
import { syntaxTheme } from "@/shared/chat/syntax-theme";
import { formatCodeForDisplay, toPrismLanguage } from "@/shared/chat/code-format";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage } from "@/shared/i18n";

/**
 * The code block the assistant's replies render into, shared by the canvases.
 *
 * CAD and Flow had grown two of these. CAD's laid the code out -- indented XML,
 * re-serialised JSON -- inside a titled card; Flow's dumped the model's raw
 * single-line XML into a bare `<pre>` with `break-all`, which turns a draw.io
 * document into an unreadable wall of characters. The two also disagreed on
 * where the copy and apply buttons live. One component, one answer.
 */

const ACTION_CLASS =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors duration-fast ease-out-soft hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

/** Copy, with the same three states and the same shape everywhere. */
export function CopyCodeButton({ code, className }: { code: string; className?: string }) {
    const uiLang = useUiLanguage();
    const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);

    const run = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setFailed(false);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setFailed(true);
            setCopied(false);
            setTimeout(() => setFailed(false), 1500);
        }
    };

    return (
        <button
            type="button"
            onClick={run}
            className={cn(ACTION_CLASS, className)}
            title={copied ? tr("已复制", "Copied") : failed ? tr("复制失败", "Copy failed") : tr("复制代码", "Copy code")}
        >
            {copied ? (
                <Check className="h-3 w-3 text-success" />
            ) : failed ? (
                <X className="h-3 w-3 text-destructive" />
            ) : (
                <Copy className="h-3 w-3" />
            )}
            <span>{copied ? tr("已复制", "Copied") : tr("复制", "Copy")}</span>
        </button>
    );
}

export type ApplyCode = (
    code: string,
    language: string,
) => void | boolean | Promise<void | boolean>;

/** Apply to canvas. A falsy `onApply` renders nothing at all. */
export function ApplyCodeButton({
    code,
    language,
    onApply,
    className,
}: {
    code: string;
    language: string;
    onApply?: ApplyCode;
    className?: string;
}) {
    const uiLang = useUiLanguage();
    const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState(false);
    const [failed, setFailed] = useState(false);

    if (!onApply) return null;

    const run = async () => {
        if (applying) return;
        try {
            setApplying(true);
            const result = await onApply(code, language);
            if (result === false) {
                setFailed(true);
                setApplied(false);
                setTimeout(() => setFailed(false), 1500);
                return;
            }
            setApplied(true);
            setFailed(false);
            setTimeout(() => setApplied(false), 1500);
        } catch {
            setFailed(true);
            setApplied(false);
            setTimeout(() => setFailed(false), 1500);
        } finally {
            setApplying(false);
        }
    };

    return (
        <button
            type="button"
            onClick={run}
            disabled={applying}
            className={cn(ACTION_CLASS, className)}
            title={applied ? tr("已应用", "Applied") : failed ? tr("应用失败", "Apply failed") : tr("应用到画布", "Apply to canvas")}
        >
            {applying ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : applied ? (
                <Check className="h-3 w-3 text-success" />
            ) : failed ? (
                <X className="h-3 w-3 text-destructive" />
            ) : (
                <Play className="h-3 w-3" />
            )}
            <span>{applying ? tr("应用中", "Applying") : applied ? tr("已应用", "Applied") : tr("应用", "Apply")}</span>
        </button>
    );
}

/** Collapsed state survives a re-render, keyed by the block's identity. */
const openStateById = new Map<string, boolean>();

export interface CodeCardProps {
    code: string;
    language?: string;
    /** Header label. Ignored when `framed` is false. */
    title?: ReactNode;
    /** Header glyph. Ignored when `framed` is false. */
    icon?: ReactNode;
    isStreaming?: boolean;
    blockId?: string;
    onApply?: ApplyCode;
    /**
     * `false` drops the card chrome and keeps only the action row and the code,
     * for blocks that already sit inside a titled panel.
     */
    framed?: boolean;
    defaultExpanded?: boolean;
    className?: string;
}

export function CodeCard({
    code,
    language = "xml",
    title,
    icon,
    isStreaming = false,
    blockId,
    onApply,
    framed = true,
    defaultExpanded = true,
    className,
}: CodeCardProps) {
    const uiLang = useUiLanguage();
    const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
    const [isExpanded, setIsExpanded] = useState(() => {
        if (blockId && openStateById.has(blockId)) return Boolean(openStateById.get(blockId));
        return defaultExpanded;
    });

    const normalizedLanguage = useMemo(() => (language || "text").toLowerCase(), [language]);
    const normalizedCode = useMemo(() => String(code ?? ""), [code]);
    const prismLanguage = useMemo(() => toPrismLanguage(normalizedLanguage), [normalizedLanguage]);
    const displayCode = useMemo(
        () => formatCodeForDisplay(normalizedCode, prismLanguage),
        [normalizedCode, prismLanguage],
    );

    const setExpanded = (next: boolean) => {
        setIsExpanded(next);
        if (blockId) openStateById.set(blockId, next);
    };

    const actions = (
        <>
            <ApplyCodeButton code={normalizedCode} language={normalizedLanguage} onApply={onApply} />
            <CopyCodeButton code={normalizedCode} />
        </>
    );

    const body = (
        <Highlight theme={syntaxTheme} code={displayCode} language={prismLanguage}>
            {({ style, tokens, getLineProps, getTokenProps }) => (
                <pre
                    className="scrollbar-thin max-h-48 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
                    style={{
                        ...style,
                        backgroundColor: "transparent",
                        margin: 0,
                        padding: 0,
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })} style={{ wordBreak: "break-word" }}>
                            {line.map((token, key) => (
                                <span key={key} {...getTokenProps({ token })} />
                            ))}
                        </div>
                    ))}
                </pre>
            )}
        </Highlight>
    );

    if (!framed) {
        return (
            <div className={cn("w-full min-w-0 overflow-hidden", className)}>
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {normalizedLanguage}
                    </span>
                    <div className="flex items-center gap-1">{actions}</div>
                </div>
                {body}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "my-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-muted/30",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-2 bg-muted/50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    {icon && (
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-strong">
                            {icon}
                        </div>
                    )}
                    <span className="truncate text-sm font-medium text-foreground/80">
                        {title ?? normalizedLanguage.toUpperCase()}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isStreaming ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                        <span className="rounded-full bg-success/[0.08] px-2 py-0.5 text-xs font-medium text-success">
                            {tr("完成", "Complete")}
                        </span>
                    )}
                    <div className="flex items-center gap-1">
                        {actions}
                        <button
                            type="button"
                            onClick={() => setExpanded(!isExpanded)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? tr("收起代码", "Collapse code") : tr("展开代码", "Expand code")}
                            className="rounded p-1 transition-colors duration-fast ease-out-soft hover:bg-muted"
                        >
                            {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {normalizedLanguage}
                    </div>
                    {body}
                </div>
            )}
        </div>
    );
}
