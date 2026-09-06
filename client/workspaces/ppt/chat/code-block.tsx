import { useMemo, useRef, useState } from 'react';
import { Highlight } from "prism-react-renderer";
import { syntaxTheme } from "@/shared/chat/syntax-theme";
import { toPrismLanguage } from "@/shared/chat/code-format";
import { Shimmer } from "@/shared/chat/shimmer";
import { useUiLanguage } from "@/shared/i18n";
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface CodeBlockProps {
    code: string;
    language?: string;
    isStreaming?: boolean;
    blockId?: string;
}

const openStateById = new Map<string, boolean>();

export function CodeBlock({ code, language = "xml", isStreaming = false, blockId }: CodeBlockProps) {
    const uiLang = useUiLanguage();
    const [isOpen, setIsOpen] = useState(() => {
        if (blockId && openStateById.has(blockId)) return Boolean(openStateById.get(blockId));
        return false;
    });
    const preRef = useRef<HTMLPreElement | null>(null);
    const normalizedLanguage = useMemo(() => (language || "text").toLowerCase(), [language]);
    const normalizedCode = useMemo(() => String(code ?? ""), [code]);
    const prismLanguage = useMemo(() => toPrismLanguage(normalizedLanguage), [normalizedLanguage]);
    
    const setOpen = (open: boolean) => {
        setIsOpen(open);
        if (blockId) openStateById.set(blockId, open);
    };

    return (
        <div className="w-full my-2 border border-border/50 rounded-lg bg-sunken overflow-hidden shadow-sm">
            <button
                type="button"
                onClick={() => setOpen(!isOpen)}
                className="flex items-center gap-2 w-full p-2.5 cursor-pointer hover:bg-accent transition-colors text-xs font-medium text-muted-foreground select-none bg-muted/70"
            >
                <ChevronRight className={cn("w-4 h-4 transition-transform duration-200 text-muted-foreground", isOpen && "rotate-90")} />
                
                <span className="uppercase font-semibold tracking-wider text-foreground/80">{normalizedLanguage}</span>
                
                {isStreaming ? (
                    // Same in-progress idiom as the chat's "thinking" line, and
                    // translated -- this was the one hardcoded English string
                    // left in the panel.
                    <span className="ml-auto">
                        <Shimmer as="span" className="text-[10px]" duration={1.6}>
                            {uiLang === "zh" ? "正在生成代码..." : "Generating code..."}
                        </Shimmer>
                    </span>
                ) : (
                    <span className="ml-auto text-[10px] opacity-70 font-mono">{normalizedCode.length} chars</span>
                )}
            </button>
            
            {isOpen && (
                <div className="p-0 border-t border-border/50">
                     <div className="overflow-hidden w-full bg-sunken">
                        <Highlight theme={syntaxTheme} code={normalizedCode} language={prismLanguage}>
                            {({
                                style,
                                tokens,
                                getLineProps,
                                getTokenProps,
                            }) => (
                                <pre
                                    ref={preRef}
                                    className="text-[11px] leading-relaxed overflow-x-hidden overflow-y-auto overscroll-contain max-h-[500px] scrollbar-thin p-3 whitespace-pre-wrap break-words font-mono"
                                    style={{
                                        ...style,
                                        backgroundColor: "transparent",
                                        margin: 0,
                                    }}
                                    onWheelCapture={(e) => {
                                        const el = preRef.current;
                                        if (!el) return;
                                        const atTop = el.scrollTop <= 0;
                                        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                                        const dy = e.deltaY;
                                        if (dy > 0 && !atBottom) e.stopPropagation();
                                        if (dy < 0 && !atTop) e.stopPropagation();
                                    }}
                                >
                                    {tokens.map((line, i) => {
                                        const lineProps = getLineProps({ line });
                                        return (
                                            <div
                                                key={i}
                                                {...lineProps}
                                                className={cn("grid grid-cols-[3.25rem_1fr] gap-0", lineProps?.className)}
                                            >
                                                <span className="select-none text-muted-foreground/70 text-right pr-4">{i + 1}</span>
                                                <span className="min-w-0 whitespace-pre-wrap break-words">
                                                    {line.map((token, key) => (
                                                        <span key={key} {...getTokenProps({ token })} />
                                                    ))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </pre>
                            )}
                        </Highlight>
                    </div>
                </div>
            )}
        </div>
    );
}
