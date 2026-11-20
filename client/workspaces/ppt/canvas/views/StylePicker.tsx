import { useState } from "react";
import { Loader2, Palette, Presentation } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { useUiLanguage } from "@/shared/i18n";
import { AnvilMark } from "@/shared/chat/anvil-mark";
import type { CreationProgress } from "@/workspaces/ppt/canvas/lib/creation-machine";
import { useTemplateLibrary } from "@/workspaces/ppt/canvas/hooks/use-template-library";
import { StyleLibrary } from "./StyleLibrary";

type Library = ReturnType<typeof useTemplateLibrary>;
type Translate = (zh: string, en: string) => string;

/** The style library in a window, for choosing the deck's style. */
export function StylePickerDialog({
  open,
  onOpenChange,
  templateLibrary,
  tr,
  topic,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateLibrary: Library;
  tr: Translate;
  topic?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(760px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(68rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{tr("挑一套风格", "Pick a style")}</DialogTitle>
          <DialogDescription>
            {tr("风格只决定配色和质感，版式会按每一页的内容重新排。", "A style sets palette and texture only; each slide is laid out for its own content.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <StyleLibrary templateLibrary={templateLibrary} tr={tr} draftText={topic} onPicked={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The chosen style, small, with a button to change it (the outline step's footer). */
export function StyleChip({ templateLibrary, tr, onChange }: { templateLibrary: Library; tr: Translate; onChange: () => void }) {
  const selected = templateLibrary.templates.find((t) => t.id === templateLibrary.selectedTemplateId);
  return (
    <button
      type="button"
      onClick={onChange}
      title={tr("更换风格", "Change style")}
      className="group flex min-w-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2.5 text-left transition-colors duration-fast hover:bg-foreground/[0.05]"
    >
      {selected ? (
        <img src={selected.previewSrc} alt="" className="h-9 w-16 shrink-0 rounded-md object-cover ring-1 ring-border" />
      ) : (
        <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Palette className="size-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[11.5px] text-muted-foreground">{tr("风格", "Style")}</span>
        <span className="block truncate text-[13px] font-medium text-foreground">
          {selected ? selected.name : tr("还没选", "None yet")}
          <span className="ml-2 font-normal text-muted-foreground group-hover:text-foreground">{tr("更换", "Change")}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * The canvas before a deck exists. What the deck is about is said in the
 * chat; the style is chosen once the outline is there.
 */
export function PptStart({ progress, tr, templateLibrary, outlineDraft = [] }: { progress: CreationProgress; tr: Translate; templateLibrary: Library; outlineDraft?: string[] }) {
  const [picking, setPicking] = useState(false);
  // The outline arriving: each slide's title as soon as it is written.
  if (outlineDraft.length > 0) {
    return (
      <div className="h-full w-full overflow-y-auto bg-sunken px-8 py-10">
        <div className="mx-auto max-w-[560px]">
          <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <AnvilMark className="size-[18px]" />
            {tr(`正在写大纲 · 已有 ${outlineDraft.length} 页`, `Writing the outline · ${outlineDraft.length} slides so far`)}
          </p>
          <ol className="space-y-2">
            {outlineDraft.map((title, index) => (
              <li key={index} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 animate-rise-in">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 truncate text-[14px] text-foreground">{title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-sunken px-8">
      <div className="max-w-[420px] text-center">
        <Presentation className="mx-auto size-8 text-muted-foreground/60" strokeWidth={1.4} aria-hidden />
        {progress.message ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-primary-strong" role="status">
            <Loader2 className="size-4 animate-spin" />
            {progress.message}
          </p>
        ) : (
          <>
            <p className="mt-4 text-[15px] text-foreground/85">{tr("在左边说说这份 PPT 讲什么", "Tell the assistant what the deck is about")}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {tr("先出大纲，逐页改好后再挑风格、生成整套。", "An outline comes first; edit it, then pick a style and make the deck.")}
            </p>
            {/* Restyling an old PDF skips the outline, so its style is chosen here. */}
            <button type="button" onClick={() => setPicking(true)} className="mt-4 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {tr("美化旧 PDF？先挑一套风格", "Restyling a PDF? Pick a style first")}
            </button>
          </>
        )}
      </div>
      <StylePickerDialog open={picking} onOpenChange={setPicking} templateLibrary={templateLibrary} tr={tr} />
    </div>
  );
}

/** My works' "PPT templates" tab: the same library, to look through, add to and tidy. */
export function PptTemplateLibrary() {
  const uiLang = useUiLanguage();
  const tr: Translate = (zh, en) => (uiLang === "zh" ? zh : en);
  const templateLibrary = useTemplateLibrary({ initialSelectedTemplateId: null, uiLang, tr });
  return <StyleLibrary templateLibrary={templateLibrary} tr={tr} variant="library" />;
}
