import type { VariantProps } from "class-variance-authority"
import type React from "react"
import { Button, type buttonVariants } from "@/workspaces/cad/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/workspaces/cad/ui/tooltip"

interface ButtonWithTooltipProps
    extends React.ComponentProps<"button">,
        VariantProps<typeof buttonVariants> {
    tooltipContent: string
    children: React.ReactNode
    asChild?: boolean
}

export function ButtonWithTooltip({
    tooltipContent,
    children,
    ...buttonProps
}: ButtonWithTooltipProps) {
    const mergedTitle =
        typeof buttonProps.title === "string" && buttonProps.title.trim()
            ? buttonProps.title
            : tooltipContent;
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button {...buttonProps} title={mergedTitle}>{children}</Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-wrap">
                    {tooltipContent}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
