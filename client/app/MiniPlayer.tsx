import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { bilibiliPlayerUrl, bilibiliVideoUrl, type Video } from "@/app/videos";

/*
 * A small floating player: a video opened from Settings → Videos keeps playing
 * in the corner while you close Settings and carry on working. Drag it by its
 * title bar; it can grow to a larger window or close.
 */

let current: Video | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function playVideo(video: Video) {
  current = video;
  emit();
}

export function closeVideo() {
  current = null;
  emit();
}

function useCurrentVideo() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => null,
  );
}

const MARGIN = 16;

export function MiniPlayer() {
  const video = useCurrentVideo();
  const zh = useUiLanguage() === "zh";
  const [large, setLarge] = useState(false);
  // Offset from the bottom-right corner, changed by dragging.
  const [offset, setOffset] = useState({ x: MARGIN, y: MARGIN });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // While dragging, the video must not swallow the pointer.
  const [dragging, setDragging] = useState(false);
  if (!video) return null;

  const width = large ? Math.min(880, window.innerWidth - 2 * MARGIN) : Math.min(420, window.innerWidth - 2 * MARGIN);
  const title = zh ? video.zhTitle : video.enTitle;
  const src = video.source.type === "bilibili" ? bilibiliPlayerUrl(video.source.bvid) : video.source.src;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      className="fixed z-[120] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_hsl(var(--shadow-hue)/0.25)] animate-in fade-in zoom-in-95 duration-base"
      style={{ width, right: offset.x, bottom: offset.y }}
    >
      <div
        className="flex h-9 cursor-grab touch-none select-none items-center gap-2 border-b border-border/70 pl-3 pr-1 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,a")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const x = Math.max(0, Math.min(window.innerWidth - width, d.ox - (e.clientX - d.x)));
          const y = Math.max(0, Math.min(window.innerHeight - 80, d.oy - (e.clientY - d.y)));
          setOffset({ x, y });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{title}</span>
        {video.source.type === "bilibili" && (
          <a href={bilibiliVideoUrl(video.source.bvid)} target="_blank" rel="noreferrer" title={zh ? "在 B 站打开" : "Open on Bilibili"} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
            <ExternalLink className="size-3.5" />
          </a>
        )}
        <button type="button" title={large ? (zh ? "缩小" : "Smaller") : zh ? "放大" : "Larger"} onClick={() => setLarge(!large)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
          {large ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button type="button" title={zh ? "关闭" : "Close"} aria-label={zh ? "关闭视频" : "Close video"} onClick={closeVideo} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className={cn("aspect-video bg-black", dragging && "pointer-events-none")}>
        {video.source.type === "bilibili" ? (
          <iframe key={video.id} src={src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
        ) : (
          <video key={video.id} src={src} poster={video.cover} controls autoPlay className="h-full w-full" />
        )}
      </div>
    </div>,
    document.body,
  );
}
