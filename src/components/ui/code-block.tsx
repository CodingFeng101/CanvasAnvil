import React, { useState, useEffect } from 'react';
import { Highlight, themes } from "prism-react-renderer";
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CodeBlockProps {
    code: string;
    language?: string;
    isStreaming?: boolean; // New prop to indicate if content is actively streaming
}

export function CodeBlock({ code, language = "xml", isStreaming = false }: CodeBlockProps) {
    // Default to closed (false) initially
    // If it's streaming, we keep it closed but show spinner.
    const [isOpen, setIsOpen] = useState(false);
    
    // Auto-open if it's a very short snippet? No, user said "always collapsed".
    // But we might want to ensure the code block updates even if closed.
    
    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full my-2 border border-border/50 rounded-lg bg-zinc-900 overflow-hidden group shadow-sm"
        >
            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2.5 cursor-pointer hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-400 select-none bg-zinc-900/50">
                <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-90")} />
                
                <span className="uppercase font-semibold tracking-wider text-zinc-300">{language}</span>
                
                {isStreaming ? (
                    <div className="flex items-center gap-2 ml-auto">
                         <span className="text-[10px] text-blue-400 animate-pulse">Generating code...</span>
                         <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    </div>
                ) : (
                    <span className="ml-auto text-[10px] opacity-70 font-mono">{code.length} chars</span>
                )}
            </CollapsibleTrigger>
            
            <CollapsibleContent>
                <div className="p-0 border-t border-border/50">
                     <div className="overflow-hidden w-full bg-zinc-950/50">
                        <Highlight theme={themes.github} code={code} language={language}>
                            {({
                                className: _className,
                                style,
                                tokens,
                                getLineProps,
                                getTokenProps,
                            }) => (
                                <pre
                                    className="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto max-h-[500px] scrollbar-thin p-3"
                                    style={{
                                        ...style,
                                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                                        backgroundColor: "transparent",
                                        margin: 0,
                                    }}
                                >
                                    {tokens.map((line, i) => (
                                        <div
                                            key={i}
                                            {...getLineProps({ line })}
                                            style={{ display: 'table-row' }}
                                        >
                                            <span className="table-cell select-none text-zinc-600 text-right pr-4 w-8">{i + 1}</span>
                                            <span className="table-cell">
                                                {line.map((token, key) => (
                                                    <span
                                                        key={key}
                                                        {...getTokenProps({ token })}
                                                    />
                                                ))}
                                            </span>
                                        </div>
                                    ))}
                                </pre>
                            )}
                        </Highlight>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
