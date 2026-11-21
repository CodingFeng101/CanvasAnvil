import { useState } from "react";
import { ArrowRight, ChevronDown, Play } from "lucide-react";
import type { UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { CANVAS_COLOR } from "@/app/UsageStats";
import { FAQ } from "@/pages/portal/content";
import { DOC_GROUPS, pageTitle } from "@/pages/docs/nav";
import { docsHref } from "@/pages/docs/route";
import { portalCanvasItems } from "@/pages/portal/data";
import { playVideo } from "@/app/MiniPlayer";
import { FilmStrip } from "@/shared/ui/ornaments";
import { videos, type VideoKind } from "@/app/videos";

/*
 * Settings → Videos and Docs: the videos by kind (played in the floating mini
 * player), and the contents of the in-app docs.
 */

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The videos of one kind as cover cards; a click plays it in the floating mini player. */
export function VideoShelf({ kind, lang }: { kind: VideoKind; lang: UiLanguage }) {
  const zh = lang === "zh";
  const list = videos.filter((v) => v.kind === kind);
  if (!list.length) {
    return (
      <div className="aside-voice flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/80 px-4 text-center text-[14px] text-muted-foreground">
        <FilmStrip className="text-muted-foreground/55" />
        {zh ? "这一格还空着。片子正在剪，剪好了就放在这里。" : "This shelf is still empty. The film is being cut and will sit here when it is ready."}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((video) => {
        const title = zh ? video.zhTitle : video.enTitle;
        const canvas = video.workspace ? portalCanvasItems.find((c) => c.id === video.workspace) : undefined;
        return (
          <button
            key={video.id}
            type="button"
            onClick={() => playVideo(video)}
            aria-label={`${zh ? "播放" : "Play"}: ${title}`}
            className="group overflow-hidden rounded-xl border border-border/60 text-left transition-colors hover:border-border"
          >
            <div className="relative aspect-video bg-foreground/[0.04]">
              <img src={video.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-transform group-hover:scale-110">
                <Play className="ml-0.5 size-5 fill-current" />
              </span>
              {video.duration && <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-px text-[11px] tabular-nums text-white">{clock(video.duration)}</span>}
            </div>
            <div className="px-3.5 py-2.5">
              {canvas && (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: CANVAS_COLOR[canvas.id] }} />
                  {zh ? canvas.zhTitle : canvas.enTitle}
                </div>
              )}
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-foreground">{title}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Questions people ask, opened one at a time. */
export function FaqList({ lang }: { lang: UiLanguage }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
      {FAQ.items.map((item, i) => (
        <li key={item.q.en}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-foreground hover:bg-foreground/[0.03]">
            <span className="flex-1">{item.q[lang]}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === i && "rotate-180")} />
          </button>
          {open === i && <p className="px-3.5 pb-3 text-[13px] leading-relaxed text-muted-foreground">{item.a[lang]}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The docs' table of contents, each page opening the in-app docs. */
export function DocsShelf({ lang }: { lang: UiLanguage }) {
  const zh = lang === "zh";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DOC_GROUPS.map((group) => (
        <div key={group.id} className="rounded-xl border border-border/60 px-3.5 py-3">
          <div className="font-display text-[14.5px] text-foreground">{zh ? group.zh : group.en}</div>
          <ul className="mt-1.5 space-y-0.5">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <a href={docsHref(page.slug)} className="group inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                  {pageTitle(page, lang)}
                  <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
