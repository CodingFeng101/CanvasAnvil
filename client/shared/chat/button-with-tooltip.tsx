import type { VariantProps } from "class-variance-authority"
import type React from "react"
import { Button, type buttonVariants } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

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
    // The native title doubles as the accessible hint when the tooltip cannot
    // open — an explicit title wins over the tooltip text.
    const title =
        typeof buttonProps.title === "string" && buttonProps.title.trim()
            ? buttonProps.title
            : tooltipContent

    const button = (
        <Button {...buttonProps} title={title}>
            {children}
        </Button>
    )

    return (
        <Tooltip>
            {/* A disabled button emits no pointer events, so the trigger needs
                a wrapper or the tooltip never opens on exactly the buttons
                whose reason for being disabled the user wants explained. */}
            <TooltipTrigger asChild>
                {buttonProps.disabled ? (
                    <span className="inline-flex cursor-not-allowed">{button}</span>
                ) : (
                    button
                )}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-wrap">{tooltipContent}</TooltipContent>
        </Tooltip>
    )
}
