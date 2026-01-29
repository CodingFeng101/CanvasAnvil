import React, { useMemo, useRef, useState } from 'react';
import { Highlight, themes } from "prism-react-renderer";
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CodeBlockProps {
    code: string;
    language?: string;
    isStreaming?: boolean; // New prop to indicate if content is actively streaming
    blockId?: string;
}

const openStateById = new Map<string, boolean>();

export function CodeBlock({ code, language = "xml", isStreaming = false, blockId }: CodeBlockProps) {
    const [isOpen, setIsOpen] = useState(() => {
        if (blockId && openStateById.has(blockId)) return Boolean(openStateById.get(blockId));
        return false;
    });
    const preRef = useRef<HTMLPreElement | null>(null);
    const normalizedLanguage = useMemo(() => (language || "text").toLowerCase(), [language]);
    const normalizedCode = useMemo(() => String(code ?? ""), [code]);
    
    return (
        <Collapsible
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (blockId) openStateById.set(blockId, open);
            }}
            className="w-full my-2 border border-border/50 rounded-lg bg-zinc-50 overflow-hidden group shadow-sm"
        >
            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2.5 cursor-pointer hover:bg-zinc-100 transition-colors text-xs font-medium text-zinc-600 select-none bg-zinc-100/70">
                <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-90")} />
                
                <span className="uppercase font-semibold tracking-wider text-zinc-700">{normalizedLanguage}</span>
                
                {isStreaming ? (
                    <div className="flex items-center gap-2 ml-auto">
                         <span className="text-[10px] text-blue-600 animate-pulse">Generating code...</span>
                         <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <span className="ml-auto text-[10px] opacity-70 font-mono">{normalizedCode.length} chars</span>
                )}
            </CollapsibleTrigger>
            
            <CollapsibleContent>
                <div className="p-0 border-t border-border/50">
                     <div className="overflow-hidden w-full bg-zinc-50">
                        <Highlight theme={themes.github} code={normalizedCode} language={normalizedLanguage as any}>
                            {({
                                className: _className,
                                style,
                                tokens,
                                getLineProps,
                                getTokenProps,
                            }) => (
                                <pre
                                    ref={preRef}
                                    className="text-[11px] leading-relaxed overflow-x-hidden overflow-y-auto overscroll-contain max-h-[500px] scrollbar-thin p-3 whitespace-pre-wrap break-words"
                                    style={{
                                        ...style,
                                        fontFamily: "var(--font-mono), ui-monospace, monospace",
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
                                                <span className="select-none text-zinc-400 text-right pr-4">{i + 1}</span>
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
            </CollapsibleContent>
        </Collapsible>
    );
}
