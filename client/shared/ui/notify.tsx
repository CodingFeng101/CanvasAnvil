import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { usePreferences } from "@/shared/preferences";

/**
 * The app's own notices: a card at the top of the window that says what happened (the title), why
 * or what to do next (one line under it), and at most one button that does that next thing.
 *
 *   notify.success("已放到白板上", { description: "圈出要改的地方让 AI 改。" })
 *   notify.error("交付物没能生成", { description: "户型仍是已确认的。", action: { label: "重试", onClick } })
 *   const id = notify.loading("正在识别…"); … notify.success("识别完成", { id })   // replaces it in place
 */

export type NoticeTone = "success" | "error" | "warning" | "info" | "loading";

export interface NoticeAction {
  label: string;
  onClick: () => void;
}

export interface NoticeOptions {
  /** Why it happened, or what to do next. One or two short sentences. */
  description?: ReactNode;
  /** The one thing to do about it. */
  action?: NoticeAction;
  /** Milliseconds on screen; Infinity keeps it until closed. Defaults by tone. */
  duration?: number;
  /** Reusing an id replaces that notice (a loading notice turning into its result). */
  id?: string;
}

interface Notice {
  id: string;
  tone: NoticeTone;
  title: ReactNode;
  description?: ReactNode;
  action?: NoticeAction;
  duration: number;
  render?: (id: string) => ReactNode;
  /** Bumped on every replacement so the timer starts again. */
  version: number;
}

const MAX_SHOWN = 4;
const DEFAULT_DURATION: Record<NoticeTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 8000,
  loading: Infinity,
};

let notices: Notice[] = [];
const listeners = new Set<() => void>();
let seed = 0;

function emit() {
  for (const listener of listeners) listener();
}

function upsert(notice: Omit<Notice, "version">): string {
  const index = notices.findIndex((n) => n.id === notice.id);
  if (index >= 0) {
    const next = [...notices];
    next[index] = { ...notice, version: notices[index].version + 1 };
    notices = next;
  } else {
    notices = [{ ...notice, version: 0 }, ...notices].slice(0, MAX_SHOWN);
  }
  emit();
  return notice.id;
}

function show(tone: NoticeTone, title: ReactNode, options: NoticeOptions = {}): string {
  const duration = options.duration ?? (options.action && tone !== "loading" ? Math.max(DEFAULT_DURATION[tone], 10000) : DEFAULT_DURATION[tone]);
  return upsert({
    id: options.id ?? `notice-${++seed}`,
    tone,
    title,
    description: options.description,
    action: options.action,
    duration,
  });
}

function dismiss(id?: string) {
  notices = id === undefined ? [] : notices.filter((n) => n.id !== id);
  emit();
}

export const notify = {
  success: (title: ReactNode, options?: NoticeOptions) => show("success", title, options),
  error: (title: ReactNode, options?: NoticeOptions) => show("error", title, options),
  warning: (title: ReactNode, options?: NoticeOptions) => show("warning", title, options),
  info: (title: ReactNode, options?: NoticeOptions) => show("info", title, options),
  loading: (title: ReactNode, options?: NoticeOptions) => show("loading", title, options),
  /** A notice whose whole body is drawn by the caller (it gets its id, to close itself). */
  custom: (render: (id: string) => ReactNode, options: { duration?: number; id?: string } = {}) =>
    upsert({ id: options.id ?? `notice-${++seed}`, tone: "info", title: null, render, duration: options.duration ?? DEFAULT_DURATION.info }),
  dismiss,
};

/** A thrown value as one readable line. */
export function errorText(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => notices;

const TONE_ICON: Record<NoticeTone, ReactNode> = {
  success: <Check className="size-3.5" strokeWidth={2.5} />,
  error: <X className="size-3.5" strokeWidth={2.5} />,
  warning: <AlertTriangle className="size-3.5" strokeWidth={2.25} />,
  info: <Info className="size-3.5" strokeWidth={2.25} />,
  loading: <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />,
};

const TONE_BADGE: Record<NoticeTone, string> = {
  success: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-foreground/[0.07] text-foreground/70",
  loading: "bg-foreground/[0.07] text-foreground/70",
};

/** Mounted once at the root of the app. */
export function NoticeHost() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const prefs = usePreferences();
  return (
    <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[140] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {list.map((notice) => (
          <NoticeCard key={notice.id} notice={notice} />
        ))}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

function NoticeCard({ notice }: { notice: Notice }) {
  const remaining = useRef(notice.duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    stop();
    if (!Number.isFinite(remaining.current)) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss(notice.id), remaining.current);
  };
  // A replacement (same id, new content) gets its full time again.
  useEffect(() => {
    remaining.current = notice.duration;
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice.version, notice.duration]);

  // Paused while the pointer is on it, so a long one can be read and its button reached.
  const pause = () => {
    if (!timer.current) return;
    remaining.current = Math.max(1200, remaining.current - (Date.now() - startedAt.current));
    stop();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
      role={notice.tone === "error" ? "alert" : "status"}
      onPointerEnter={pause}
      onPointerLeave={start}
      className="pointer-events-auto w-full max-w-[420px]"
    >
      {notice.render ? (
        notice.render(notice.id)
      ) : (
        <div className="group relative flex gap-3 rounded-2xl border border-border/80 bg-card py-3 pl-3 pr-9 text-card-foreground shadow-[0_1px_2px_rgba(20,20,19,0.05),0_12px_32px_-12px_rgba(20,20,19,0.22)]">
          <span className={cn("mt-px flex size-6 shrink-0 items-center justify-center rounded-full", TONE_BADGE[notice.tone])}>{TONE_ICON[notice.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium leading-6 text-foreground">{notice.title}</p>
            {notice.description ? <div className="mt-0.5 text-[12.5px] leading-[1.55] text-muted-foreground">{notice.description}</div> : null}
            {notice.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(notice.id);
                  notice.action!.onClick();
                }}
                className="mt-2 inline-flex h-7 items-center rounded-lg bg-foreground px-2.5 text-[12.5px] font-medium text-background transition-opacity duration-fast hover:opacity-85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                {notice.action.label}
              </button>
            ) : null}
          </div>
          {notice.tone !== "loading" ? (
            <button
              type="button"
              aria-label="Close"
              onClick={() => dismiss(notice.id)}
              className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,background-color,color] duration-fast hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}
