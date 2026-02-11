import type { VariantProps } from "class-variance-authority"
import type React from "react"
import { Button, type buttonVariants } from "@/workspaces/flow/next/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/workspaces/flow/next/components/ui/tooltip"

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
    const title =
        typeof buttonProps.title === "string"
            ? buttonProps.title
            : tooltipContent

    const button = (
        <Button {...buttonProps} title={title}>
            {children}
        </Button>
    )

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {buttonProps.disabled ? (
                    <span className="inline-flex cursor-not-allowed">
                        {button}
                    </span>
                ) : (
                    button
                )}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-wrap">
                {tooltipContent}
            </TooltipContent>
        </Tooltip>
    )
}

