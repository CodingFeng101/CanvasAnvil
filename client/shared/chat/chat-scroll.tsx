import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { usePreferences } from "@/shared/preferences";
import { ScrollArea } from "@/shared/ui/scroll-area";

/*
 * The chat's scrolling area, shared by the four workspaces.
 *
 * - The scroller spans the whole chat panel, so its scrollbar sits on the
 *   panel's right edge (against the canvas when it is open), while the
 *   messages themselves keep to a readable measure (`.chat-measure`).
 * - A round "back to the latest" button fades in above the input once you
 *   have scrolled away from the bottom.
 * - An outline of the conversation runs down the left: one short line per
 *   message (longer for yours), the ones on screen darker; hover one to see
 *   what it says, click to go there.
 *
 * Messages are found in the DOM by `data-chat-msg="user" | "assistant"`, so
 * each workspace only marks its message rows.
 */

const VIEWPORT = '[data-slot="scroll-area-viewport"]';
/** "Back to the latest" asks FollowLatest to pick the reply up again. */
const FOLLOW_EVENT = "chat:follow";

function useViewport(rootRef: React.RefObject<HTMLDivElement | null>) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setViewport(rootRef.current?.querySelector<HTMLElement>(VIEWPORT) ?? null);
  }, [rootRef]);
  return viewport;
}

export function ChatScrollArea({ children, contentClassName }: { children: ReactNode; contentClassName?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(rootRef);
  return (
    <div ref={rootRef} className="relative h-full w-full">
      <ScrollArea className="h-full w-full scrollbar-thin">
        <div className={cn("chat-measure", contentClassName)}>{children}</div>
      </ScrollArea>
      {viewport && <FollowLatest viewport={viewport} />}
      {viewport && <ChatOutline viewport={viewport} />}
      {viewport && <BackToLatest viewport={viewport} />}
    </div>
  );
}

/**
 * Keeps the newest line in view while a reply streams in — but only while the reader is at the
 * bottom. Any move up (wheel, touch, keys, dragging the scrollbar) lets go at once, and the reply
 * keeps growing below without pulling them back; scrolling back down to the bottom, the
 * "back to the latest" button, or sending a new message picks it up again.
 */
function FollowLatest({ viewport }: { viewport: HTMLElement }) {
  useEffect(() => {
    const content = viewport.firstElementChild as HTMLElement | null;
    if (!content) return;
    const distance = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    let following = true;
    let lastTop = viewport.scrollTop;
    let userMessages = viewport.querySelectorAll('[data-chat-msg="user"]').length;
    const toBottom = () => {
      viewport.scrollTop = viewport.scrollHeight;
      lastTop = viewport.scrollTop;
    };
    const letGo = () => {
      following = false;
    };
    const onScroll = () => {
      const top = viewport.scrollTop;
      if (top < lastTop - 1) following = false;
      if (distance() <= 24) following = true;
      lastTop = top;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) letGo();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) letGo();
    };
    const onFollow = () => {
      following = true;
    };
    const onGrow = () => {
      const count = viewport.querySelectorAll('[data-chat-msg="user"]').length;
      if (count > userMessages) following = true; // the reader just sent something: show it
      userMessages = count;
      if (following) toBottom();
    };
    toBottom();
    const resize = new ResizeObserver(onGrow);
    resize.observe(content);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchmove", letGo, { passive: true });
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener(FOLLOW_EVENT, onFollow);
    return () => {
      resize.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchmove", letGo);
      viewport.removeEventListener("keydown", onKey);
      viewport.removeEventListener(FOLLOW_EVENT, onFollow);
    };
  }, [viewport]);
  return null;
}

