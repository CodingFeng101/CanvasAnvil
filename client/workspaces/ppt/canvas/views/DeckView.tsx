import {
  ArrowLeft,
  ArrowRight,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Minimize2,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { ScaleToFit } from "@/shared/ui/scale-to-fit";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  canvasAnvilToEditorSlide,
  PptEditorBridge,
} from "@/features/ppt-editor";
import type { RebuildLogEntry } from "@/workspaces/ppt/canvas/lib/rebuild-log";
import { RebuildLogPanel } from "@/workspaces/ppt/canvas/views/RebuildLogPanel";
import { EditableExportDialog } from "@/workspaces/ppt/canvas/views/EditableExportDialog";
import { EditableExportRunPanel } from "@/workspaces/ppt/canvas/views/EditableExportRunPanel";
import type { EditableExport, EditableExportSlide } from "@/workspaces/ppt/canvas/hooks/use-editable-export";
import {
  PPT_REFERENCE_SLIDE_HEIGHT,
  PPT_REFERENCE_SLIDE_WIDTH,
} from "@/workspaces/ppt/lib/ppt-service";
import { getSlideshowDimensions } from "@/workspaces/ppt/canvas/lib/slideshow-size";
import type {
  CreationMode,
  SlideData,
  SlideImageVersion,
  SlideRenderLayer,
} from "@/workspaces/ppt/canvas/types";
import type { CreationProgress } from "@/workspaces/ppt/canvas/lib/creation-machine";
import type { useCreationInputs } from "@/workspaces/ppt/canvas/hooks/use-creation-inputs";
import type { useDeckExport } from "@/workspaces/ppt/canvas/hooks/use-deck-export";
import type { useSlideMaterials } from "@/workspaces/ppt/canvas/hooks/use-slide-materials";
import type { useSlideshow } from "@/workspaces/ppt/canvas/hooks/use-slideshow";

/**
 * The editable-PPTX entry in the export menu. It opens the export settings;
 * the run itself is the server's editable PPTX pipeline (see PptCanvas).
 */
const SHOW_EDITABLE_EXPORT = true;

/** The deck as this screen needs to see it: the slides, and how to resolve one. */

const RAIL_KEY = "canvasanvil:ppt-rail-width";
const RAIL_MIN = 160;
const RAIL_MAX = 420;
export interface DeckViewModel {
  slides: SlideData[];
  currentSlide: SlideData | undefined;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  currentSlideImage: string;
  currentLayer: SlideRenderLayer | undefined;
  currentVersionId: string;
  versionIdBySlide: Record<string, string>;
  setVersionIdBySlide: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  getVisibleVersions: (slideId: string) => SlideImageVersion[];
  getLayer: (slideId: string) => SlideRenderLayer | undefined;
  getBackgroundUrl: (slideId: string) => string;
  formatVersionLabel: (version: SlideImageVersion, index: number) => string;
  getVersionId: (slideId: string) => string;
  /** The reference template applied to the deck, shown behind unrendered slides. */
  templateImage: string | null;
}

interface DeckViewProps {
  deck: DeckViewModel;
  exporter: ReturnType<typeof useDeckExport>;
  /** The editable export: its run, and the pages it can export. */
  editable: { exporter: EditableExport; slides: EditableExportSlide[] };
  materials: ReturnType<typeof useSlideMaterials>;
  inputs: ReturnType<typeof useCreationInputs>;
  slideshow: ReturnType<typeof useSlideshow>;
  actions: {
    addSlideToChat: (slide: SlideData) => void;
    /** Take the slide's picture to the free canvas to mark up there (absent without the app shell). */
    editOnBoard?: (slide: SlideData) => void;
    backToStart: () => void;
    backConfirmOpen: boolean;
    confirmBackToStart: () => void;
    setBackConfirmOpen: (open: boolean) => void;
    downloadPpt: () => void;
    downloadPdf: () => void;
    downloadEditablePpt: () => void;
    generateAiImage: () => void;
    retryFailedBeautify: () => void;
    /** Clear the rebuild log once it has been read. */
    dismissExportLog: () => void;
  };
  status: {
    currentSlideFailure: string | undefined;
    failedBeautifyCount: number;
    isApplyingEdits: boolean;
    isGeneratingImage: boolean;
    /** Which slide the editable export is on, while it runs. */
    exportProgress?: string;
    /** Step-by-step detail of the rebuild, newest last. */
    exportLog?: RebuildLogEntry[];
  };
  layout: {
    canvasRef: React.MutableRefObject<HTMLDivElement | null>;
    canvasSize: { width: number; height: number };
    window: { width: number; height: number };
  };
  creationMode: CreationMode;
  progress: CreationProgress;
  tr: (zh: string, en: string) => string;
  uiLang: string;
}

