import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, X, type LucideIcon } from "lucide-react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useWork } from "@/shared/works/work-context";
import { getPreferences, prefersReducedMotion, usePreferences } from "@/shared/preferences";
import type { PanelImperativeHandle } from "@/shared/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/*
 * The canvas as claude.ai shows an artifact: a blank work opens on the chat
 * alone, centred; once the AI has drawn something the canvas slides open
 * beside it, and a card under the reply opens it again after it is closed.
 * The canvas's own corner has two buttons: enlarge (it covers the chat; the
 * app's sidebar stays, it folds on its own) and close.
 *
 * The canvas is never unmounted while closed, only folded to zero width, so
 * the AI can still draw into it (the editors keep their state and APIs).
 */

/** Below this the chat's rows start to wrap into each other, so it stops here. */
export const CHAT_MIN_SIZE = "340px";
/**
 * The narrowest the canvas goes: its toolbars and tabs stay on one row. A
 * fixed width rather than a share, so a narrow window doesn't squeeze it; a
 * drag past it folds the canvas away instead.
 */
export const CANVAS_MIN_SIZE = "600px";

export interface CanvasPaneValue {
  open: boolean;
  /** The canvas covers the chat. */
  maximized: boolean;
  /** The canvas has something on it (a listed work, or the AI just drew). */
  hasContent: boolean;
  /** What the card calls the canvas: "图表", "户型", … */
  kind: string;
  icon: LucideIcon;
  /** Which canvas, for the card's picture. */
  variant: CanvasVariant;
  show(): void;
  /** Close the canvas (back to the chat alone). */
  hide(): void;
  toggle(): void;
  maximize(): void;
  /** Back from enlarged to side by side. */
  restore(): void;
  toggleMaximize(): void;
  /** The AI has put something on the canvas: open it, and let the card show. */
  reveal(): void;
  /**
   * The user sent a request. The first one in a work that has nothing on its
   * canvas yet opens the canvas, so the drawing can be watched as it streams
   * in (Settings → Canvas). Later ones leave the canvas as the user left it.
   */
  requested(): void;
  /** The last open / close / enlarge / restore, for the sheet's own motion. */
  change: PaneChange;
}

export type CanvasVariant = "diagram" | "cad" | "ppt" | "canvas";

export interface PaneChange {
  kind: "none" | "show" | "hide" | "maximize" | "restore";
  n: number;
}

export const EASE = "cubic-bezier(.25,1,.5,1)";
export const reducedMotion = prefersReducedMotion;

const CanvasPaneContext = createContext<CanvasPaneValue | null>(null);
export const CanvasPaneProvider = CanvasPaneContext.Provider;

export function useCanvasPane(): CanvasPaneValue | null {
  return useContext(CanvasPaneContext);
}

/** The canvas's share when it opens (Settings → Canvas). */
const openSize = () => (getPreferences().canvasShare === "half" ? "50%" : "64%");
const CHAT_MEASURE = { narrow: "[--chat-measure:720px]", standard: "[--chat-measure:860px]", wide: "[--chat-measure:1040px]" } as const;

/**
 * The layout of one workspace's chat and canvas panels. A work that already
 * has content opens with its canvas; a blank one opens on the chat alone.
 */