function BackToLatest({ viewport }: { viewport: HTMLElement }) {
  const lang = useUiLanguage();
  const [away, setAway] = useState(false);
  useEffect(() => {
    const check = () => setAway(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 160);
    check();
    viewport.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [viewport]);
  const label = lang === "zh" ? "回到最新" : "Jump to latest";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      tabIndex={away ? 0 : -1}
      onClick={() => {
        viewport.dispatchEvent(new Event(FOLLOW_EVENT));
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      }}
      className={cn(
        "absolute bottom-3 left-1/2 z-20 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-card text-foreground/70 shadow-[0_2px_8px_-2px_hsl(var(--shadow-hue)/0.16),0_1px_2px_hsl(var(--shadow-hue)/0.06)] transition-[opacity,transform,color] duration-base ease-out-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        away ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowDown className="size-4" />
    </button>
  );
}

/** One turn: your question and the answer that followed it. */
interface OutlineItem {
  /** Where the turn starts (the question, or a reply with none before it). */
  el: HTMLElement;
  /** Every row of the turn, to tell whether any of it is on screen. */
  els: HTMLElement[];
  question: string;
  answer: string;
}

const MIN_TURNS = 2;
const MIN_WIDTH = 520;

function textOf(el: HTMLElement): string {
  // textContent, not innerText: innerText forces a layout, and this runs while replies stream.
  return (el.dataset.chatPreview ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function readItems(viewport: HTMLElement): OutlineItem[] {
  const turns: OutlineItem[] = [];
  for (const el of Array.from(viewport.querySelectorAll<HTMLElement>("[data-chat-msg]"))) {
    const last = turns[turns.length - 1];
    const isUser = el.dataset.chatMsg === "user";
    if (isUser || !last) {
      turns.push({ el, els: [el], question: isUser ? textOf(el).slice(0, 120) : "", answer: isUser ? "" : textOf(el).slice(0, 160) });
    } else {
      last.els.push(el);
      if (!last.answer) last.answer = textOf(el).slice(0, 160);
    }
  }
  return turns;
}

function ChatOutline({ viewport }: { viewport: HTMLElement }) {
  const prefs = usePreferences();
  const lang = useUiLanguage();
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [wide, setWide] = useState(true);
  const raf = useRef(0);
  const last = useRef(0);
  const pending = useRef(0);

  // At most a few times a second: a streaming reply changes the DOM on every token.
  const measure = useCallback(() => {
    const wait = 200 - (Date.now() - last.current);
    if (wait > 0) {
      if (!pending.current) pending.current = window.setTimeout(() => {
        pending.current = 0;
        measure();
      }, wait);
      return;
    }
    last.current = Date.now();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const next = readItems(viewport);
      setItems(next);
      const top = viewport.getBoundingClientRect().top;
      const bottom = top + viewport.clientHeight;
      const on = new Set<number>();
      next.forEach((item, i) => {
        const first = item.els[0].getBoundingClientRect();
        const last = item.els[item.els.length - 1].getBoundingClientRect();
        if (last.bottom > top + 8 && first.top < bottom - 8) on.add(i);
      });
      setVisible(on);
      setWide(viewport.clientWidth >= MIN_WIDTH);
    });
  }, [viewport]);

  useEffect(() => {
    if (!prefs.showMinimap) return;
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    const mutations = new MutationObserver(measure);
    mutations.observe(viewport, { childList: true, subtree: true });
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    return () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(pending.current);
      pending.current = 0;
      viewport.removeEventListener("scroll", measure);
      mutations.disconnect();
      resize.disconnect();
    };
  }, [viewport, measure, prefs.showMinimap]);

  if (!prefs.showMinimap || !wide || items.length < MIN_TURNS) return null;
  const gap = items.length > 40 ? 3 : items.length > 24 ? 5 : 8;
  const jump = (item: OutlineItem) => {
    const top = item.el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
  };
  const shown = hover !== null ? items[hover] : null;

  return (
    <nav
      aria-label={lang === "zh" ? "对话缩略" : "Conversation outline"}
      className="absolute left-2 top-1/2 z-20 flex max-h-[70%] -translate-y-1/2 flex-col overflow-visible py-2"
      style={{ gap }}
      onMouseLeave={() => setHover(null)}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          aria-label={item.question || item.answer || (lang === "zh" ? "一轮对话" : "A turn")}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          onClick={() => jump(item)}
          data-no-hint
          className="group relative flex h-[6px] items-center pr-2 focus-visible:outline-none"
        >
          <span
            className={cn(
              "block h-[2px] w-3.5 rounded-full transition-[background-color,width] duration-fast ease-out-soft",
              hover === i ? "w-5 bg-foreground" : visible.has(i) ? "bg-foreground/60" : "bg-foreground/[0.18] group-hover:bg-foreground/40",
            )}
          />
        </button>
      ))}
      {shown && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-8 w-[280px] -translate-y-1/2 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 shadow-[0_8px_24px_-6px_hsl(var(--shadow-hue)/0.18),0_1px_3px_hsl(var(--shadow-hue)/0.06)] animate-in fade-in duration-fast"
          style={{ top: 8 + hover! * (6 + gap) + 3 }}
        >
          {shown.question && <div className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{shown.question}</div>}
          {shown.answer && <div className={cn("line-clamp-3 text-[12.5px] leading-snug text-muted-foreground", shown.question && "mt-1")}>{shown.answer}</div>}
        </div>
      )}
    </nav>
  );
}
