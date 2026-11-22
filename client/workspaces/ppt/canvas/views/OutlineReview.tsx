import { useState } from "react";
import { Eye, Library, MessageSquarePlus, Plus, Trash2, Upload } from "lucide-react";
import { notify } from "@/shared/ui/notify";
import { canReference, openReferencePicker } from "@/shared/references/bus";
import { referenceToFiles } from "@/shared/references/to-files";
import { useWork } from "@/shared/works/work-context";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import type { SlideData } from "@/workspaces/ppt/canvas/types";
import type { useSlideMaterials } from "@/workspaces/ppt/canvas/hooks/use-slide-materials";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

interface OutlineReviewProps {
  slides: SlideData[];
  setSlides: React.Dispatch<React.SetStateAction<SlideData[]>>;
  materials: ReturnType<typeof useSlideMaterials>;
  tr: (zh: string, en: string) => string;
  onAddSlide: (afterIndex?: number) => void;
  onDeleteSlide: (slideId: string) => void;
  onAddSlideToChat: (slide: SlideData) => void;
}

/**
 * The plan the user reviews before any images are rendered.
 *
 * This is the last point at which changes are cheap: every edit here costs
 * nothing, while the same change after generation means re-rendering slides.
 * Confirming it, and picking the style, happen in the chat's steps.
 */
