import { useEffect, useRef, type ReactNode } from "react";
import { CanvasPaneControls, EASE, reducedMotion, useCanvasPane } from "@/shared/canvas-pane";
import { cn } from "@/shared/lib/utils";
import { useWork } from "@/shared/works/work-context";

/*
 * The canvas as a side panel of the app itself, the way Claude docks its
 * terminal beside the chat: no card, no margin, no corners; it runs full
 * height on the same ground, parted from the chat by one hairline (the
 * resize handle). Every workspace puts its canvas in one. It has a slim head:
 * the work's name on the left, enlarge and close on the right (kept off the
 * editors' own toolbars).
 */
export function CanvasSheet({ children, className }: { children: ReactNode; className?: string }) {
  const pane = useCanvasPane();
  const work = useWork();
  // Folded away, the sheet keeps a real width and the panel clips it: the
  // editors inside (draw.io, Excalidraw, the house designer) never see zero.
  const closed = pane?.open === false;
  // Opening slides the sheet in from the right; enlarging or restoring settles
  // it with a short fade. Only transform and opacity move: the sheet's layout
  // changed once, before the first frame, so nothing inside re-flows.
  const sheetRef = useRef<HTMLDivElement>(null);
  const change = pane?.change;
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !change || reducedMotion()) return;
    if (change.kind === "show") {
      el.animate(
        [
          { opacity: 0, transform: "translateX(28px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 360, easing: EASE },
      );
    } else if (change.kind === "maximize" || change.kind === "restore") {
      el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 240, easing: EASE });
    }
  }, [change]);
  return (
    <div className="h-full" style={closed ? { width: "max(640px, 60vw)" } : undefined}>
      <div ref={sheetRef} className="flex h-full w-full flex-col overflow-hidden bg-background">
        {pane && (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 pl-4 pr-2">
            <pane.icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">{work?.name || pane.kind}</span>
            <CanvasPaneControls />
          </div>
        )}
        <div className={cn("relative min-h-0 w-full flex-1 overflow-hidden", className)}>{children}</div>
      </div>
    </div>
  );
}

/** The resize handle between chat and canvas: the one hairline that parts them, with a wider grip. */
export const sheetHandleClass =
  "w-px bg-border/80 transition-colors duration-fast after:w-2 hover:bg-foreground/25 data-[separator=active]:bg-foreground/35";
