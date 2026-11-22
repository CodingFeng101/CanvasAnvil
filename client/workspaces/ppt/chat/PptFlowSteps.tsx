import { ClipboardCheck, FileText, ListOrdered, Presentation, Sparkles } from "lucide-react";
import { Step, StepList, type StepState } from "@/shared/chat";
import { cn } from "@/shared/lib/utils";
import type { DeckFlowSnapshot, FlowStepState } from "@/workspaces/ppt/lib/deck-flow";

/**
 * Making a deck, as steps in the chat (see deck-flow.ts). The outline is confirmed here, with the
 * style beside the button; the canvas shows the same work being written and drawn.
 */

const stateOf = (state: FlowStepState): StepState => (state === "waiting" ? "running" : state);

export function PptFlowSteps({
  flow,
  canAct,
  style,
  onPickStyle,
  onGenerate,
  tr,
}: {
  flow: DeckFlowSnapshot;
  /** Only the latest flow, while its outline is on the canvas, can be confirmed. */
  canAct: boolean;
  style: { name: string; previewSrc: string } | null;
  onPickStyle(): void;
  onGenerate(): void;
  tr: (zh: string, en: string) => string;
}) {
  const { reading, outline, confirm, slides } = flow;
  const titles = outline.titles;
  const outlineTitle =
    outline.state === "running"
      ? titles.length
        ? tr(`正在写大纲 · 已有 ${titles.length} 页`, `Writing the outline · ${titles.length} so far`)
        : tr("正在写大纲", "Writing the outline")
      : outline.state === "error"
        ? tr("大纲没写完", "The outline did not finish")
        : outline.state === "done"
          ? tr("写好了大纲", "Outline written")
          : tr("写大纲", "Outline");
  const slidesTitle =
    slides.state === "running"
      ? tr("正在生成幻灯片", "Making the slides")
      : slides.state === "done"
        ? tr("幻灯片做好了", "Slides made")
        : slides.state === "error"
          ? tr("幻灯片没有做完", "The slides did not finish")
          : tr("生成幻灯片", "Make the slides");
  const waiting = confirm.state === "waiting";
  const showSlides = slides.state !== "pending" || waiting || confirm.state === "done";

  return (
    <StepList className="my-1 w-full">
      {reading && (
        <Step
          icon={FileText}
          state={stateOf(reading.state)}
          title={reading.state === "running" ? tr("正在读参考资料", "Reading the references") : tr("读完了参考资料", "Read the references")}
          meta={tr(`${reading.files} 份`, `${reading.files}`)}
        />
      )}
      <Step
        key={`outline-${outline.state}`}
        icon={ListOrdered}
        state={stateOf(outline.state)}
        title={outlineTitle}
        meta={outline.state === "done" ? tr(`${titles.length} 页`, `${titles.length} slides`) : undefined}
        defaultOpen={outline.state === "running"}
        last={outline.state !== "done"}
      >
        {titles.length > 0 || outline.error ? (
          <div className="space-y-0.5">
            {titles.map((title, index) => (
              <p key={index} className="truncate animate-fade-in">
                <span className="mr-2 tabular-nums text-muted-foreground/70">{index + 1}</span>
                {title}
              </p>
            ))}
            {outline.error && <p className="whitespace-pre-wrap text-xs text-destructive">{outline.error}</p>}
          </div>
        ) : undefined}
      </Step>
      {outline.state === "done" && (
        <Step
          key={`confirm-${confirm.state}`}
          icon={ClipboardCheck}
          state={confirm.state === "done" ? "done" : waiting ? "running" : "pending"}
          title={waiting ? tr("等你确认大纲", "Waiting for you to confirm") : tr("确认了大纲", "Outline confirmed")}
          meta={confirm.state === "done" && confirm.style ? tr(`风格「${confirm.style}」`, `Style "${confirm.style}"`) : undefined}
          collapsible={false}
          last={!showSlides}
        >
          {waiting ? (
            <div className="space-y-3 pt-0.5">
              <p>{tr("大纲在右边，可以直接改，也可以在这里说要怎么改。满意了挑一套风格，点生成。", "The outline is on the right: edit it there, or say here what to change. When it is right, pick a style and make the deck.")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPickStyle}
                  disabled={!canAct}
                  className="group flex h-9 max-w-[16rem] items-center gap-2 rounded-lg border border-border bg-background pl-1 pr-3 text-left transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
                >
                  {style?.previewSrc ? (
                    <img src={style.previewSrc} alt="" className="h-7 w-12 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-7 w-12 shrink-0 rounded bg-foreground/[0.06]" />
                  )}
                  <span className="min-w-0 truncate text-[13px] text-foreground">
                    {style ? style.name : tr("挑一套风格", "Pick a style")}
                    <span className="ml-1.5 text-muted-foreground group-hover:text-foreground">{style ? tr("更换", "Change") : ""}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={!canAct}
                  className={cn("flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50")}
                >
                  <Sparkles className="size-3.5" />
                  {tr("生成完整 PPT", "Make the deck")}
                </button>
              </div>
            </div>
          ) : undefined}
        </Step>
      )}
      {outline.state === "done" && showSlides && (
        <Step
          icon={Presentation}
          state={stateOf(slides.state)}
          title={slidesTitle}
          meta={
            slides.state === "pending"
              ? undefined
              : slides.failed
                ? tr(`${slides.done} / ${slides.total} 页 · ${slides.failed} 页没画出来`, `${slides.done} / ${slides.total} · ${slides.failed} failed`)
                : tr(`${slides.done} / ${slides.total} 页`, `${slides.done} / ${slides.total}`)
          }
          collapsible={false}
          last
        >
          {slides.state === "done" ? (
            <p>
              {slides.failed
                ? tr("没画出来的页可以在右边单独重新生成。想改哪页直接说，或者把那一页加入对话。", "Redo the missing pages on the right. To change a page, say so here or add it to the chat.")
                : tr("想改哪页直接说，或者把那一页加入对话。", "To change a page, say so here or add it to the chat.")}
            </p>
          ) : slides.state === "error" ? (
            <p>{tr("页面被刷新或出错了，已经画好的页都保留在右边。", "The page was refreshed or something failed; the pages already drawn are kept.")}</p>
          ) : undefined}
        </Step>
      )}
    </StepList>
  );
}
