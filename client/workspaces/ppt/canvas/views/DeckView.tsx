import {
  ArrowLeft,
  ArrowRight,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { ScaleToFit } from "@/shared/ui/scale-to-fit";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { Button } from "@/shared/ui/button";
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

/** The deck as this screen needs to see it: the slides, and how to resolve one. */
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
  materials: ReturnType<typeof useSlideMaterials>;
  inputs: ReturnType<typeof useCreationInputs>;
  slideshow: ReturnType<typeof useSlideshow>;
  actions: {
    addSlideToChat: (slide: SlideData) => void;
    backToStart: () => void;
    backConfirmOpen: boolean;
    confirmBackToStart: () => void;
    setBackConfirmOpen: (open: boolean) => void;
    downloadPpt: () => void;
    downloadPdf: () => void;
    downloadEditablePpt: () => void;
    generateAiImage: () => void;
    retryFailedBeautify: () => void;
  };
  status: {
    currentSlideFailure: string | undefined;
    failedBeautifyCount: number;
    failedImageTransformCount: number;
    isApplyingEdits: boolean;
    isGeneratingImage: boolean;
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
    <div className="w-full h-full bg-muted flex flex-col">
      {/* Toolbar */}
      <div className="relative z-50 h-14 px-4 bg-card border-b border-border flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4 [&>h2]:hidden">
            <h2 className="hidden font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
            <div className="font-semibold text-sm text-foreground">{tr("PPT \u6f14\u793a\u6587\u7a3f", "PPT Deck")}</div>
            <button
                onClick={actions.backToStart}
                title={tr("返回开始", "Back to start")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回", "Back")}</span>
            </button>
            <h2 className="font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
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
            <div ref={exporter.menuRef} className="relative z-[60]">
              <button
                onClick={() => exporter.setMenuOpen((open) => !open)}
                disabled={deck.slides.length === 0 || !!exporter.isExporting}
                title={tr("导出", "Export")}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                {exporter.isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{exporter.isExporting ? tr("导出中…", "Exporting...") : tr("导出", "Export")}</span>
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
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-accent"
                    onClick={() => {
                      exporter.setMenuOpen(false);
                      void actions.downloadEditablePpt();
                    }}
                  >
                    {tr("导出可编辑 PPTX", "Export Editable PPTX")}
                  </button>
                </motion.div>
              ) : null}
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
            {creationMode === "image_transform" && status.failedImageTransformCount > 0 ? (
              <span className="rounded border border-destructive/25 bg-destructive/[0.08] px-2 py-1 text-destructive">
                {tr(`转化失败 ${status.failedImageTransformCount} 页`, `${status.failedImageTransformCount} failed`)}
              </span>
            ) : null}
            <span>{deck.slides.length > 0 ? tr(`第 ${deck.currentIndex + 1} / ${deck.slides.length} 页`, `Slide ${deck.currentIndex + 1} / ${deck.slides.length}`) : tr("空文档", "Empty")}</span>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-64 bg-sunken border-r border-border overflow-y-auto p-4 space-y-4">
          {deck.slides.map((slide, index) => {
            const hasGeneratedImage = deck.getBackgroundUrl(slide.id);
            const slideFailure = creationMode === "image_transform" ? inputs.imageTransform.failures[slide.id] : inputs.beautify.failures[slide.id];
            return (
            <ContextMenu key={slide.id || index}>
                <ContextMenuTrigger asChild>
                    <div 
                    onClick={() => deck.setCurrentIndex(index)}
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                    className={`animate-rise-in cursor-pointer border-2 rounded-lg overflow-hidden relative aspect-[16/9] group transition-[border-color,box-shadow,transform] duration-base ease-out-soft ${
                        deck.currentIndex === index
                        ? 'border-primary shadow-soft scale-[1.02]'
                        : 'border-transparent hover:border-border hover:-translate-y-0.5 bg-card shadow-xs'
                    }`}
                    >
                    {creationMode !== "image_transform" ? (
                      <div
                        className="absolute top-1 left-1 z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[10px] gap-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => actions.addSlideToChat(slide)}
                        >
                          <Presentation className="w-3 h-3" />
                          {tr("加入对话", "Add to chat")}
                        </Button>
                      </div>
                    ) : null}
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
                        {creationMode === "image_transform" ? tr("转化失败", "Transform failed") : tr("美化失败", "Beautify failed")}
                      </div>
                    ) : null}
                    </div>
                </ContextMenuTrigger>
                {creationMode !== "image_transform" ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => actions.addSlideToChat(slide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>{tr("把此页添加到对话", "Add this slide to chat")}</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          )})}
          
          {deck.slides.length === 0 && (
             <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                    <Presentation className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {uiLang === "zh" ? "在右侧对话框中输入需求" : "Describe your needs in the chat on the right"}
                  <br />
                  {uiLang === "zh" ? "让 AI 为您生成 PPT" : "Let AI generate your PPT"}
                </p>
             </div>
          )}
        </div>

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
            {deck.currentSlide && deck.getVisibleVersions(deck.currentSlide.id).length > 0 && (
              <select
                className="h-7 text-xs rounded-md border border-input bg-background px-2"
                value={deck.currentVersionId}
                onChange={(e) => {
                  const slideId = deck.currentSlide!.id;
                  const versionId = e.target.value;
                  const versions = deck.getVisibleVersions(slideId);
                  const v = versions.find(x => x.id === versionId);
                  if (v) {
                    deck.setVersionIdBySlide(prev => ({ ...prev, [slideId]: versionId }));
                  }
                }}
              >
                {deck.getVisibleVersions(deck.currentSlide.id).map((v, idx) => (
                  <option key={v.id} value={v.id}>
                    {v.type === "derived_textless"
                      ? deck.formatVersionLabel(v, idx)
                      : `${deck.formatVersionLabel(v, idx)} · ${new Date(v.timestamp).toLocaleString()}`}
                  </option>
                ))}
              </select>
            )}
          </div>
          {status.currentSlideFailure ? (
            <div className="absolute top-16 left-4 z-30 max-w-[520px] rounded-lg border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-xs text-destructive shadow-sm">
              <span className="font-medium mr-1">{creationMode === "image_transform" ? tr("本页转化失败：", "Slide transform failed:") : tr("本页美化失败：", "Slide beautify failed:")}</span>
              <span>{status.currentSlideFailure}</span>
            </div>
          ) : null}
          {deck.currentSlide ? (
             <ContextMenu>
                <ContextMenuTrigger asChild>
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
                </ContextMenuTrigger>
                {creationMode !== "image_transform" ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => deck.currentSlide && actions.addSlideToChat(deck.currentSlide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>把此页添加到对话</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>{tr("暂无幻灯片", "No slides yet")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={slideshow.isOpen} onOpenChange={(open) => { if (!open) slideshow.close(); }}>
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-black/95 border-none">
          <div ref={slideshow.rootRef} className="w-full h-full flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between text-white/90 bg-black/50 backdrop-blur-sm z-50">
            <div className="text-sm font-medium">
              {deck.slides.length > 0 ? `${uiLang === "zh" ? "第" : "Slide "}${slideshow.index + 1} / ${deck.slides.length}${uiLang === "zh" ? " 页" : ""}` : ""}
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                title={slideshow.isFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("进入全屏", "Enter fullscreen")}
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={() => {
                  if (slideshow.isFullscreen) {
                    void slideshow.exitFullscreen();
                  } else {
                    void slideshow.enterFullscreen();
                  }
                }}
              >
                {slideshow.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {slideshow.isFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("全屏", "Fullscreen")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={slideshow.close}
              >
                <X className="w-4 h-4" />
                {tr("退出", "Close")}
              </Button>
            </div>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden bg-black/90">
            {deck.slides[slideshow.index] ? (
              (() => {
                const slideDims = getSlideshowDimensions(layout.window);
                const slideWidth = typeof slideDims.width === "number" ? slideDims.width : 1100;
                const slideHeight = typeof slideDims.height === "number" ? slideDims.height : 619;
                return (
              <div className="relative w-full h-full flex items-center justify-center">
                  <div 
                    className="relative bg-white shadow-2xl overflow-hidden rounded-lg mx-auto"
                    style={{
                      width: slideDims.width,
                      height: slideDims.height
                    }}
                  >
                  {deck.getBackgroundUrl(deck.slides[slideshow.index].id) ? (
                    renderScaledSlideScene(deck.slides[slideshow.index], false, slideWidth, slideHeight)
                  ) : (
                    <div className="w-full h-full p-16 flex flex-col">
                      <h1 className="text-5xl font-bold mb-12 text-[#141413] border-b-4 border-[#C96442] pb-6 w-fit pr-16">
                        {deck.slides[slideshow.index].title}
                      </h1>
                      <div className="flex-1 space-y-8">
                        {(deck.slides[slideshow.index].content || []).map((point, i) => (
                          <div key={i} className="flex gap-6 text-3xl text-[#3B3833] leading-relaxed items-start">
                            <span className="text-primary-strong mt-2">•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-8 flex justify-between text-lg text-[#6E6A62] border-t border-[#E3DFD7]">
                        <span>Generated by Unified AI Workspace</span>
                        <span>{slideshow.index + 1}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                );
              })()
            ) : null}
          </div>

          <div className="h-20 px-4 flex items-center justify-center gap-8 pb-4">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={slideshow.previous}
              disabled={deck.slides.length <= 1}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="text-white/50 text-sm font-medium">
                {slideshow.index + 1} / {deck.slides.length}
            </div>
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={slideshow.next}
              disabled={deck.slides.length <= 1}
            >
              <ArrowRight className="w-6 h-6" />
            </Button>
          </div>
          </div>
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