export function OutlineReview({
  slides,
  setSlides,
  materials,
  tr,
  onAddSlide,
  onDeleteSlide,
  onAddSlideToChat,
}: OutlineReviewProps) {
  const work = useWork();
  /** Pictures from another work become this slide's materials, already named in its description. */
  const referenceInto = async (slideId: string) => {
    const reference = await openReferencePicker({ from: { workspace: "ppt", workId: work?.workId }, accept: ["image"] });
    if (!reference) return;
    const added = await materials.addReferencedImages(slideId, referenceToFiles(reference), reference.workName);
    if (added.length) notify.success(tr(`已加为素材：${added.map((x) => x.name).join("、")}`, `Added as materials: ${added.map((x) => x.name).join(", ")}`), { description: tr("生成这一页时会用上。", "They are used when the slide is made.") });
  };
  const [deleting, setDeleting] = useState<{ id: string; index: number } | null>(null);
  return (
    <div className="w-full h-full bg-background flex flex-col overflow-hidden">
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={tr(`删除第 ${(deleting?.index ?? 0) + 1} 页大纲？`, `Delete outline slide ${(deleting?.index ?? 0) + 1}?`)}
          description={tr("这一页的标题和要点会被删除。", "This slide's title and points will be removed.")}
          confirmLabel={tr("删除", "Delete")}
          cancelLabel={tr("取消", "Cancel")}
          onConfirm={() => deleting && onDeleteSlide(deleting.id)}
        />
        {/* No card around the outline: it is the canvas itself, heading, slides and actions. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-8 pt-6 pb-2 flex justify-between items-baseline">
                <h3 className="font-semibold text-lg">{tr("确认大纲", "Review outline")}</h3>
                <div className="text-sm text-muted-foreground">{tr(`共 ${slides.length} 页`, `${slides.length} slides`)}</div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-8 pb-6 divide-y divide-border/70">
                {slides.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {tr("当前没有大纲，请返回修改后重新生成。", "No outline yet. Go back and regenerate.")}
                  </div>
                )}
                {slides.map((slide, i) => (
                    <div
                      key={slide.id || i}
                      style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      className="animate-rise-in flex gap-4 py-6"
                    >
                        <div className="w-6 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                            {i + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <input 
                                  value={slide.title}
                                  onChange={(e) => {
                                      setSlides((prev) =>
                                        prev.map((slide, n) => (n === i ? { ...slide, title: e.target.value } : slide)),
                                      );
                                  }}
                                  className="w-full font-medium bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => onAddSlide(i)} title={tr("在当前页后新增大纲", "Add outline after current")}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  {tr("新增", "Add")}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeleting({ id: slide.id, index: i })}
                                  title={tr("删除当前大纲", "Delete current outline")}
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  {tr("删除", "Delete")}
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => onAddSlideToChat(slide)} className="shrink-0">
                                  <MessageSquarePlus className="w-4 h-4 mr-2" />
                                  {tr("加入对话", "Add to chat")}
                                </Button>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-foreground mb-1">{tr("要点内容（content）", "Bullet content (content)")}</div>
                              <textarea
                                value={(slide.content || []).join("\n")}
                                onChange={(e) => {
                                  const lines = String(e.target.value || "")
                                    .split(/\r?\n/)
                                    .map((x) => x.trim())
                                    .filter((x) => x.length > 0);
                                  setSlides((prev) =>
                                    prev.map((slide, n) => (n === i ? { ...slide, content: lines } : slide)),
                                  );
                                }}
                                className="w-full h-24 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                placeholder={tr("每行一个要点，例如：\n市场现状与挑战\n核心方案与价值\n落地计划与里程碑", "One bullet per line, e.g.:\nMarket status and challenges\nCore solution and value\nExecution plan and milestones")}
                              />
                            </div>
                            <div className="pt-3 grid gap-3">
                              <div>
                                <div className="text-xs font-medium text-foreground mb-1">{tr("布局提示（layout）", "Layout hint (layout)")}</div>
                                <input
                                  value={slide.layout || ""}
                                  onChange={(e) => {
                                    setSlides((prev) =>
                                      prev.map((slide, n) => (n === i ? { ...slide, layout: e.target.value } : slide)),
                                    );
                                  }}
                                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  placeholder={tr("例如：cover / title+bullets / two-column / left-text-right-image", "e.g. cover / title+bullets / two-column / left-text-right-image")}
                                />
                              </div>
                              <div>
                                <div className="text-xs font-medium text-foreground mb-1">{tr("演讲者备注（note）", "Speaker notes (note)")}</div>
                                <textarea
                                  value={slide.note || ""}
                                  onChange={(e) => {
                                    setSlides((prev) =>
                                      prev.map((slide, n) => (n === i ? { ...slide, note: e.target.value } : slide)),
                                    );
                                  }}
                                  className="w-full h-20 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  placeholder={tr("例如：这一页强调三个关键点；讲解时先抛出问题再给答案。", "e.g. Emphasize three key points; start with a question, then answer it.")}
                                />
                              </div>
                              <div className="relative">
                                <div className="text-xs font-medium text-foreground mb-1">{tr("画面描述（description，用于生图）", "Visual description (description)")}</div>
                                <div
                                  ref={(el) => {
                                    materials.editor.refs.current[slide.id] = el;
                                    if (el) materials.editor.render(slide.id, slide.description || "");
                                  }}
                                  contentEditable
                                  suppressContentEditableWarning
                                  data-peek-slide={slide.id}
                                  onFocus={() => {
                                    materials.editor.focusedRef.current = slide.id;
                                  }}
                                  onBlur={() => {
                                    materials.editor.focusedRef.current = null;
                                    const nextValue = materials.editor.parse(slide.id);
                                    materials.editor.appliedRef.current[slide.id] = nextValue;
                                    setSlides((prev) =>
                                      prev.map((slide, n) => (n === i ? { ...slide, description: nextValue } : slide)),
                                    );
                                  }}
                                  onInput={() => {
                                    const nextValue = materials.editor.parse(slide.id);
                                    materials.editor.appliedRef.current[slide.id] = nextValue;
                                    setSlides((prev) =>
                                      prev.map((slide, n) => (n === i ? { ...slide, description: nextValue } : slide)),
                                    );
                                  }}
                                  onKeyDown={(e) => {
                                    if (materials.picker.slideId === slide.id && (materials.slideMaterials[slide.id] || []).length > 0) {
                                      const list = materials.slideMaterials[slide.id] || [];
                                      const len = list.length;
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        materials.picker.setActiveIndex((prev) => (prev + 1) % len);
                                        return;
                                      }
                                      if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        materials.picker.setActiveIndex((prev) => (prev - 1 + len) % len);
                                        return;
                                      }
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const idx = Math.max(0, Math.min(materials.picker.activeIndex, len - 1));
                                        const picked = list[idx];
                                        if (picked) {
                                          materials.picker.insertToken(i, slide.id, picked.name);
                                        }
                                        return;
                                      }
                                    }
                                    if (e.key === "Escape") {
                                      materials.picker.close();
                                      return;
                                    }
                                    if ((e.key === "Backspace" || e.key === "Delete") && e.currentTarget) {
                                      const root = e.currentTarget;
                                      const sel = window.getSelection();
                                      if (!sel || sel.rangeCount === 0) return;
                                      const r = sel.getRangeAt(0);
                                      if (!root.contains(r.startContainer) || !r.collapsed) return;
                                      const tryRemoveToken = (el: Element | null) => {
                                        if (!el) return false;
                                        const token = (el as HTMLElement).getAttribute("data-material-token");
                                        if (!token) return false;
                                        el.remove();
                                        return true;
                                      };
                                      if (r.startContainer.nodeType === Node.TEXT_NODE) {
                                        const t = r.startContainer as Text;
                                        if (e.key === "Backspace" && r.startOffset === 0) {
                                          const prev = t.previousSibling;
                                          if (prev && prev.nodeType === Node.ELEMENT_NODE && tryRemoveToken(prev as Element)) {
                                            e.preventDefault();
                                          }
                                        }
                                        if (e.key === "Delete" && r.startOffset === t.data.length) {
                                          const next = t.nextSibling;
                                          if (next && next.nodeType === Node.ELEMENT_NODE && tryRemoveToken(next as Element)) {
                                            e.preventDefault();
                                          }
                                        }
                                      }
                                    }
                                  }}
                                  onKeyUp={(e) => {
                                    if ((materials.slideMaterials[slide.id] || []).length === 0) return;
                                    if (e.key === "/" || e.key === "／") {
                                      materials.picker.openAtCaret(slide.id);
                                    }
                                  }}
                                  className="w-full min-h-[96px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  data-placeholder={tr("例如：科技感蓝色渐变背景，中间是 AI 芯片与电路纹理，留白清晰。", "e.g. Futuristic blue gradient background, abstract AI chip and circuit textures, clean whitespace.")}
                                />
                                {materials.picker.slideId === slide.id && (materials.slideMaterials[slide.id] || []).length > 0 && (
                                  <div
                                    ref={materials.picker.ref}
                                    className="absolute z-20 w-56 rounded-md border border-border bg-popover p-2 shadow-sm"
                                    style={{ left: materials.picker.pos?.left ?? 8, top: materials.picker.pos?.top ?? 8 }}
                                  >
                                    <div className="max-h-56 space-y-1 overflow-y-auto">
                                      {(materials.slideMaterials[slide.id] || []).map((img, idx) => (
                                      <button
                                        key={img.id}
                                        type="button"
                                        onClick={() => materials.picker.insertToken(i, slide.id, img.name)}
                                        onMouseEnter={() => materials.picker.setActiveIndex(idx)}
                                        title={tr(`插入第 ${idx + 1} 张素材`, `Insert material ${idx + 1}`)}
                                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                                          materials.picker.activeIndex === idx
                                            ? "border-primary/40 bg-primary/12 text-primary-strong ring-1 ring-primary/40"
                                              : "border-primary/30 bg-primary/[0.08] text-primary-strong hover:bg-primary/15"
                                          }`}
                                        >
                                          <img src={img.dataUrl} alt={img.name} className="h-8 w-8 rounded object-cover" />
                                          <span className="truncate">{img.name}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                                  <span>{tr("素材图片（用于该页生图）", "Material images (for this slide)")}</span>
                                  <span className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => materials.editor.inputRefs.current[slide.id]?.click()}
                                    title={tr("上传素材图片", "Upload material images")}
                                    className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-foreground/80 hover:bg-accent"
                                  >
                                    <Upload className="h-3.5 w-3.5" />
                                    {tr("上传", "Upload")}
                                  </button>
                                  {canReference() && (
                                    <button
                                      type="button"
                                      onClick={() => void referenceInto(slide.id)}
                                      title={tr("从其他画布的作品里引用图片", "Reference pictures from a work in another canvas")}
                                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-foreground/80 hover:bg-accent"
                                    >
                                      <Library className="h-3.5 w-3.5" />
                                      {tr("从作品引用", "From a work")}
                                    </button>
                                  )}
                                  </span>
                                  <input
                                    ref={(el) => {
                                      materials.editor.inputRefs.current[slide.id] = el;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || []);
                                      e.target.value = "";
                                      void materials.addImages(slide.id, files);
                                    }}
                                  />
                                </div>
                                {(materials.slideMaterials[slide.id] || []).length === 0 ? (
                                  <div className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                                    {tr("暂无素材，上传后可在 description 输入 / 选择变量", "No materials yet. Upload images, then type / in description to insert variables.")}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-3">
                                    {(materials.slideMaterials[slide.id] || []).map((img) => (
                                      <div key={img.id} className="w-20">
                                        <div
                                          className="group relative h-20 w-20 cursor-zoom-in overflow-hidden rounded-md border bg-background"
                                          onClick={() => materials.setPreview({ open: true, slideTitle: slide.title, item: img })}
                                          title={tr("点击查看素材", "Click to preview material")}
                                        >
                                          <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              materials.setPreview({ open: true, slideTitle: slide.title, item: img });
                                            }}
                                            className="absolute bottom-1 left-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/85 text-primary-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-primary/90"
                                            aria-label={tr("查看素材", "Preview material")}
                                            title={tr("查看", "Preview")}
                                          >
                                            <Eye className="h-3 w-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              materials.removeImage(slide.id, img.id);
                                            }}
                                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-black/80"
                                            aria-label={tr("移除素材", "Remove material")}
                                            title={tr("移除", "Remove")}
                                          >
                                            ×
                                          </button>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => materials.setPreview({ open: true, slideTitle: slide.title, item: img })}
                                          className="mt-1 w-full truncate text-center text-xs text-foreground hover:text-primary-strong"
                                          title={tr("点击查看素材", "Click to preview material")}
                                        >
                                          {img.name}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

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
        </div>
    </div>
  );
}
