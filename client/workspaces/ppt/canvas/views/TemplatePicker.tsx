import { useMemo, useState } from "react";
import { Sparkles, Upload, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { TEMPLATE_CATEGORIES } from "@/workspaces/ppt/canvas/lib/constants";
import type { useTemplateLibrary } from "@/workspaces/ppt/canvas/hooks/use-template-library";

const ALL = "__all__";
const MINE = "__mine__";

interface TemplatePickerProps {
  templateLibrary: ReturnType<typeof useTemplateLibrary>;
  tr: (zh: string, en: string) => string;
  /** Rendered before the filter row; the step number and its label. */
  heading: React.ReactNode;
}

/**
 * The reference-template gallery, filtered by category.
 *
 * Only buckets that actually hold something are offered, so the row grows on
 * its own as templates are added and never shows a filter that leads nowhere.
 * The add and generate tiles stay put under every filter -- they are actions,
 * not results.
 */
export function TemplatePicker({ templateLibrary, tr, heading }: TemplatePickerProps) {
  const [active, setActive] = useState<string>(ALL);
  const { templates, selectedTemplateId } = templateLibrary;

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    let mine = 0;
    for (const t of templates) {
      if (t.kind === "upload") mine += 1;
      for (const c of t.categories) counts.set(c, (counts.get(c) || 0) + 1);
    }
    const rows = [{ id: ALL, label: tr("全部", "All"), count: templates.length }];
    for (const c of TEMPLATE_CATEGORIES) {
      const count = counts.get(c.id) || 0;
      if (count > 0) rows.push({ id: c.id, label: tr(c.zhName, c.enName), count });
    }
    if (mine > 0) rows.push({ id: MINE, label: tr("我的模板", "Mine"), count: mine });
    return rows;
  }, [templates, tr]);

  // A bucket can empty out from under the selection -- delete the last upload
  // while "Mine" is active -- so fall back rather than showing nothing.
  const activeId = filters.some((f) => f.id === active) ? active : ALL;

  const visible = useMemo(() => {
    if (activeId === ALL) return templates;
    if (activeId === MINE) return templates.filter((t) => t.kind === "upload");
    return templates.filter((t) => t.categories.includes(activeId));
  }, [templates, activeId]);

  const selectedName = templates.find((t) => t.id === selectedTemplateId)?.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        {selectedName && (
          <span className="text-xs text-muted-foreground">
            {tr("已选：", "Selected: ")}
            <span className="font-medium text-foreground">{selectedName}</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActive(f.id)}
            aria-pressed={activeId === f.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out-soft",
              activeId === f.id
                ? "border-primary/40 bg-primary/12 text-primary-strong"
                : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {f.label}
            <span className="ml-1 tabular-nums opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <label className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-border hover:border-primary hover:bg-primary/[0.08]">
          <div className="flex flex-col items-center text-muted-foreground/70 group-hover:text-primary-strong transition-colors">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2 group-hover:bg-primary/12 transition-colors">
              <Upload className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">{tr("添加模板", "Add template")}</span>
          </div>
          <input type="file" accept="image/*" multiple className="hidden" onChange={templateLibrary.handleUploadInputChange} />
        </label>

        <button
          type="button"
          onClick={() => templateLibrary.generator.setOpen(true)}
          title={tr("AI生成模板", "AI generate template")}
          className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-border hover:border-primary hover:bg-primary/[0.08]"
        >
          <div className="flex flex-col items-center text-muted-foreground/70 group-hover:text-primary-strong transition-colors">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2 group-hover:bg-primary/12 transition-colors">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">{tr("AI生成模板", "AI generate")}</span>
          </div>
        </button>

        {visible.map((t, i) => (
          <div
            key={t.id}
            onClick={() => void templateLibrary.selectTemplate(t)}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            className={cn(
              "animate-rise-in cursor-pointer border rounded-xl overflow-hidden relative aspect-video group transition-all duration-base ease-out-soft bg-muted",
              selectedTemplateId === t.id
                ? "border-primary ring-2 ring-primary shadow-md"
                : "border-border hover:ring-2 hover:ring-primary hover:shadow-md",
            )}
          >
            <img src={t.previewSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={t.name} />
            {selectedTemplateId === t.id && (
              <div className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-xs">
                {tr("已选择", "Selected")}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                templateLibrary.deleteTemplate(t);
              }}
              className="absolute top-2 right-2 rounded-full bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title={tr("删除模板", "Delete template")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="text-white text-xs font-medium text-center">{t.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