/**
 * The finished deck: the slide list, the page being looked at, and -- once
 * the user asks to export an editable file -- the review canvas laid over it.
 *
 * Review is the same screen rather than a separate one on purpose: the point
 * is to check the extracted text against the rendered slide behind it.
 */
export function DeckView({
  deck,
  exporter,
  editable,
  materials,
  inputs,
  slideshow,
  actions,
  status,
  layout,
  creationMode,
  progress,
  tr,
  uiLang,
}: DeckViewProps) {
  // The thumbnail rail: dragged wider or narrower by its right edge, or hidden.
  const [railWidth, setRailWidth] = useState(() => {
    try { return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Number(localStorage.getItem(RAIL_KEY)) || 256)); } catch { return 256; }
  });
  const [railOpen, setRailOpen] = useState(true);
  const startRailDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = railWidth;
    let width = startWidth;
    const move = (e: PointerEvent) => { width = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startWidth + e.clientX - startX)); setRailWidth(width); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      try { localStorage.setItem(RAIL_KEY, String(Math.round(width))); } catch { /* not kept */ }
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const renderScaledSlideScene = (
    slide: SlideData,
    _editable = false,
    outerWidth = PPT_REFERENCE_SLIDE_WIDTH,
    outerHeight = PPT_REFERENCE_SLIDE_HEIGHT,
  ) => {
    const backgroundUrl = deck.getBackgroundUrl(slide.id);
    if (!backgroundUrl) return null;

    return (
      <PptEditorBridge
        slide={canvasAnvilToEditorSlide(slide, {
          renderLayer: deck.getLayer(slide.id),
          backgroundImageUrl: backgroundUrl,
        })}
        canvasWidth={outerWidth}
        canvasHeight={outerHeight}
        showElements={false}
      />
    );
  };
  return (
    <div className="relative w-full h-full bg-muted flex flex-col">
      <RebuildLogPanel
        progress={status.exportProgress || ""}
        entries={status.exportLog || []}
        onDismiss={actions.dismissExportLog}
        tr={tr}
        uiLang={uiLang === "zh" ? "zh" : "en"}
      />
      <EditableExportDialog editable={editable.exporter} slides={editable.slides} tr={tr} />
      {/* Toolbar */}
      <div className="relative z-50 h-14 px-4 bg-card border-b border-border flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
            <button
                type="button"
                onClick={() => setRailOpen((open) => !open)}
                aria-label={railOpen ? tr("收起页面列表", "Hide slide list") : tr("展开页面列表", "Show slide list")}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                {railOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
            <button
                onClick={actions.backToStart}
                title={tr("返回开始", "Back to start")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回", "Back")}</span>
            </button>
            <div className="h-4 w-px bg-border"></div>
            <button
                onClick={() => slideshow.open(deck.currentIndex)}
                disabled={deck.slides.length === 0}
                title={tr("从当前页开始放映", "Present from the current slide")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Presentation className="w-3.5 h-3.5" />
                <span>{tr("放映", "Present")}</span>
            </button>
            <div ref={exporter.menuRef} className="relative z-[60] flex items-center gap-2">
              <button
                onClick={() => exporter.setMenuOpen((open) => !open)}
                disabled={deck.slides.length === 0 || !!exporter.isExporting}
                title={tr("导出", "Export")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                {exporter.isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>
                  {exporter.isExporting
                    ? status.exportProgress || tr("导出中…", "Exporting...")
                    : tr("导出", "Export")}
                </span>
              </button>
              {exporter.menuOpen && !exporter.isExporting ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute left-0 top-full z-[70] mt-2 min-w-[190px] rounded-xl border border-border bg-popover p-2 shadow-soft-lg"
                >
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-accent"
                    onClick={() => {
                      exporter.setMenuOpen(false);
                      void actions.downloadPdf();
                    }}
                  >
                    {tr("导出 PDF", "Export PDF")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-accent"
                    onClick={() => {
                      exporter.setMenuOpen(false);
                      void actions.downloadPpt();
                    }}
                  >
                    {tr("导出图片版 PPT", "Export Image PPT")}
                  </button>
                  {SHOW_EDITABLE_EXPORT && (
                    <button
                      type="button"
                      disabled={editable.exporter.busy || editable.slides.length === 0}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        exporter.setMenuOpen(false);
                        void actions.downloadEditablePpt();
                      }}
                    >
                      {editable.exporter.busy ? tr("可编辑 PPTX 导出中…", "Editable PPTX exporting...") : tr("导出可编辑 PPTX", "Export Editable PPTX")}
                    </button>
                  )}
                </motion.div>
              ) : null}
              <EditableExportRunPanel editable={editable.exporter} tr={tr} uiLang={uiLang} />
            </div>
            {creationMode === "beautify" && (
              <button
                onClick={actions.retryFailedBeautify}
                disabled={status.failedBeautifyCount === 0 || Boolean(progress.message)}
                title={tr("重试失败页", "Retry failed slides")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tr("重试失败页", "Retry failed")}</span>
                {status.failedBeautifyCount > 0 ? <span className="rounded bg-destructive/12 px-1.5 py-0.5 text-[10px] text-destructive">{status.failedBeautifyCount}</span> : null}
              </button>
            )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {creationMode === "beautify" && status.failedBeautifyCount > 0 ? (
              <span className="rounded border border-destructive/25 bg-destructive/[0.08] px-2 py-1 text-destructive">
                {tr(`失败 ${status.failedBeautifyCount} 页`, `${status.failedBeautifyCount} failed`)}
              </span>
            ) : null}
            <span>{deck.slides.length > 0 ? tr(`第 ${deck.currentIndex + 1} / ${deck.slides.length} 页`, `Slide ${deck.currentIndex + 1} / ${deck.slides.length}`) : tr("空文档", "Empty")}</span>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        {railOpen && (
        <div className="relative shrink-0" style={{ width: railWidth }}>
        <div className="h-full bg-sunken border-r border-border overflow-y-auto p-4 space-y-4">
          {deck.slides.map((slide, index) => {
            const hasGeneratedImage = deck.getBackgroundUrl(slide.id);
            const slideFailure = inputs.beautify.failures[slide.id];
            return (
                    <div key={slide.id || index} 
                    onClick={() => deck.setCurrentIndex(index)}
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                    className={`animate-rise-in cursor-pointer border-2 rounded-lg overflow-hidden relative aspect-[16/9] group transition-[border-color,box-shadow,transform] duration-base ease-out-soft ${
                        deck.currentIndex === index
                        ? 'border-primary shadow-soft scale-[1.02]'
                        : 'border-transparent hover:border-border hover:-translate-y-0.5 bg-card shadow-xs'
                    }`}
                    >
                    <div
                      className="absolute top-1 left-1 z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="flex h-6 items-center gap-1 rounded-md bg-background/90 px-2 text-[11px] text-foreground shadow-sm ring-1 ring-border backdrop-blur-sm opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => actions.addSlideToChat(slide)}
                      >
                        <MessageSquarePlus className="size-3" />
                        {tr("加入对话", "Add to chat")}
                      </button>
                    </div>
                    {/* Thumbnail Preview */}
                    {hasGeneratedImage ? (
                        // The scene lays out at a fixed 240x135 while this slot is
                        // whatever the rail leaves it -- so it used to overflow by
                        // ~7% and have its right and bottom edges clipped.
                        <ScaleToFit width={240} height={135}>
                            {renderScaledSlideScene(slide, false, 240, 135)}
                        </ScaleToFit>
                    ) : (
                        <div className="w-full h-full p-2 flex flex-col bg-white text-[#141413] overflow-hidden text-[6px]">
                            {deck.templateImage && (
                                <img src={deck.templateImage} className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" alt="" />
                            )}
                            <div className="font-bold mb-1 truncate z-10 relative">{slide.title}</div>
                            <div className="flex-1 space-y-0.5 z-10 relative">
                                {(slide.content || []).slice(0, 3).map((line, i) => (
                                    <div key={i} className="truncate text-[#5B5751]">• {line}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 rounded-sm backdrop-blur-sm">
                        {index + 1}
                    </div>
                    {slideFailure ? (
                      <div
                        className="absolute top-1 right-1 bg-destructive/90 text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-sm max-w-[85%] truncate"
                        title={slideFailure}
                      >
                        {tr("美化失败", "Beautify failed")}
                      </div>
                    ) : null}
                    </div>
          )})}
          
          {deck.slides.length === 0 && (
             <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                    <Presentation className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {uiLang === "zh" ? "在左侧对话框中输入需求" : "Describe your needs in the chat on the left"}
                  <br />
                  {uiLang === "zh" ? "让 AI 为您生成 PPT" : "Let AI generate your PPT"}
                </p>
             </div>
          )}
        </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={tr("拖动调整页面列表宽度", "Drag to resize the slide list")}
            onPointerDown={startRailDrag}
            onDoubleClick={() => setRailWidth(256)}
            className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-primary/50"
          />
        </div>
        )}

        {/* Preview */}
        <div className="flex-1 p-4 flex items-center justify-center bg-accent/50 overflow-auto relative">
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-card/80 backdrop-blur rounded-xl border border-border/50 px-3 py-2 shadow-sm">
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={actions.generateAiImage}
              disabled={!deck.currentSlide || status.isGeneratingImage}
            >
              {status.isGeneratingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {tr("重新渲染本页", "Regenerate this slide")}
            </Button>
            {/* A bare <select> here rendered the OS widget -- system font, system
                chevron, system dropdown -- inside a card that is otherwise all
                tokens. The styled primitive already existed and had no callers. */}
            {deck.currentSlide && deck.getVisibleVersions(deck.currentSlide.id).length > 0 && (
              <Select
                value={deck.currentVersionId || undefined}
                onValueChange={(versionId) => {
                  const slideId = deck.currentSlide!.id;
                  const versions = deck.getVisibleVersions(slideId);
                  if (versions.some((x) => x.id === versionId)) {
                    deck.setVersionIdBySlide(prev => ({ ...prev, [slideId]: versionId }));
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={tr("选择版本", "Select version")}
                  className="h-7 max-w-[260px] gap-1.5 rounded-md border-border/70 px-2 text-xs shadow-none"
                >
                  <SelectValue placeholder={tr("选择版本", "Select version")} />
                </SelectTrigger>
                <SelectContent align="start" className="max-w-[320px]">
                  {deck.getVisibleVersions(deck.currentSlide.id).map((v, idx) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 font-medium">{deck.formatVersionLabel(v, idx)}</span>
                        {v.type !== "derived_textless" && (
                          <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                            {new Date(v.timestamp).toLocaleString()}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {actions.editOnBoard && deck.currentSlide && deck.currentSlideImage ? (
              <button
                type="button"
                onClick={() => actions.editOnBoard!(deck.currentSlide!)}
                disabled={status.isGeneratingImage || status.isApplyingEdits}
                title={tr("把这一页放到自由画布上圈改，改好再送回来", "Mark up this slide on the free canvas, then send it back")}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <PenLine className="size-3.5" />
                {tr("到自由画布修改", "Edit on free canvas")}
              </button>
            ) : null}
          </div>
          {status.currentSlideFailure ? (
            <div className="absolute top-16 left-4 z-30 max-w-[520px] rounded-lg border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-xs text-destructive shadow-sm">
              <span className="font-medium mr-1">{tr("本页美化失败：", "Slide beautify failed:")}</span>
              <span>{status.currentSlideFailure}</span>
            </div>
          ) : null}
          {deck.currentSlide ? (
                    <div 
                        ref={layout.canvasRef}
                        className="relative w-full max-w-[1100px] bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col transition-transform duration-300 outline-none"
                        style={{ aspectRatio: "16/9" }}
                    >
                        <PptEditorBridge
                          slide={deck.currentSlide ? canvasAnvilToEditorSlide(deck.currentSlide, {
                            renderLayer: deck.currentLayer,
                            backgroundImageUrl: deck.currentSlideImage || undefined,
                          }) : null}
                          canvasWidth={layout.canvasSize.width}
                          canvasHeight={layout.canvasSize.height}
                          showElements={false}
                          showTextElements={false}
                          showImageElements
                          showShapeElements
                          emptyState={
                            <div className="w-full h-full p-12 flex flex-col relative">
                              {deck.templateImage && (
                                <img src={deck.templateImage} className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" alt="Template" />
                              )}

                              <div className="relative z-10 h-full flex flex-col">
                                <h1 className="mb-8 w-fit border-b-4 border-[#C96442] pb-4 pr-12 text-4xl font-bold text-[#141413]">
                                  {deck.currentSlide.title}
                                </h1>
                                <div className="flex-1 space-y-6">
                                  {(deck.currentSlide.content || []).map((point, i) => (
                                    <div key={i} className="flex items-start gap-4 text-2xl leading-relaxed text-[#3B3833]">
                                      <span className="mt-2 text-primary-strong">•</span>
                                      <span>{point}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-auto flex justify-between border-t border-[#E3DFD7] pt-8 text-sm text-[#6E6A62]">
                                  <span>Generated by Unified AI Workspace</span>
                                  <span>{deck.currentIndex + 1}</span>
                                </div>
                              </div>
                            </div>
                          }
                        >
                        </PptEditorBridge>
                        
                        {/* Overlay Label if Generated */}
                        {(status.isApplyingEdits || status.isGeneratingImage) && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                                <div className="flex flex-col items-center gap-3 bg-card shadow-soft-lg px-6 py-4 rounded-xl border border-primary/25">
                                    <Loader2 className="w-6 h-6 text-primary-strong animate-spin" />
                                    <span className="text-sm font-medium text-foreground/80">{tr("幻灯片正在生成中...", "Generating slides...")}</span>
                                </div>
                            </div>
                        )}
                    </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>{tr("暂无幻灯片", "No slides yet")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={slideshow.isOpen} onOpenChange={(open) => { if (!open) slideshow.close(); }}>
        <DialogContent className="block [&>button:last-child]:hidden inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-[#0d0d0c] border-none">
          <DialogTitle className="sr-only">{tr("放映", "Slideshow")}</DialogTitle>
          {(() => {
            const current = deck.slides[slideshow.index];
            const total = deck.slides.length;
            const note = (current?.note || "").trim();
            const hasNotes = deck.slides.some((slide) => (slide.note || "").trim());
            const notesOn = slideshow.showNotes && hasNotes;
            // Room for the top bar, the bottom controls and, when shown, the notes.
            const reserved = 56 + 64 + (notesOn ? 168 : 0);
            const slideDims = getSlideshowDimensions({
              width: layout.window.width,
              height: layout.window.width ? Math.max(240, layout.window.height - reserved) / 0.85 : 0,
            });
            const slideWidth = typeof slideDims.width === "number" ? slideDims.width : 1100;
            const slideHeight = typeof slideDims.height === "number" ? slideDims.height : 619;
            const barButton = "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white";
            return (
          <div ref={slideshow.rootRef} className="group/show flex h-full w-full flex-col bg-[#0d0d0c] text-white">
            {/* Top bar: fades away until the pointer comes near it. */}
            <div className="flex h-14 shrink-0 items-center justify-between px-5 opacity-0 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100">
              <span className="min-w-0 truncate text-[13px] text-white/60">{current?.title || ""}</span>
              <div className="flex items-center gap-1">
                {hasNotes ? (
                  <button type="button" className={barButton} onClick={() => slideshow.setShowNotes((v) => !v)} aria-pressed={notesOn}>
                    {slideshow.showNotes ? tr("隐藏备注", "Hide notes") : tr("显示备注", "Show notes")}
                    <kbd className="ml-1 rounded border border-white/20 px-1 text-[10px] text-white/50">N</kbd>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={barButton}
                  onClick={() => { if (slideshow.isFullscreen) void slideshow.exitFullscreen(); else void slideshow.enterFullscreen(); }}
                >
                  {slideshow.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  {slideshow.isFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("全屏", "Fullscreen")}
                </button>
                <button type="button" className={barButton} onClick={slideshow.close}>
                  <X className="size-4" />
                  {tr("退出放映", "End show")}
                </button>
              </div>
            </div>

            {/* The slide: click the left third to go back, elsewhere to go on. */}
            <div className="flex min-h-0 flex-1 items-center justify-center px-6">
              {current ? (
                <div
                  className="relative cursor-pointer overflow-hidden rounded-md bg-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                  style={{ width: slideDims.width, height: slideDims.height }}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    if (event.clientX - box.left < box.width / 3) slideshow.previous();
                    else slideshow.next();
                  }}
                >
                  {deck.getBackgroundUrl(current.id) ? (
                    renderScaledSlideScene(current, false, slideWidth, slideHeight)
                  ) : (
                    <div className="flex h-full w-full flex-col p-[6%]">
                      <h1 className="mb-[5%] w-fit border-b-4 border-[#C96442] pb-[2%] pr-[8%] font-bold text-[#141413]" style={{ fontSize: slideWidth * 0.042 }}>
                        {current.title}
                      </h1>
                      <div className="flex-1 space-y-[2.5%]" style={{ fontSize: slideWidth * 0.024 }}>
                        {(current.content || []).map((point, i) => (
                          <div key={i} className="flex items-start gap-[2%] leading-relaxed text-[#3B3833]">
                            <span className="text-primary-strong">•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Speaker notes, under the slide, as wide as the slide. */}
            {notesOn ? (
              <div className="mx-auto mt-4 h-[152px] shrink-0 overflow-y-auto rounded-lg bg-white/[0.06] px-5 py-3.5" style={{ width: slideDims.width }}>
                <p className="mb-1.5 text-[11px] font-medium tracking-wider text-white/40">{tr("演讲备注", "SPEAKER NOTES")}</p>
                {note ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">{note}</p>
                ) : (
                  <p className="text-[14px] text-white/35">{tr("这一页没有备注", "No notes for this slide")}</p>
                )}
              </div>
            ) : null}

            {/* Controls and progress. */}
            <div className="flex h-16 shrink-0 items-center justify-center gap-5">
              <button
                type="button"
                aria-label={tr("上一页", "Previous slide")}
                className="flex size-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                onClick={slideshow.previous}
                disabled={total <= 1}
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="flex w-[220px] flex-col items-center gap-1.5">
                <span className="text-[12px] tabular-nums text-white/55">{total ? `${slideshow.index + 1} / ${total}` : ""}</span>
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white/60 transition-[width] duration-300" style={{ width: total ? `${((slideshow.index + 1) / total) * 100}%` : 0 }} />
                </div>
              </div>
              <button
                type="button"
                aria-label={tr("下一页", "Next slide")}
                className="flex size-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                onClick={slideshow.next}
                disabled={total <= 1}
              >
                <ArrowRight className="size-5" />
              </button>
            </div>
          </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      <Dialog open={actions.backConfirmOpen} onOpenChange={actions.setBackConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("确认返回开始", "Confirm restart")}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {tr(
              "返回开始将清空当前 PPT（建议先导出保存）。是否继续？",
              "Restart will clear the current deck (export first if needed). Continue?"
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => actions.setBackConfirmOpen(false)}>
              {tr("取消", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                actions.setBackConfirmOpen(false);
                actions.confirmBackToStart();
              }}
            >
              {tr("确认返回", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={materials.preview.open}
        onOpenChange={(open) => materials.setPreview((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
          </DialogHeader>
          {materials.preview.item && (
            <div className="space-y-3">
              <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                <img
                  src={materials.preview.item.dataUrl}
                  alt={materials.preview.item.name}
                  className="block max-h-full max-w-full object-scale-down"
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>{tr("所在幻灯片", "Slide")}: {materials.preview.slideTitle || "-"}</div>
                <div>{tr("素材编号", "Material label")}: {materials.preview.item.name}</div>
                {materials.preview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materials.preview.item.refLabel}</div> : null}
                {materials.preview.item.caption ? <div>{tr("简短说明", "Caption")}: {materials.preview.item.caption}</div> : null}
                {materials.preview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materials.preview.item.sourceFileName}</div> : null}
                {typeof materials.preview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materials.preview.item.sourcePage}</div> : null}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(materials.preview.item!.dataUrl, "_blank", "noopener,noreferrer")}
                >
                  {tr("在新窗口查看原图", "Open full image in new tab")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
