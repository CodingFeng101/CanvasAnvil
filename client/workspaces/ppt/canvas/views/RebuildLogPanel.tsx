import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import { summariseRebuild, type RebuildLogEntry } from "@/workspaces/ppt/canvas/lib/rebuild-log";

/**
 * What the editable rebuild is doing, and what went wrong.
 *
 * Collapsed to one line by default: a run that worked deserves no attention.
 * Expanded it is the only place a failure is visible at all -- a page that
 * could not be rebuilt exports as the picture it already was, which looks
 * exactly like nothing having happened.
 */
export function RebuildLogPanel(props: {
  /** The step in flight. Empty once the run is over. */
  progress: string;
  entries: RebuildLogEntry[];
  onDismiss: () => void;
  tr: (zh: string, en: string) => string;
  uiLang: "zh" | "en";
}) {
  const { progress, entries, onDismiss, tr, uiLang } = props;
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const running = Boolean(progress);
  const failures = entries.filter((entry) => entry.level === "error").length;

  // A failure is the reason this panel exists; open on the first one rather
  // than leaving it behind a click nobody knows to make.
  useEffect(() => {
    if (failures > 0) setOpen(true);
  }, [failures]);

  useEffect(() => {
    if (!open || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [entries.length, open]);

  if (!running && entries.length === 0) return null;

  const summary = summariseRebuild(entries, uiLang);
  const level = running ? "info" : summary.level;
  const headline = running ? progress : summary.text;

  return (
    // Bottom right: the thumbnail rail runs down the left side, and a panel
    // that covers it hides the very pages this log is talking about.
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="pointer-events-auto absolute bottom-4 right-4 z-[80] w-[min(30rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-soft-lg"
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : level === "error" ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : level === "warn" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}

          <span className="truncate font-medium text-foreground">{headline}</span>
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {entries.length}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {!running ? (
          <button
            type="button"
            onClick={onDismiss}
            title={tr("关闭", "Dismiss")}
            className="border-l border-border px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="text-xs">×</span>
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          ref={scroller}
          className="max-h-64 overflow-y-auto border-t border-border bg-muted/40 px-3 py-2"
        >
          {entries.length === 0 ? (
            <div className="py-1 text-[11px] text-muted-foreground">
              {tr("正在开始…", "Starting...")}
            </div>
          ) : (
            <ol className="space-y-1">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed",
                    entry.level === "error"
                      ? "text-destructive"
                      : entry.level === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {entry.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}