export function useCanvasPaneState({ kind, icon, variant }: { kind: string; icon: LucideIcon; variant: CanvasVariant }) {
  const work = useWork();
  const prefs = usePreferences();
  const [initialOpen] = useState(() => !!work?.saved);
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const chatRef = useRef<PanelImperativeHandle | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [maximized, setMaximized] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Motion without reflow: the panels change size in one step, and only
  // opacity and transform animate (the sheet slides in, the chat fades back),
  // so no text re-wraps and no editor re-lays itself out frame by frame.
  const [change, setChange] = useState<PaneChange>({ kind: "none", n: 0 });
  const chatColumnRef = useRef<HTMLDivElement | null>(null);
  const mark = (kind: PaneChange["kind"]) => setChange((c) => ({ kind, n: c.n + 1 }));
  useEffect(() => {
    if (change.kind === "none" || change.kind === "maximize" || reducedMotion()) return;
    chatColumnRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE });
  }, [change]);

  const show = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    if (panel.getSize().asPercentage < 40) panel.resize(openSize());
    setOpen(true);
    mark("show");
  }, []);
  const restore = useCallback(() => {
    const chat = chatRef.current;
    if (!chat || !chat.isCollapsed()) return;
    chat.expand();
    setMaximized(false);
    mark("restore");
  }, []);
  const hide = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || panel.isCollapsed()) return;
    // The chat comes back first: the two panels cannot both be folded.
    chatRef.current?.expand();
    panel.collapse();
    setMaximized(false);
    setOpen(false);
    mark("hide");
  }, []);
  const maximize = useCallback(() => {
    const chat = chatRef.current;
    if (!chat || chat.isCollapsed()) return;
    if (panelRef.current?.isCollapsed()) show();
    chat.collapse();
    setMaximized(true);
    mark("maximize");
  }, [show]);
  const askedOnce = useRef(false);
  const requested = useCallback(() => {
    if (askedOnce.current) return;
    askedOnce.current = true;
    if (!getPreferences().autoOpenCanvas || initialOpen || revealed) return;
    if (panelRef.current?.isCollapsed()) show();
  }, [initialOpen, revealed, show]);
  const reveal = useCallback(() => {
    setRevealed(true);
    // Settings → Canvas can leave it closed: the card under the reply opens it.
    if (getPreferences().autoOpenCanvas) show();
  }, [show]);

  const value = useMemo<CanvasPaneValue>(
    () => ({
      open,
      maximized,
      hasContent: initialOpen || revealed,
      kind,
      icon,
      variant,
      show,
      hide,
      toggle: () => (panelRef.current?.isCollapsed() ? show() : hide()),
      maximize,
      restore,
      toggleMaximize: () => (chatRef.current?.isCollapsed() ? restore() : maximize()),
      reveal,
      requested,
      change,
    }),
    [open, maximized, initialOpen, revealed, kind, icon, variant, show, hide, maximize, restore, reveal, requested, change],
  );

  return {
    value,
    /** Spread on the chat's ResizablePanel. */
    chatPanelProps: {
      panelRef: chatRef,
      defaultSize: initialOpen ? (getPreferences().canvasShare === "half" ? "50%" : "36%") : "100%",
      minSize: CHAT_MIN_SIZE,
      collapsible: true,
      collapsedSize: "0px",
      onResize: (size: { inPixels: number }) => setMaximized(size.inPixels <= 1),
    },
    /** Spread on the canvas's ResizablePanel. */
    canvasPanelProps: {
      panelRef,
      collapsible: true,
      collapsedSize: "0px",
      minSize: CANVAS_MIN_SIZE,
      defaultSize: initialOpen ? openSize() : "0%",
      onResize: (size: { inPixels: number }) => setOpen(size.inPixels > 1),
    },
    /** On the chat column's div, for its fade. */
    chatColumnRef,
    /**
     * For the chat column: its messages and input keep to a readable measure
     * (`.chat-measure`), centred, whether the canvas is open or not. Dragging
     * the chat wider only adds blank room on both sides; the conversation
     * outline sits in the left one.
     */
    chatColumnClassName: cn("h-full", CHAT_MEASURE[prefs.chatWidth]),
  };
}

const iconButton =
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color] duration-fast hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

