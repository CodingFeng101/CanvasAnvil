import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/utils";

/**
 * The hover preview for anything that stands for something else -- a referenced work, a slide
 * named in the chat, a material chip in a slide's description: after a short pause, a card with
 * its picture(s) and words, the same card as the sidebar's recent works.
 *
 * An element opts in with `data-peek="<source>"`. The canvas that knows what it stands for
 * registers that source (`registerPeekSource`) and turns the element into the card's content;
 * chips built straight into the DOM (contenteditable inputs) work the same as React ones.
 * React-rendered things can instead hand their content over with `usePeek`.
 */

export interface PeekContent {
  /** Pictures, first one largest; up to four are shown. */
  images?: string[];
  title: string;
  /** A few lines of what it says (an outline's bullets, a work's items). */
  text?: string;
  /** Small print: where it is from, how many. */
  meta?: string;
}

type Resolver = (el: HTMLElement) => PeekContent | null;
const sources = new Map<string, Resolver>();

/** A canvas names what its marked elements stand for; returns an unregister. */
export function registerPeekSource(name: string, resolve: Resolver): () => void {
  sources.set(name, resolve);
  return () => {
    if (sources.get(name) === resolve) sources.delete(name);
  };
}

// Content handed over by React components, keyed by an id on their element.
const inline = new Map<string, PeekContent>();
let inlineSeed = 0;
sources.set("inline", (el) => inline.get(el.dataset.peekId ?? "") ?? null);

/** Spread the returned props on an element to give it a hover preview of `content`. */
export function usePeek(content: PeekContent | null): { "data-peek"?: string; "data-peek-id"?: string } {
  const [id] = useState(() => `peek-${++inlineSeed}`);
  useEffect(() => {
    if (content) inline.set(id, content);
    else inline.delete(id);
  });
  useEffect(() => () => void inline.delete(id), [id]);
  return content ? { "data-peek": "inline", "data-peek-id": id } : {};
}

const DELAY = 380;
const CARD_WIDTH = 264;

interface Shown {
  content: PeekContent;
  rect: DOMRect;
}

let shown: Shown | null = null;
const listeners = new Set<() => void>();
const set = (next: Shown | null) => {
  shown = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => shown;

/** Mounted once at the root: watches the pointer for marked elements. */
export function PeekHost() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      target.current = null;
      if (shown) set(null);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = (event.target as Element | null)?.closest?.<HTMLElement>("[data-peek]") ?? null;
      if (el === target.current) return;
      hide();
      if (!el) return;
      target.current = el;
      timer.current = window.setTimeout(() => {
        if (target.current !== el || !el.isConnected) return;
        const resolve = sources.get(el.dataset.peek ?? "");
        let content: PeekContent | null = null;
        try {
          content = resolve ? resolve(el) : null;
        } catch (error) {
          console.error("[peek] could not describe", el, error);
        }
        if (content && (content.title || content.images?.length)) set({ content, rect: el.getBoundingClientRect() });
      }, DELAY);
    };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!current) return null;
  return createPortal(<PeekCard content={current.content} rect={current.rect} />, document.body);
}

function PeekCard({ content, rect }: { content: PeekContent; rect: DOMRect }) {
  const images = (content.images ?? []).filter(Boolean).slice(0, 4);
  const pictureHeight = images.length ? 140 : 0;
  // Roughly how tall it will be, to choose above or below without measuring first.
  const height = pictureHeight + 22 + (content.text ? 52 : 0) + (content.meta ? 18 : 0) + 20;
  const below = rect.top < height + 16 && window.innerHeight - rect.bottom > rect.top;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - CARD_WIDTH / 2, window.innerWidth - CARD_WIDTH - 8));
  const style = below ? { top: rect.bottom + 8, left } : { bottom: window.innerHeight - rect.top + 8, left };
  return (
    <div
      role="tooltip"
      style={{ ...style, width: CARD_WIDTH }}
      className="pointer-events-none fixed z-[150] overflow-hidden rounded-xl border border-border/80 bg-popover shadow-[0_8px_28px_-8px_hsl(var(--shadow-hue)/0.22),0_2px_6px_hsl(var(--shadow-hue)/0.08)] animate-in fade-in zoom-in-[0.98] duration-fast"
    >
      {images.length > 0 && <Pictures images={images} height={pictureHeight} />}
      <div className="px-3 py-2.5">
        <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-foreground">{content.title}</div>
        {content.text && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[12.5px] leading-snug text-muted-foreground">{content.text}</p>}
        {content.meta && <div className="mt-1.5 truncate text-[11.5px] text-muted-foreground/80">{content.meta}</div>}
      </div>
    </div>
  );
}

function Pictures({ images, height }: { images: string[]; height: number }): ReactNode {
  const cell = "size-full bg-sunken object-contain";
  return (
    <div className="border-b border-border/60 bg-sunken" style={{ height }}>
      {images.length === 1 ? (
        <img src={images[0]} alt="" className={cell} draggable={false} />
      ) : (
        <div className={cn("grid size-full gap-px bg-border/60", images.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2")}>
          {images.map((src, i) => (
            <img key={i} src={src} alt="" className={cn(cell, images.length === 3 && i === 0 && "row-span-2")} draggable={false} />
          ))}
        </div>
      )}
    </div>
  );
}
