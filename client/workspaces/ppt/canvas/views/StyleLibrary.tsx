import { useMemo, useRef, useState } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { TEMPLATE_CATEGORIES } from "@/workspaces/ppt/canvas/lib/constants";
import type { useTemplateLibrary } from "@/workspaces/ppt/canvas/hooks/use-template-library";
import { recommendCategoryId, topicOf } from "@/workspaces/ppt/lib/creation-intent";

const ALL = "__all__";
const MINE = "__mine__";
const RECOMMENDED = 4;

type Library = ReturnType<typeof useTemplateLibrary>;
type Template = Library["templates"][number];

interface StyleLibraryProps {
  templateLibrary: Library;
  tr: (zh: string, en: string) => string;
  /** What the deck is about, so the library can suggest styles for it. */
  draftText?: string;
  /**
   * "picker": choosing the deck's style (the outline step); a click applies it.
   * "library": My works' template library, for looking through, adding and deleting.
   */
  variant?: "picker" | "library";
  /** Called after a style is chosen in the picker. */
  onPicked?: () => void;
}

/**
 * The style library: the built-in slide styles plus the ones the user has
 * uploaded or generated. The deck's style is chosen from it at the outline
 * step; My works shows the same library to look after it.
 */
export function StyleLibrary({ templateLibrary, tr, draftText = "", variant = "picker", onPicked }: StyleLibraryProps) {
  const picking = variant === "picker";
  const [active, setActive] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const { templates, selectedTemplateId } = templateLibrary;

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    let mine = 0;
    for (const t of templates) {
      if (t.kind === "upload") mine += 1;
      counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
    }
    const rows = [{ id: ALL, label: tr("全部", "All"), count: templates.length }];
    for (const c of TEMPLATE_CATEGORIES) {
      const count = counts.get(c.id) || 0;
      if (count > 0) rows.push({ id: c.id, label: tr(c.zhName, c.enName), count });
    }
    if (mine > 0) rows.push({ id: MINE, label: tr("我的模板", "Mine"), count: mine });
    return rows;
  }, [templates, tr]);

  // A bucket can empty out from under the selection (the last upload deleted
  // while "Mine" is open), so fall back rather than showing nothing.
  const activeId = filters.some((f) => f.id === active) ? active : ALL;
  const activeLabel = filters.find((f) => f.id === activeId)?.label ?? "";
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const inBucket =
      activeId === ALL
        ? templates
        : activeId === MINE
          ? templates.filter((t) => t.kind === "upload")
          : templates.filter((t) => t.categoryId === activeId);
    return needle ? inBucket.filter((t) => t.name.toLowerCase().includes(needle)) : inBucket;
  }, [templates, activeId, needle]);

  const topic = topicOf(draftText);
  const recommended = useMemo(() => {
    const categoryId = recommendCategoryId(draftText);
    return categoryId ? templates.filter((t) => t.categoryId === categoryId).slice(0, RECOMMENDED) : [];
  }, [templates, draftText]);

  // New templates are filed under the open category; "All" and "Mine" have none to inherit.
  const categoryForNewTemplate = activeId === ALL || activeId === MINE ? "other" : activeId;

  const tile = (t: Template) => {
    const selected = picking && selectedTemplateId === t.id;
    const pick = () => {
      if (!picking) return;
      void templateLibrary.selectTemplate(t);
      onPicked?.();
    };
    return (
      <div
        key={t.id}
        role={picking ? "button" : undefined}
        tabIndex={picking ? 0 : undefined}
        aria-pressed={picking ? selected : undefined}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
        className={cn(
          "group relative aspect-video overflow-hidden rounded-lg bg-muted outline-none",
          picking && "cursor-pointer",
          "transition-[transform,box-shadow] duration-base ease-out-soft hover:-translate-y-0.5 hover:shadow-soft-lg",
          "focus-visible:ring-[3px] focus-visible:ring-ring/35",
          selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "ring-1 ring-border",
        )}
      >
        <img src={t.previewSrc} loading="lazy" decoding="async" alt={t.name} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            templateLibrary.deleteTemplate(t);
          }}
          title={tr("删除模板", "Delete template")}
          className="absolute right-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-6 text-xs text-white transition-opacity",
            selected || !picking ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {t.name}
        </div>
      </div>
    );
  };

  const grid = "grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]";

  return (
    <div className="w-full">
      <div className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("搜风格：时间轴、看板、极简…", "Search styles: timeline, dashboard, minimal...")}
              className="h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => templateLibrary.handleUploadInputChange(e, categoryForNewTemplate)}
          />
          <Button type="button" variant="outline" onClick={() => uploadRef.current?.click()}>
            {tr("上传模板", "Upload template")}
          </Button>
          <Button type="button" variant="outline" onClick={() => templateLibrary.generator.openForCategory(categoryForNewTemplate)}>
            {tr("生成模板", "Generate template")}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              aria-pressed={activeId === f.id}
              className={cn(
                "h-8 rounded-md px-2.5 text-[13px] transition-colors duration-fast ease-out-soft",
                activeId === f.id
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {f.label}
              <span className="ml-1 text-xs tabular-nums opacity-55">{f.count}</span>
            </button>
          ))}
        </div>

        {picking && recommended.length > 0 && !needle && activeId === ALL ? (
          <section className="mt-6">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {tr("适合「", "Fits \"")}
                <span className="text-primary-strong">{topic}</span>
                {tr("」", "\"")}
              </h2>
              <span className="text-xs text-muted-foreground">{tr("按大纲内容挑的", "Picked from the outline")}</span>
            </div>
            <div className={grid}>{recommended.map(tile)}</div>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-foreground">{activeId === ALL ? tr("全部风格", "All styles") : activeLabel}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{visible.length}</span>
          </div>
          {visible.length > 0 ? (
            <div className={grid}>{visible.map(tile)}</div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{tr("没有找到匹配的风格。", "No style matches.")}</p>
          )}
        </section>
      </div>

      <Dialog open={templateLibrary.generator.open} onOpenChange={templateLibrary.generator.setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr("生成模板", "Generate template")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {tr("生成的模板会加入模板列表，可随时删除。", "The generated template is added to the list and can be deleted anytime.")}
            </div>
            <Textarea
              value={templateLibrary.generator.requirement}
              onChange={(e) => templateLibrary.generator.setRequirement(e.target.value)}
              placeholder={tr(
                "例如：科技感、深色背景、蓝紫渐变、留白充足；不要出现任何文字。",
                "e.g. Futuristic, dark background, blue-purple gradient, generous whitespace; no text.",
              )}
              className="min-h-[140px]"
              disabled={templateLibrary.generator.isGenerating}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => templateLibrary.generator.setOpen(false)}
                disabled={templateLibrary.generator.isGenerating}
              >
                {tr("取消", "Cancel")}
              </Button>
              <Button
                type="button"
                onClick={templateLibrary.generator.generate}
                disabled={templateLibrary.generator.isGenerating || !templateLibrary.generator.requirement.trim()}
              >
                {templateLibrary.generator.isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {templateLibrary.generator.isGenerating ? tr("生成中...", "Generating...") : tr("生成并保存", "Generate and save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
