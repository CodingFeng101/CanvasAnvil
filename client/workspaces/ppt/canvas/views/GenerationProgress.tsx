import type { CreationProgress } from "@/workspaces/ppt/canvas/lib/creation-machine";
import { pptConcurrency } from "@/shared/preferences";
import type { CreationStep, SlideData } from "@/workspaces/ppt/canvas/types";
import { cn } from "@/shared/lib/utils";
import { PenSketch } from "@/shared/ui/pen-sketch";
import { PencilMark } from "@/shared/ui/pencil";

interface GenerationProgressProps {
  step: CreationStep;
  progress: CreationProgress;
  tr: (zh: string, en: string) => string;
  /** The outline being drawn, one page per slide. */
  slides: SlideData[];
  /** The pictures drawn so far, by slide id. */
  images: Record<string, string>;
}

/**
 * The deck being drawn by the AI pen: every page of the outline in a grid. A page being drawn has
 * its frame and a loose sketch of a page drawn in over and over while the pen hatches across it (the picture cannot stream,
 * so this is the pen thinking); when the picture arrives the pen sweeps across and wipes it in.
 * Pages not started yet wait with their number and title. Progress is told in the chat.
 */
export function GenerationProgress({ progress, tr, slides, images }: GenerationProgressProps) {
  const done = slides.filter((slide) => images[slide.id]).length;
  const total = slides.length || progress.total;
  // Pages are drawn in order, a few at a time: the first ones still without a picture are under way.
  const drawing = new Set(slides.filter((slide) => !images[slide.id]).slice(0, pptConcurrency()).map((slide) => slide.id));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-baseline justify-between gap-4 px-8 pt-6 pb-4">
        <h3 className="text-lg font-semibold">{tr("正在画幻灯片", "Drawing the slides")}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {done} / {total}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {slides.map((slide, index) => {
            const url = images[slide.id];
            const busy = !url && drawing.has(slide.id);
            // Each page's pen at its own point in the motion, not all in step.
            const phase = `${-((index * 2.3) % 12)}s`;
            return (
              <figure key={slide.id || index} className="min-w-0">
                <div className={cn("relative aspect-video rounded-lg", url ? "" : busy ? "bg-foreground/[0.035]" : "bg-foreground/[0.02]")}>
                  {url ? (
                    <>
                      <img src={url} alt="" className="pen-reveal h-full w-full rounded-lg object-cover shadow-soft" />
                      <PencilMark size={22} className="pen-ride pointer-events-none absolute -ml-[1.5px] -mt-[19px] text-brand drop-shadow-sm" />
                    </>
                  ) : (
                    <>
                      {/* Being drawn: the pen sketches the page (the title is under it); waiting: the title. */}
                      {busy ? (
                        <PenSketch phase={phase} scene={index} />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] leading-snug text-muted-foreground/45">
                          <span className="line-clamp-3">{slide.title}</span>
                        </span>
                      )}
                    </>
                  )}
                </div>
                <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{index + 1}</span>
                  <span className="min-w-0 truncate">{url || !busy ? slide.title : `${tr("正在画", "Drawing")} · ${slide.title}`}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}
