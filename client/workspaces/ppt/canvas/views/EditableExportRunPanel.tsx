import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, X, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import type { EditableExport, RunEvent } from "@/workspaces/ppt/canvas/hooks/use-editable-export";

/** The pipeline's stages in run order, in the user's words. */
const STAGES: { id: string; zh: string; en: string }[] = [
  { id: "ocr", zh: "识别文字", en: "Read text" },
  { id: "grouping", zh: "规划底图", en: "Plan backgrounds" },
  { id: "bases", zh: "生成干净底图", en: "Draw clean backgrounds" },
  { id: "analysis", zh: "分析页面元素", en: "Analyse elements" },
  { id: "shared-assets", zh: "生成图标与插图", en: "Draw icons and illustrations" },
  { id: "pages", zh: "逐页重建", en: "Rebuild pages" },
  { id: "merge", zh: "合成 PPTX", en: "Write the PPTX" },
];

type Item = Extract<RunEvent, { type: "line" | "artifact" }>;
type StageStatus = "pending" | "running" | "done" | "failed";

const PANEL_WIDTH = 420;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The editable export's run, as it happens: every stage, what each one did,
 * and the pictures it made, each of which opens full size. It hangs under the
 * export button; a run in progress collapses to a pill beside the button.
 */
export function EditableExportRunPanel(props: { editable: EditableExport; tr: (zh: string, en: string) => string; uiLang: string }) {
  const { editable, tr, uiLang } = props;
  const zh = uiLang === "zh";
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Under the export button's group, kept inside the window.
  useLayoutEffect(() => {
    if (!editable.panelOpen) return;
    const place = () => {
      const group = anchor.current?.parentElement;
      if (!group) return;
      const rect = group.getBoundingClientRect();
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 16));
      setPosition({ top: rect.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [editable.panelOpen]);

  /** Steps the reader opened or closed by hand; the rest follow the run. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // A new run starts with every step following the run again.
  useEffect(() => {
    if (editable.events.length === 0) setToggled({});
  }, [editable.events.length]);

  // Follow the newest event unless the reader has scrolled up to look at something.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [editable.events.length, editable.panelOpen]);

  const statusOf: Record<string, StageStatus> = {};
  const secondsOf: Record<string, number> = {};
  const itemsOf: Record<string, Item[]> = {};
  const pageStatusOf: Record<number, "running" | "done"> = {};
  for (const event of editable.events) {
    if (event.type === "stage") {
      statusOf[event.stage] = event.status === "start" ? "running" : event.status;
      if (event.seconds !== undefined) secondsOf[event.stage] = event.seconds;
    } else if (event.type === "page") {
      pageStatusOf[event.page] = event.status === "start" ? "running" : "done";
    } else {
      (itemsOf[event.stage] ||= []).push(event);
    }
  }

  const renderItems = (items: Item[]) => {
    const rows: React.ReactNode[] = [];
    let thumbs: Extract<Item, { type: "artifact" }>[] = [];
    const flush = (key: string) => {
      if (!thumbs.length) return;
      const batch = thumbs;
      thumbs = [];
      rows.push(
        <div key={key} className="flex flex-wrap gap-1.5 py-1">
          {batch.map((artifact, i) => {
            const url = editable.artifactUrl(artifact.path);
            return (
              <button
                key={`${artifact.path}-${i}`}
                type="button"
                title={artifact.label}
                onClick={() => setViewing({ url, label: artifact.label })}
                className="group relative h-14 overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-primary"
              >
                <img src={url} alt={artifact.label} loading="lazy" className="h-full w-auto max-w-[120px] object-contain" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] leading-4 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {artifact.label}
                </span>
              </button>
            );
          })}
        </div>,
      );
    };
    items.forEach((item, i) => {
      if (item.type === "artifact") {
        thumbs.push(item);
        return;
      }
      flush(`t-${i}`);
      rows.push(
        <div
          key={`l-${i}`}
          className={cn(
            "flex gap-2 py-0.5 text-[11px] leading-relaxed",
            item.level === "error" ? "text-destructive" : item.level === "warn" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          <span className="shrink-0 tabular-nums opacity-60">{clock(item.t)}</span>
          <span className="min-w-0 break-words">{item.text}</span>
        </div>,
      );
    });
    flush("t-end");
    return rows;
  };

  /** Page rebuilds run side by side, so each page gets its own group. */
  const renderPages = (items: Item[]) => {
    const pages = [...new Set(items.map((item) => item.page ?? 0))].sort((a, b) => a - b);
    return pages.map((page) => {
      const status = pageStatusOf[page];
      const key = `page-${page}`;
      // Like the steps: a page being rebuilt is open, a finished one closes unless the reader opened it.
      const open = page === 0 || (toggled[key] ?? status !== "done");
      return (
      <div key={page} className="mt-1 rounded-md border border-border/60 bg-background/40 px-2 py-1">
        {page > 0 ? (
          <button
            type="button"
            onClick={() => setToggled((prev) => ({ ...prev, [key]: !open }))}
            className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-foreground"
          >
            {status === "done" ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            ) : (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary-strong" />
            )}
            <span>{tr(`第 ${page} 页`, `Page ${page}`)}</span>
            <ChevronDown className={cn("ml-auto h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        ) : null}
        {open ? renderItems(items.filter((item) => (item.page ?? 0) === page)) : null}
      </div>
      );
    });
  };

  const header = editable.busy
    ? editable.state === "uploading"
      ? editable.uploadText
      : tr("正在导出可编辑 PPTX", "Exporting editable PPTX")
    : editable.state === "failed"
      ? tr("导出失败", "Export failed")
      : tr("导出完成", "Export finished");

  const panelVisible = editable.panelOpen && editable.state !== "idle";

  return (
    <>
      <span ref={anchor} className="hidden" />
      {/* Collapsed while running: a pill beside the export button reopens the panel. */}
      {editable.busy && !editable.panelOpen ? (
        <button
          type="button"
          onClick={() => editable.setPanelOpen(true)}
          title={tr("查看导出过程", "Show the export run")}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-primary/15"
        >
          <Loader2 className="h-3 w-3 animate-spin text-primary-strong" />
          <span>{tr("可编辑导出中", "Editable export")}</span>
          <span className="tabular-nums text-muted-foreground">{clock(editable.seconds)}</span>
        </button>
      ) : null}

      {/* Portalled to the page and placed under the export button, so no pane beside it can clip or cover it. */}
      {panelVisible && position ? createPortal(
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
          // Just under the dialog layer (z-50), so an opened picture lands in front of the panel.
          className="fixed z-[49] flex h-[min(70vh,560px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-soft-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            {editable.busy ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-strong" />
            ) : editable.state === "failed" ? (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="truncate text-xs font-medium text-foreground">{header}</span>
            {editable.state !== "uploading" ? (
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{clock(editable.seconds)}</span>
            ) : (
              <span className="ml-auto" />
            )}
            {editable.busy ? (
              <button type="button" onClick={() => editable.setPanelOpen(false)} title={tr("收起", "Collapse")} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" onClick={editable.close} title={tr("关闭", "Close")} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {editable.busy ? (
            <div className="border-b border-border bg-primary/[0.06] px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {tr(
                "导出时间比较长（通常 10 分钟以上），请耐心等待；可以收起窗口继续使用，完成后会自动下载。",
                "Exporting takes a while (usually 10+ minutes). You can collapse this and keep working; the file downloads when it is done.",
              )}
            </div>
          ) : null}
          <div
            ref={scroller}
            onScroll={(event) => {
              const el = event.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="flex-1 overflow-y-auto px-3 py-2"
          >
            {STAGES.map((stage) => {
              const status: StageStatus = statusOf[stage.id] || "pending";
              const items = itemsOf[stage.id] || [];
              // By default the step in flight (or the one that failed) is open and the rest closed.
              const open = toggled[stage.id] ?? (status === "running" || status === "failed");
              return (
                <div key={stage.id} className="py-0.5">
                  <button
                    type="button"
                    disabled={!items.length}
                    onClick={() => setToggled((prev) => ({ ...prev, [stage.id]: !open }))}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors enabled:hover:bg-accent disabled:cursor-default"
                  >
                    {status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-strong" />
                    ) : status === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={cn("text-xs", status === "pending" ? "text-muted-foreground/60" : "font-medium text-foreground")}>
                      {zh ? stage.zh : stage.en}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {secondsOf[stage.id] !== undefined ? `${secondsOf[stage.id]}s` : null}
                      {items.length ? <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} /> : null}
                    </span>
                  </button>
                  {items.length > 0 && open ? (
                    <div className="ml-[11px] mt-0.5 border-l border-border pl-3.5">
                      {stage.id === "pages" ? renderPages(items) : renderItems(items)}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {editable.error ? (
              <div className="mt-2 flex gap-2 rounded-md border border-destructive/25 bg-destructive/[0.08] px-2 py-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-words">{editable.error}</span>
              </div>
            ) : null}
          </div>
        </motion.div>,
        document.body,
      ) : null}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        {/* Just the picture, enlarged: no card, frame or padding around it. */}
        <DialogContent className="w-auto max-w-[94vw] border-none bg-transparent p-0 shadow-none sm:max-w-[94vw]">
          <DialogTitle className="sr-only">{viewing?.label}</DialogTitle>
          {viewing ? (
            <img
              src={viewing.url}
              alt={viewing.label}
              onClick={() => setViewing(null)}
              className="block max-h-[90vh] max-w-[94vw] cursor-zoom-out object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
