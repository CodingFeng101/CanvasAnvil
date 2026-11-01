import { useState } from "react";
import { ArrowLeft, ArrowRight, Blocks, ExternalLink, Home, Paintbrush, Play, Presentation } from "lucide-react";
import type { WorkspaceId } from "@/app/workspaces";
import { BrandIcon } from "@/app/BrandIcon";
import { portalCanvasItems } from "@/pages/portal/data";
import { Button } from "@/shared/ui/button";
import { setUiLanguage, useUiLanguage } from "@/shared/i18n";
import { Stagger, StaggerItem } from "@/shared/motion";
import { bilibiliPlayerUrl, bilibiliVideoUrl, tutorials, type Tutorial } from "./data";

const workspaceIcons: Record<WorkspaceId, typeof Blocks> = {
  diagram: Blocks,
  cad: Home,
  ppt: Presentation,
  canvas: Paintbrush,
};

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The cover until it is clicked, then Bilibili's player. The embedded player
 * shows the video's first frame -- black for these -- rather than the cover,
 * and four players loading at once is a lot for a page nobody has played yet.
 */
function TutorialPlayer({ tutorial, title, playLabel }: { tutorial: Tutorial; title: string; playLabel: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-border/50 bg-sunken">
      {playing ? (
        <iframe
          src={bilibiliPlayerUrl(tutorial.bvid)}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      ) : (
        <button
          type="button"
          aria-label={`${playLabel}: ${title}`}
          onClick={() => setPlaying(true)}
          className="group relative block h-full w-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40"
        >
          <img src={tutorial.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/0 transition-colors duration-base ease-out-soft group-hover:bg-black/15" />
          <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft-lg transition-transform duration-base ease-out-soft group-hover:scale-110">
            <Play className="ml-1 size-7 fill-current" />
          </span>
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/65 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
            {formatDuration(tutorial.duration)}
          </span>
        </button>
      )}
    </div>
  );
}

type TutorialsPageProps = {
  onBack: () => void;
  onEnterWorkspace: (workspace: WorkspaceId) => void;
};

/** One Bilibili walkthrough per canvas, playable in place. */
export function TutorialsPage({ onBack, onEnterWorkspace }: TutorialsPageProps) {
  const uiLang = useUiLanguage();
  const isChinese = uiLang === "zh";

  return (
    <div className="h-screen overflow-y-auto bg-background font-sans text-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-4 sm:px-6 lg:px-10">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/85 px-3 py-2.5 shadow-soft backdrop-blur-xl lg:px-5">
          <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {isChinese ? "返回" : "Back"}
          </Button>
          <div className="flex items-center gap-2.5">
            <BrandIcon className="h-8 w-8" />
            <span className="font-display text-[19px] font-semibold tracking-[-0.015em]">CanvasAnvil</span>
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-full px-4"
            onClick={() => setUiLanguage(isChinese ? "en" : "zh")}
          >
            {isChinese ? "EN" : "中文"}
          </Button>
        </header>

        <Stagger className="mt-10 short:mt-6" stagger={0.06}>
          <StaggerItem>
            <h1 className="font-display text-[clamp(32px,3.6vw,48px)] font-semibold leading-tight">
              {isChinese ? "视频教程" : "Video Tutorials"}
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="mt-3 max-w-[680px] text-[16px] leading-7 text-muted-foreground">
              {isChinese
                ? "每个画布一段完整演示：从一句话开始，到改图、导出。"
                : "One full walkthrough per canvas, from the first sentence to edits and export. The videos are narrated in Chinese."}
            </p>
          </StaggerItem>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {tutorials.map((tutorial) => {
              const canvas = portalCanvasItems.find((item) => item.id === tutorial.workspace);
              const Icon = workspaceIcons[tutorial.workspace];
              const canvasTitle = canvas ? (isChinese ? canvas.zhTitle : canvas.enTitle) : tutorial.workspace;
              const title = isChinese ? tutorial.zhTitle : tutorial.enTitle;

              return (
                <StaggerItem key={tutorial.bvid}>
                  <article className="flex h-full flex-col rounded-[22px] border border-border/60 bg-card p-4 shadow-soft">
                    <TutorialPlayer tutorial={tutorial} title={title} playLabel={isChinese ? "播放" : "Play"} />

                    <div className="mt-4 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: canvas?.accent }} />
                      <Icon className="size-4" />
                      {canvasTitle}
                    </div>
                    <h2 className="mt-1.5 flex-1 text-[18px] font-semibold leading-snug">{title}</h2>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button className="group h-10 rounded-xl px-4" onClick={() => onEnterWorkspace(tutorial.workspace)}>
                        {isChinese ? `进入${canvasTitle}` : `Open ${canvasTitle}`}
                        <ArrowRight className="size-4 transition-transform duration-fast ease-out-soft group-hover:translate-x-0.5" />
                      </Button>
                      <Button asChild variant="ghost" className="h-10 rounded-xl px-3 text-muted-foreground">
                        <a href={bilibiliVideoUrl(tutorial.bvid)} target="_blank" rel="noreferrer">
                          {isChinese ? "在 B 站打开" : "Watch on Bilibili"}
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    </div>
                  </article>
                </StaggerItem>
              );
            })}
          </div>
        </Stagger>
      </div>
    </div>
  );
}
