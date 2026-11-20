import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * One hover hint for the app's icon-only buttons, in the same dark pill as the
 * Radix tooltips: hovering (or keyboard-focusing) one shows what it does
 * after a short pause, until it has been clicked once. The native title is lifted off while the hint shows,
 * so the browser's own yellow box doesn't appear as well.
 *
 * Buttons that already carry a Radix tooltip are left to it.
 */

const DELAY = 450;
const SELECTOR = 'button, [role="button"], a[href], [role="switch"], [role="tab"], [role="menuitem"]';

interface Hint {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

/**
 * Only buttons that are just an icon get a hint: a button with words on it
 * already says what it does. A button can opt in with `data-hint`.
 */
function labelFor(el: HTMLElement): string {
  // Things that show their own preview (the conversation outline) opt out.
  if (el.closest("[data-no-hint]")) return "";
  // Its menu is open: the menu says it all.
  if (el.getAttribute("aria-expanded") === "true") return "";
  const iconOnly = !(el.textContent || "").trim();
  if (!iconOnly && !el.hasAttribute("data-hint")) return "";
  const title = el.getAttribute("title") || el.dataset.hintTitle || "";
  if (title.trim()) return title.trim();
  return (el.getAttribute("aria-label") || "").trim();
}

export function HoverHints() {
  const [hint, setHint] = useState<Hint | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef(0);
  /** Buttons already clicked: they have been learnt, so no more hints for them. */
  const clicked = useRef(new WeakSet<HTMLElement>());

  useEffect(() => {
    const restoreTitle = (el: HTMLElement | null) => {
      if (el?.dataset.hintTitle !== undefined) {
        if (!el.hasAttribute("title")) el.setAttribute("title", el.dataset.hintTitle);
        delete el.dataset.hintTitle;
      }
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      restoreTitle(target.current);
      target.current = null;
      setHint(null);
    };
    const show = (el: HTMLElement) => {
      if (target.current === el) return;
      hide();
      target.current = el;
      // Lift the native title now, or the browser shows its own box after ~1s
      // (also on buttons that get no hint at all).
      const title = el.getAttribute("title");
      if (title) {
        el.dataset.hintTitle = title;
        el.removeAttribute("title");
      }
      const text = clicked.current.has(el) ? "" : labelFor(el);
      if (!text) return;
      timer.current = window.setTimeout(() => {
        if (target.current !== el || !el.isConnected) return;
        // A Radix tooltip is already saying it.
        if (document.querySelector('[data-slot="tooltip-content"]')) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setHint({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, DELAY);
    };
    const over = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!el) {
        if (target.current) hide();
        return;
      }
      show(el);
    };
    const out = (e: MouseEvent) => {
      if (!target.current) return;
      const to = e.relatedTarget as Node | null;
      if (to && target.current.contains(to)) return;
      hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.matches?.(":focus-visible") && el.matches(SELECTOR)) show(el);
    };
    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("focusin", focusIn, true);
    document.addEventListener("focusout", hide, true);
    const press = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el) clicked.current.add(el);
      hide();
      // Still over it: keep its title lifted so the browser's own box stays away too.
      if (el) show(el);
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("focusin", focusIn, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!hint) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[200] max-w-[260px] rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-soft animate-in fade-in-0 zoom-in-95 duration-fast"
      style={{
        left: Math.min(Math.max(hint.x, 70), window.innerWidth - 70),
        top: hint.y,
        transform: `translate(-50%, ${hint.below ? "0" : "-100%"})`,
      }}
    >
      {hint.text}
    </div>,
    document.body,
  );
}
