import type { Transition, Variants } from "motion/react";

/**
 * The whole app's motion vocabulary.
 *
 * Deliberately small. Every animation in the product should reach for one of
 * these rather than inventing its own numbers — that is the difference between
 * an interface that feels coherently alive and fifty files each guessing at a
 * duration.
 *
 * These mirror the `--dur-*` / `--ease-*` custom properties in index.css, so a
 * CSS transition and a JS tween on the same element land on the same curve.
 */

export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.34,
} as const;

/** Matches `--ease-out-soft`. Decelerating, no overshoot. */
export const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;
/** Matches `--ease-in-out-soft`. */
export const EASE_IN_OUT_SOFT = [0.65, 0, 0.35, 1] as const;

/**
 * Springs, ordered by how much mass the motion should imply.
 *
 * `snap` is for things that respond under the finger — buttons, toggles, tabs.
 * `soft` is the default for elements entering the page.
 * `gentle` is for large surfaces where a fast spring would read as a twitch.
 */
export const SPRING: Record<"snap" | "soft" | "gentle", Transition> = {
  snap: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
  gentle: { type: "spring", stiffness: 170, damping: 26, mass: 1 },
};

export const TWEEN: Record<"fast" | "base" | "slow", Transition> = {
  fast: { duration: DURATION.fast, ease: EASE_OUT_SOFT },
  base: { duration: DURATION.base, ease: EASE_OUT_SOFT },
  slow: { duration: DURATION.slow, ease: EASE_OUT_SOFT },
};

/* -------------------------------------------------------------------------- */
/* Variants                                                                   */
/* -------------------------------------------------------------------------- */

/** The default entrance: a short lift with a fade. 8px, not 40px. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: SPRING.soft },
  exit: { opacity: 0, y: -6, transition: TWEEN.fast },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: TWEEN.base },
  exit: { opacity: 0, transition: TWEEN.fast },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  shown: { opacity: 1, scale: 1, transition: SPRING.soft },
  exit: { opacity: 0, scale: 0.98, transition: TWEEN.fast },
};

/**
 * Container for a run of children that should arrive in sequence.
 *
 * 45ms apart: enough to read as a cascade, short enough that a list of eight
 * finishes inside a third of a second.
 */
export function staggerContainer(stagger = 0.045, delay = 0): Variants {
  return {
    hidden: {},
    shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
    exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
  };
}

/* -------------------------------------------------------------------------- */
/* Interaction presets                                                        */
/* -------------------------------------------------------------------------- */

/** Hover/press pair for cards. The press must undershoot the rest state. */
export const liftOnHover = {
  whileHover: { y: -3, transition: SPRING.snap },
  whileTap: { y: -1, scale: 0.99, transition: SPRING.snap },
} as const;

/** Hover/press pair for buttons and other small controls. */
export const pressable = {
  whileHover: { y: -1, transition: SPRING.snap },
  whileTap: { scale: 0.97, y: 0, transition: SPRING.snap },
} as const;
