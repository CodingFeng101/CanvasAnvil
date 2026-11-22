import { type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Shimmer } from "@/shared/chat/shimmer";

/*
 * How a reply shows its work, in every canvas: a timeline under the reply, each step marked by
 * an icon for what it is (thinking, reading files, sketching, drawing, checking the layout…).
 *
 *   🧠 已思考 4 秒  ›
 *   │
 *   📄 读完了 2 个文件  2 个 · 3s  ›
 *   │
 *   📄 读参考资料…            ← under way: its icon in the brand colour, breathing; the title shimmers
 *
 * Nothing spins. The icon keeps saying what the step is; the state only changes its colour
 * (brand while under way, grey once done, amber or red when it went wrong). How long the whole
 * turn has taken is said once, by the working line under the reply (working-indicator.tsx).
 */

export type StepState = "running" | "done" | "warning" | "error" | "pending";

const ICON_TONE: Record<StepState, string> = {
  running: "text-brand icon-busy",
  done: "text-muted-foreground",
  warning: "text-warning",
  error: "text-destructive",
  pending: "text-muted-foreground/40",
};

/** A step's icon in the colour of its state; usable on its own (a busy button, a code card). */
export function StepIcon({ icon: Icon, state, className }: { icon: LucideIcon; state: StepState; className?: string }) {
  return <Icon aria-hidden className={cn("size-[15px] shrink-0", ICON_TONE[state], className)} strokeWidth={1.9} />;
}

export function StepList({ className, children }: { className?: string; children: ReactNode }) {
  return <ol className={cn("not-prose my-3 list-none pl-0", className)}>{children}</ol>;
}

export function Step({
  icon,
  title,
  meta,
  state,
  last = false,
  collapsible = true,
  defaultOpen = false,
  children,
}: {
  /** What the step is; stays the same through its states. */
  icon: LucideIcon;
  /** A string shimmers while the step is under way. */
  title: ReactNode;
  meta?: ReactNode;
  state: StepState;
  last?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = Boolean(children);
  const canToggle = collapsible && hasBody;
  const shown = hasBody && (open || !collapsible);
  const running = state === "running";
  const heading = (
    <>
      <span
        className={cn(
          "min-w-0 text-[13.5px] leading-6",
          running ? "font-medium text-foreground" : state === "pending" ? "text-muted-foreground/70" : "text-foreground/80",
          state === "error" && "text-destructive",
        )}
      >
        {running && typeof title === "string" ? (
          <Shimmer as="span" duration={1.6}>
            {title}
          </Shimmer>
        ) : (
          title
        )}
      </span>
      {meta && <span className="min-w-0 shrink truncate text-[12px] tabular-nums text-muted-foreground/80">{meta}</span>}
      {canToggle && (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-fast group-hover/step:text-foreground/70",
            open && "rotate-90",
          )}
        />
      )}
    </>
  );
  return (
    <li className="group/step relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5">
      {/* The thread to the next step, from under this icon. */}
      {!last && <span aria-hidden className="absolute left-[8.5px] top-[23px] bottom-[1px] w-px bg-border/80" />}
      <span className="relative z-[1] flex h-6 items-center justify-center">
        <StepIcon icon={icon} state={state} />
      </span>
      <div className={cn("min-w-0", !last && "pb-2.5")}>
        {canToggle ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex max-w-full min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {heading}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2">{heading}</div>
        )}
        {shown && <div className="mt-1 mb-0.5 text-[13px] leading-relaxed text-muted-foreground animate-in fade-in duration-fast">{children}</div>}
      </div>
    </li>
  );
}
