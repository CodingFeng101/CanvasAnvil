import type React from "react";
import { FileSearch, FileText, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import type { PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

export type ReviewDraftRect = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type EditableResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type ReviewResizeHandle = EditableResizeHandle;

type TrFn = (zh: string, en: string) => string;

export function PptReviewSidebar(props: {
  panelWidth: number;
  slideNumber: number | null;
  textBlocks: PptTextBlock[];
  selectedTextBlockId: string | null;
  isScanning: boolean;
  isExtracting: boolean;
  canExtract: boolean;
  canStartEditing: boolean;
  reviewPhase: "boxes" | "text";
  extractionSummary?: string;
  reviewDrawMode: boolean;
  confirmLabel?: string;
  tr: TrFn;
  onPanelResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onExtract: () => void;
  onStartEditing: () => void;
  onExport?: () => void;
  onToggleDrawMode: () => void;
  onSelectBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onChangeText: (blockId: string, nextText: string) => void;
  onChangeRectField: (blockId: string, field: "x" | "y" | "w" | "h", value: string) => void;
}) {
  const {
    panelWidth,
    slideNumber,
    textBlocks,
    selectedTextBlockId,
    isScanning,
    isExtracting,
    canExtract,
    canStartEditing,
    reviewPhase,
    extractionSummary,
    reviewDrawMode,
    tr,
    onPanelResizeStart,
    onExtract,
    onStartEditing,
    onToggleDrawMode,
    onSelectBlock,
    onDeleteBlock,
    onChangeText,
    onChangeRectField,
  } = props;

  return (
    <>
      <div
        className="group relative w-3 shrink-0 cursor-col-resize border-l border-border/60 bg-transparent transition-colors hover:bg-zinc-200/70 dark:hover:bg-zinc-900/70"
        style={{ touchAction: "none" }}
        onPointerDown={onPanelResizeStart}
      >
        <div className="absolute inset-y-6 left-1/2 w-px -translate-x-1/2 rounded-full bg-zinc-300/0 transition-colors group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700" />
      </div>
      <div
        className="flex shrink-0 flex-col border-l border-border/70 bg-zinc-50/95 dark:bg-zinc-950"
        style={{ width: panelWidth }}
      >
        <div className="border-b border-border/70 bg-white/85 px-4 py-3 backdrop-blur dark:bg-zinc-950/85">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {tr("文字校对", "Text review")}
              </div>
              <div className="text-sm font-semibold text-foreground">
                {tr("确认文本框位置", "Confirm text boxes")}
              </div>
              <div className="text-xs text-muted-foreground">
                {slideNumber ? tr(`当前第 ${slideNumber} 页`, `Slide ${slideNumber}`) : tr("当前没有可校对页面", "No slide selected")}
              </div>
            </div>
            <div className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {tr(`${textBlocks.length} 个文本框`, `${textBlocks.length} text boxes`)}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-9 flex-1 rounded-lg bg-zinc-950 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                onClick={onExtract}
                disabled={!canExtract || isExtracting}
              >
                {isExtracting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1.5 h-3.5 w-3.5" />}
                {isExtracting ? tr("提取文本中...", "Extracting text...") : tr("提取文本", "Extract text")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1 rounded-lg text-xs"
                onClick={onStartEditing}
                disabled={!canStartEditing || isExtracting}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {tr("开始编辑", "Start editing")}
              </Button>
            </div>
            {extractionSummary ? (
              <div className="mt-2 text-[11px] text-muted-foreground">{extractionSummary}</div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isScanning || isExtracting ? (
            <div className="rounded-xl border border-border/70 bg-white/90 px-3.5 py-4 shadow-sm dark:bg-zinc-900/80">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">
                    {reviewPhase === "text"
                      ? tr("正在提取文本", "Extracting text")
                      : tr("正在准备文本框", "Preparing text boxes")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reviewPhase === "text"
                      ? tr("请稍等，系统正在批量提取文本并生成无字底图。", "Please wait while text and textless backgrounds are generated.")
                      : tr("请稍等，系统正在自动识别每一页的文本框位置。", "Please wait while text boxes are detected for each slide.")}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {textBlocks.map((block, index) => {
                const isSelected = selectedTextBlockId === block.id;
                return (
                  <div
                    key={block.id}
                    className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all dark:bg-zinc-900 ${
                      isSelected
                        ? "border-zinc-300 shadow-[0_0_0_1px_rgba(161,161,170,0.24),0_12px_30px_rgba(15,23,42,0.08)] dark:border-zinc-700"
                        : "border-border/70 hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-700"
                    }`}
                    onClick={() => onSelectBlock(block.id)}
                  >
                    <div className={`h-1 w-full ${isSelected ? "bg-zinc-500" : "bg-zinc-300 dark:bg-zinc-700"}`} />
                    <div className="px-3 py-2">
                      <div className="mb-1.5 flex items-start justify-between gap-2.5">
                        <div className="space-y-1">
                          <div className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {tr(`文字框 ${index + 1}`, `Block ${index + 1}`)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {`x ${block.x.toFixed(3)}  y ${block.y.toFixed(3)}  w ${block.w.toFixed(3)}  h ${block.h.toFixed(3)}`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-lg px-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteBlock(block.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          {tr("文字", "Text")}
                        </div>
                        <Textarea
                          value={block.text}
                          onFocus={() => onSelectBlock(block.id)}
                          onChange={(event) => onChangeText(block.id, event.target.value)}
                          className="min-h-[54px] rounded-lg border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-sm shadow-inner focus-visible:ring-zinc-400/30 dark:border-zinc-800 dark:bg-zinc-950/70"
                        />
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {([
                          ["x", block.x],
                          ["y", block.y],
                          ["w", block.w],
                          ["h", block.h],
                        ] as const).map(([field, value]) => (
                          <label key={field} className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950/60">
                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{field}</div>
                            <input
                              type="number"
                              step="0.001"
                              value={value.toFixed(3)}
                              onFocus={() => onSelectBlock(block.id)}
                              onChange={(event) => onChangeRectField(block.id, field, event.target.value)}
                              className="h-5 w-full border-0 bg-transparent px-0 text-[12px] font-medium text-foreground outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {textBlocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-10 text-center shadow-sm dark:bg-zinc-900/70">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-medium text-foreground">{tr("还没有文字框", "No text boxes yet")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {tr("可以在左侧框选新增，或继续调整当前页。", "Add a box from the canvas, or continue refining this slide.")}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-border/70 bg-white/85 px-3 py-3 backdrop-blur dark:bg-zinc-950/85">
          <Button
            size="sm"
            variant={reviewDrawMode ? "default" : "outline"}
            className={`h-10 w-full rounded-xl text-xs font-medium ${
              reviewDrawMode
                ? "bg-zinc-900 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-100"
                : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            }`}
            onClick={onToggleDrawMode}
            disabled={isExtracting}
          >
            {reviewDrawMode ? tr("正在框选", "Drawing") : tr("新增文字框", "Add text box")}
          </Button>
        </div>
      </div>
    </>
  );
}
