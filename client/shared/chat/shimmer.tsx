import { motion, useReducedMotion } from "motion/react"
import {
    type CSSProperties,
    type ElementType,
    type JSX,
    memo,
    useMemo,
} from "react"
import { cn } from "@/shared/lib/utils"

export type TextShimmerProps = {
    children: string
    as?: ElementType
    className?: string
    duration?: number
    spread?: number
}

/**
 * A travelling highlight for text that is still being produced.
 *
 * The colours come from the project's own tokens. The previous version
 * referenced `--color-background` / `--color-muted-foreground`, which Tailwind
 * only generates in v4; against this v3 build both resolved to nothing, so the
 * whole `background-image` was invalid and the element -- which is
 * `color: transparent` by design -- rendered as blank space. "Thinking..." was
 * literally invisible the entire time it was on screen.
 */
const ShimmerComponent = ({
    children,
    as: Component = "p",
    className,
    duration = 2,
    spread = 2,
}: TextShimmerProps) => {
    const reduceMotion = useReducedMotion()

    // Recreating this on every render would hand React a new component type
    // each time and remount the subtree.
    const MotionComponent = useMemo(
        () => motion.create(Component as keyof JSX.IntrinsicElements),
        [Component],
    )

    const dynamicSpread = useMemo(
        () => (children?.length ?? 0) * spread,
        [children, spread],
    )

    return (
        <MotionComponent
            animate={reduceMotion ? undefined : { backgroundPosition: "0% center" }}
            className={cn(
                "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
                "[--shimmer-base:hsl(var(--muted-foreground))] [--shimmer-peak:hsl(var(--foreground))]",
                "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--shimmer-peak),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
                className,
            )}
            initial={{ backgroundPosition: "100% center" }}
            style={
                {
                    "--spread": `${dynamicSpread}px`,
                    backgroundImage:
                        "var(--bg), linear-gradient(var(--shimmer-base), var(--shimmer-base))",
                } as CSSProperties
            }
            transition={
                reduceMotion
                    ? undefined
                    : {
                          repeat: Number.POSITIVE_INFINITY,
                          duration,
                          ease: "linear",
                      }
            }
        >
            {children}
        </MotionComponent>
    )
}

export const Shimmer = memo(ShimmerComponent)
