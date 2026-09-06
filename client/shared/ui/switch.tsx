"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/shared/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/30 dark:data-[state=unchecked]:bg-input/80 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent px-0.5 shadow-[inset_0_1px_2px_hsl(var(--shadow-hue)/0.10)] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        "transition-[background-color,box-shadow] duration-base ease-out-soft",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full shadow-xs ring-0 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
          // Slight overshoot so the thumb lands rather than slides to a stop.
          "transition-transform duration-base [transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

