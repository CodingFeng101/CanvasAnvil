import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { ScrollArea } from "@/shared/ui/scroll-area";
import type { WorkReference } from "@/shared/references/types";
import type { SlideData } from "@/workspaces/ppt/canvas/types";

/**
 * "Which slide?" for pictures carried in from another canvas (the diagram's
 * 「放进 PPT」). The pictures become that slide's materials.
 */
export function SlideReferenceChooser({
  reference,
  slides,
  imageOf,
  tr,
  onChoose,
  onCancel,
}: {
  reference: WorkReference | null;
  slides: SlideData[];
  imageOf: (slideId: string) => string | undefined;
  tr: (zh: string, en: string) => string;
  onChoose: (slideId: string) => void;
  onCancel: () => void;
}) {
  const picture = reference?.items.find((item) => item.kind === "image" && item.dataUrl)?.dataUrl;
  return (
    <Dialog open={!!reference} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[min(640px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(44rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{tr("放到哪一页？", "Which slide?")}</DialogTitle>
          <DialogDescription>
            {tr(
              `「${reference?.workName ?? ""}」会加为这一页的素材，并写进这一页的描述。`,
              `"${reference?.workName ?? ""}" becomes a material of the slide, named in its description.`,
            )}
          </DialogDescription>
        </DialogHeader>
        {picture && <img src={picture} alt="" className="mx-auto max-h-28 rounded-md border border-border bg-white object-contain" />}
        <ScrollArea className="min-h-0 flex-1">
          <ul className="grid grid-cols-2 gap-2.5 pb-1 sm:grid-cols-3">
            {slides.map((slide, index) => {
              const image = imageOf(slide.id);
              return (
                <li key={slide.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(slide.id)}
                    className="flex w-full flex-col overflow-hidden rounded-xl border border-border text-left transition-colors hover:border-foreground/40"
                  >
                    <span className="flex aspect-video w-full items-center justify-center bg-muted/40 text-[12px] text-muted-foreground">
                      {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : tr("还没出图", "No picture yet")}
                    </span>
                    <span className="truncate px-2.5 py-2 text-[13px] text-foreground">
                      {tr(`第 ${index + 1} 页`, `Slide ${index + 1}`)}
                      {slide.title?.trim() ? ` · ${slide.title.trim()}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {tr("取消", "Cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
