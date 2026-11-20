import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-fast ease-out-soft",
    // A small press, as on claude.ai.
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    "outline-none focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px]",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  ],
  {
    variants: {
      variant: {
        // Claude's buttons stay put on hover: the colour shifts, nothing
        // lifts. Disabled goes neutral rather than half-transparent.
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        // Clay: only for what the AI does (send, generate).
        brand:
          "bg-brand text-brand-foreground hover:bg-brand-hover disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-foreground/[0.05]",
        secondary:
          "bg-foreground/[0.06] text-foreground hover:bg-foreground/10",
        ghost:
          "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        link:
          "text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 text-[15px] has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
