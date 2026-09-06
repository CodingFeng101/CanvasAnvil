import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Wraps the native textarea so a caller can still reach the element.
 *
 * The ref has to be forwarded: an auto-growing composer measures
 * `scrollHeight` on every keystroke, and a ref that silently stays null
 * leaves the box stuck at its minimum height with no warning at runtime.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-card flex field-sizing-content min-h-16 w-full rounded-lg border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "transition-[color,box-shadow,border-color,background-color,height] duration-fast ease-out-soft",
          "hover:border-border",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
