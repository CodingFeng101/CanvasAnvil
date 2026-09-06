import { type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { motion } from "motion/react";
import { riseIn, scaleIn, staggerContainer } from "./tokens";

type MotionDivProps = ComponentPropsWithoutRef<typeof motion.div>;

/**
 * Mount entrance. Use for content that is already on screen when it appears —
 * a view that just became active, a panel that opened.
 */
export function Appear({
  children,
  variant = "rise",
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  variant?: "rise" | "scale";
  delay?: number;
} & MotionDivProps) {
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      exit="exit"
      variants={variant === "scale" ? scaleIn : riseIn}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scroll entrance. Fires once, slightly before the element reaches the
 * viewport edge so the motion is finishing as the reader arrives rather than
 * starting under their eye.
 */
export function Reveal({
  children,
  delay = 0,
  as,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
} & MotionDivProps) {
  const Component = as ? motion.create(as) : motion.div;

  return (
    <Component
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={riseIn}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * Wraps a run of `<StaggerItem>` children so they arrive in sequence.
 * `inView` switches the trigger from mount to scroll.
 */
export function Stagger({
  children,
  stagger,
  delay,
  inView = false,
  ...rest
}: {
  children: ReactNode;
  stagger?: number;
  delay?: number;
  inView?: boolean;
} & MotionDivProps) {
  return (
    <motion.div
      initial="hidden"
      {...(inView
        ? { whileInView: "shown", viewport: { once: true, margin: "0px 0px -12% 0px" } }
        : { animate: "shown" })}
      exit="exit"
      variants={staggerContainer(stagger, delay)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: { children: ReactNode } & MotionDivProps) {
  return (
    <motion.div variants={riseIn} {...rest}>
      {children}
    </motion.div>
  );
}
