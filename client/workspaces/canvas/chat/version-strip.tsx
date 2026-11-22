import { History, Undo2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage } from "@/shared/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { ImageVersion } from "@/workspaces/canvas/canvas/lineage";

interface VersionStripProps {
  /** Every version of the selected picture, oldest first. */
  versions: ImageVersion[];
  activeElementId: string | null;
  onSelectVersion: (elementId: string) => void;
  /** The picture came from a slide: a button that sends the selected version back to it. */
  sendBack?: { label: string; busy: boolean; onSend: () => void } | null;
}

function formatTime(timestamp: number, uiLang: "zh" | "en"): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return date.toLocaleString(uiLang === "zh" ? "zh-CN" : "en-US", {
    ...(sameDay ? {} : { month: "numeric", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The versions of the selected picture, as a row of thumbnails above the
 * input.
 *
 * It replaced a history dialog behind a toolbar button that was disabled
 * unless a picture happened to be selected -- with nothing saying so -- and
 * that listed the versions as "Version 1, 2, 3" with no hint of what changed
 * between them. This shows up exactly when there is history to show, and each
 * thumbnail says what made it and when.
 */
export function VersionStrip({ versions, activeElementId, onSelectVersion, sendBack }: VersionStripProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);

  const sendButton = sendBack ? (
    <button
      type="button"
      onClick={sendBack.onSend}
      disabled={sendBack.busy}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
    >
      <Undo2 className={cn("size-3.5", sendBack.busy && "icon-busy text-brand")} />
      {tr(`送回 PPT ${sendBack.label}`, `Send back to ${sendBack.label}`)}
    </button>
  ) : null;

  if (versions.length < 2) return sendButton ? <div className="mb-2 flex justify-end animate-rise-in">{sendButton}</div> : null;

  return (
    <div className="mb-2 flex items-center gap-2 animate-rise-in">
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        {tr("版本", "Versions")}
      </span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
        {versions.map((version, index) => {
          const isActive = version.elementId === activeElementId;
          const note = version.note || (index === 0 ? tr("原图", "Original") : tr("无说明", "No description"));
          const time = formatTime(version.createdAt, uiLang);
          return (
            <Tooltip key={version.elementId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectVersion(version.elementId)}
                  aria-label={tr(`版本 ${index + 1}：${note}`, `Version ${index + 1}: ${note}`)}
                  aria-current={isActive}
                  className={cn(
                    "relative h-11 w-16 shrink-0 overflow-hidden rounded-md border bg-muted transition-[border-color,box-shadow] duration-fast ease-out-soft",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    isActive ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/60",
                  )}
                >
                  <img src={version.url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 left-0 rounded-tr-md bg-foreground/70 px-1 text-[10px] font-medium leading-4 text-background">
                    v{index + 1}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-left">
                <div className="font-semibold">
                  {tr(`版本 ${index + 1}`, `Version ${index + 1}`)}
                  {isActive ? tr("（当前选中）", " (selected)") : ""}
                  {time ? <span className="ml-1.5 font-normal opacity-70">{time}</span> : null}
                </div>
                <div className="mt-0.5 font-normal">{note}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {sendButton}
    </div>
  );
}
