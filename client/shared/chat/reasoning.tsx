import { useControllableState } from "@radix-ui/react-use-controllable-state"
import { ChevronRightIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useRef, useState } from "react"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import { useUiLanguage } from "@/shared/i18n"
import { cn } from "@/shared/lib/utils"
import { getPreferences } from "@/shared/preferences"
import { Shimmer } from "@/shared/chat/shimmer"
import { AnvilMark } from "@/shared/chat/anvil-mark"

type ReasoningContextValue = {
    isStreaming: boolean
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    duration: number | undefined
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

export const useReasoning = () => {
    const context = useContext(ReasoningContext)
    if (!context) {
        throw new Error("Reasoning components must be used within Reasoning")
    }
    return context
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
    isStreaming?: boolean
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    duration?: number
}

const AUTO_CLOSE_DELAY = 1000
const MS_IN_S = 1000

export const Reasoning = memo(
    ({
        className,
        isStreaming = false,
        open,
        defaultOpen = true,
        onOpenChange,
        duration: durationProp,
        children,
        ...props
    }: ReasoningProps) => {
        const [isOpen, setIsOpen] = useControllableState({
            prop: open,
            defaultProp: defaultOpen,
            onChange: onOpenChange,
        })
        const [duration, setDuration] = useControllableState({
            prop: durationProp,
            defaultProp: undefined,
        })

        const [hasAutoClosed, setHasAutoClosed] = useState(false)
        const [startTime, setStartTime] = useState<number | null>(null)

        useEffect(() => {
            if (isStreaming) {
                if (startTime === null) {
                    setStartTime(Date.now())
                }
            } else if (startTime !== null) {
                setDuration(Math.ceil((Date.now() - startTime) / MS_IN_S))
                setStartTime(null)
            }
        }, [isStreaming, startTime, setDuration])

        useEffect(() => {
            // Settings → Canvas: "keep thinking open" leaves it as it is.
            if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed && !getPreferences().thinkingOpen) {
                const timer = setTimeout(() => {
                    setIsOpen(false)
                    setHasAutoClosed(true)
                }, AUTO_CLOSE_DELAY)

                return () => clearTimeout(timer)
            }
        }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosed])

        const handleOpenChange = (newOpen: boolean) => {
            setIsOpen(newOpen)
        }

        return (
            <ReasoningContext.Provider
                value={{ isStreaming, isOpen, setIsOpen, duration }}
            >
                <Collapsible
                    className={cn("not-prose mb-3", className)}
                    onOpenChange={handleOpenChange}
                    open={isOpen}
                    {...props}
                >
                    {children}
                </Collapsible>
            </ReasoningContext.Provider>
        )
    },
)

export type ReasoningTriggerProps = ComponentProps<
    typeof CollapsibleTrigger
> & {
    getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

export const ReasoningTrigger = memo(
    ({
        className,
        children,
        getThinkingMessage,
        ...props
    }: ReasoningTriggerProps) => {
        const { isStreaming, isOpen, duration } = useReasoning()
        const uiLang = useUiLanguage()
        const tr = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText)
        const fallbackGetThinkingMessage = (thinking: boolean, durationSec?: number) => {
            if (thinking || durationSec === 0) {
                return <Shimmer as="span" duration={1.4}>{tr("思考中…", "Thinking…")}</Shimmer>
            }
            if (durationSec === undefined) {
                return <span>{tr("已思考数秒", "Thought for a few seconds")}</span>
            }
            return <span>{tr(`已思考 ${durationSec} 秒`, `Thought for ${durationSec}s`)}</span>
        }
        const thinkingMessage = (getThinkingMessage || fallbackGetThinkingMessage)(isStreaming, duration)

        return (
            <CollapsibleTrigger
                className={cn(
                    "group/think inline-flex items-center gap-1.5 rounded-md py-0.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground",
                    className,
                )}
                {...props}
            >
                {children ?? (
                    <>
                        <ThinkingGlyph active={isStreaming} />
                        {thinkingMessage}
                        <ChevronRightIcon
                            className={cn(
                                "size-3.5 opacity-60 transition-transform duration-fast group-hover/think:opacity-100",
                                isOpen && "rotate-90",
                            )}
                        />
                    </>
                )}
            </CollapsibleTrigger>
        )
    },
)

/** The anvil, striking while the model thinks, at rest once it is done. */
function ThinkingGlyph({ active }: { active: boolean }) {
    return <AnvilMark active={active} className={cn("size-4", active ? "text-brand" : "text-muted-foreground")} />
}

export type ReasoningContentProps = ComponentProps<
    typeof CollapsibleContent
> & {
    children: string
}

export const ReasoningContent = memo(
    ({ className, children, ...props }: ReasoningContentProps) => {
        const { isStreaming } = useReasoning()
        const ref = useRef<HTMLDivElement>(null)
        // While it streams, keep the newest line in view inside the capped box.
        useEffect(() => {
            if (isStreaming && ref.current) ref.current.scrollTop = ref.current.scrollHeight
        }, [children, isStreaming])
        return (
            <CollapsibleContent
                className={cn(
                    "mt-1.5 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
                    className,
                )}
                {...props}
            >
                <div
                    ref={ref}
                    className={cn(
                        "ml-[6px] border-l-2 border-border/80 pl-3.5 text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap",
                        isStreaming && "max-h-[180px] overflow-y-auto scrollbar-thin [mask-image:linear-gradient(to_bottom,transparent,black_24px)]",
                    )}
                >
                    {children}
                </div>
            </CollapsibleContent>
        )
    },
)

Reasoning.displayName = "Reasoning"
ReasoningTrigger.displayName = "ReasoningTrigger"
ReasoningContent.displayName = "ReasoningContent"