function IconTip({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className={iconButton}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** In the chat header while the canvas is closed: the way to open it by hand (to draw, or pick a style). */
export function CanvasOpenButton() {
  const pane = useCanvasPane();
  const lang = useUiLanguage();
  if (!pane || pane.open) return null;
  const Icon = pane.icon;
  // A quiet pill naming the canvas, not a bare panel glyph: it reads as "there is a canvas here".
  return (
    <button
      type="button"
      onClick={pane.show}
      className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-card pl-2.5 pr-3 text-[13px] text-foreground/75 shadow-[0_1px_2px_rgba(20,20,19,0.04)] transition-[border-color,color,box-shadow] duration-fast ease-out-soft hover:border-foreground/20 hover:text-foreground hover:shadow-[0_2px_8px_-2px_rgba(20,20,19,0.10)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <Icon className="size-3.5 text-muted-foreground transition-colors duration-fast group-hover:text-foreground" />
      {lang === "zh" ? "打开画布" : "Open canvas"}
    </button>
  );
}

/** The canvas's own corner: enlarge / restore, and close. */
export function CanvasPaneControls() {
  const pane = useCanvasPane();
  const lang = useUiLanguage();
  if (!pane) return null;
  const zh = lang === "zh";
  return (
    <div className="flex items-center gap-0.5">
      <IconTip label={pane.maximized ? (zh ? "还原" : "Restore") : zh ? "放大" : "Enlarge"} onClick={pane.toggleMaximize}>
        {pane.maximized ? <Minimize2 className="size-[15px]" /> : <Maximize2 className="size-[15px]" />}
      </IconTip>
      <IconTip label={zh ? "关闭画布" : "Close canvas"} onClick={pane.hide}>
        <X className="size-[17px]" />
      </IconTip>
    </div>
  );
}

/**
 * The card under the AI's last reply, standing for what is on the canvas, as
 * claude.ai shows an artifact in the chat. Clicking it opens the canvas.
 * The left shows the work's preview when the canvas has made one, else a
 * small drawing of that kind of canvas: a node graph, a floor plan, a slide
 * with pages behind it, a framed picture.
 * Renders nothing outside a workspace or while the canvas is still empty.
 */
export function CanvasCard({ className }: { className?: string }) {
  const pane = useCanvasPane();
  const work = useWork();
  const lang = useUiLanguage();
  if (!pane || !pane.hasContent) return null;
  const zh = lang === "zh";
  const title = work?.name || pane.kind;
  const hint = pane.open ? (zh ? "画布已打开" : "Canvas open") : zh ? "点击打开" : "Click to open";
  const wide = pane.variant === "ppt" || pane.variant === "diagram";
  return (
    <button
      type="button"
      onClick={pane.show}
      title={zh ? "打开画布" : "Open canvas"}
      className={cn(
        "group mt-3 flex w-full max-w-[420px] items-center gap-3.5 rounded-xl border border-border bg-card p-2 pr-4 text-left shadow-[0_1px_2px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow,transform] duration-fast ease-out-soft hover:border-foreground/20 hover:shadow-[0_2px_10px_-2px_rgba(20,20,19,0.10)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex h-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-sunken text-muted-foreground transition-colors duration-fast group-hover:text-foreground",
          wide ? "w-[92px]" : "w-14",
        )}
      >
        {work?.thumb ? (
          <img src={work.thumb} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <CanvasGlyph variant={pane.variant} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
          <pane.icon className="size-3 shrink-0" />
          {pane.kind} · {hint}
        </span>
      </span>
    </button>
  );
}

/** A small line drawing of each kind of canvas, in the card's colour. */
function CanvasGlyph({ variant }: { variant: CanvasVariant }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (variant === "diagram")
    return (
      <svg viewBox="0 0 92 56" className="size-full p-2.5" aria-hidden>
        <rect x="6" y="20" width="20" height="14" rx="3" {...stroke} />
        <rect x="38" y="6" width="20" height="14" rx="3" {...stroke} />
        <rect x="38" y="36" width="20" height="14" rx="3" {...stroke} />
        <rect x="68" y="20" width="18" height="14" rx="7" {...stroke} className="text-brand" stroke="currentColor" />
        <path d="M26 27 H32 V13 H38 M32 27 V43 H38 M58 13 H63 V27 H68 M58 43 H63 V27" {...stroke} opacity={0.55} />
      </svg>
    );
  if (variant === "cad")
    return (
      <svg viewBox="0 0 56 56" className="size-full p-2" aria-hidden>
        <rect x="6" y="6" width="44" height="44" rx="1.5" {...stroke} strokeWidth={2} />
        <path d="M6 28 H24 M32 28 H50 M28 6 V20 M28 32 V50" {...stroke} />
        <path d="M24 28 A8 8 0 0 1 32 20" {...stroke} opacity={0.5} />
        <rect x="36" y="36" width="9" height="9" rx="1" {...stroke} opacity={0.45} />
      </svg>
    );
  if (variant === "ppt")
    return (
      <svg viewBox="0 0 92 56" className="size-full p-2" aria-hidden>
        <rect x="20" y="4" width="60" height="34" rx="2.5" {...stroke} opacity={0.3} />
        <rect x="16" y="9" width="60" height="34" rx="2.5" {...stroke} opacity={0.55} className="fill-sunken" fill="currentColor" />
        <rect x="12" y="14" width="60" height="34" rx="2.5" {...stroke} className="fill-card" fill="currentColor" />
        <path d="M19 23 H45" {...stroke} strokeWidth={2.2} />
        <path d="M19 30 H38 M19 35 H34" {...stroke} opacity={0.5} />
        <rect x="49" y="27" width="16" height="13" rx="1.5" {...stroke} opacity={0.6} />
      </svg>
    );
  return (
    <svg viewBox="0 0 56 56" className="size-full p-2" aria-hidden>
      <rect x="7" y="7" width="42" height="42" rx="3" {...stroke} />
      <circle cx="20" cy="20" r="4" {...stroke} className="text-brand" stroke="currentColor" />
      <path d="M9 42 L22 30 L30 37 L37 29 L47 40" {...stroke} />
    </svg>
  );
}
