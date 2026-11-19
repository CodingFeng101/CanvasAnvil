import { useEffect, useRef, useState } from "react";

/**
 * Scroll reveal for the portal (plan §2.5): an element gets `p-in` the first
 * time it is a quarter on screen, and CSS does the rest. One observer serves
 * the whole page.
 */
let observer: IntersectionObserver | null = null;
function sharedObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("p-in");
          observer?.unobserve(entry.target);
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
  }
  return observer;
}

/** Ref for an element that should fade/rise in once it scrolls into view. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("p-in");
      return;
    }
    const io = sharedObserver();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return ref;
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** True below the 960px breakpoint, where the sticky story stops pinning. */
export function useIsNarrow() {
  const query = "(max-width: 960px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/** Smooth-scroll the window to a section of the portal by its id. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}
