import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

/*
 * A small window over the page that shows what a file holds, as Claude opens
 * an attachment you click: the picture itself, a PDF in the browser's own
 * viewer, or the text. Esc or a click outside closes it.
 */

export interface PreviewTarget {
  name: string;
  /** The file itself, when it is still at hand (before sending). */
  file?: File;
  /** Text already read out of it (a parsed PDF, a sent text file). */
  text?: string;
  /** An image URL, when it is a picture. */
  imageUrl?: string;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 5) : "FILE";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function AttachmentPreview({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const zh = useUiLanguage() === "zh";
  const [text, setText] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setPdfUrl(null);
    if (!target || target.imageUrl) return;
    const file = target.file;
    if (file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (target.text != null) {
      setText(target.text);
      return;
    }
    if (file) {
      let alive = true;
      void file.text().then((t) => alive && setText(t.slice(0, 200_000)));
      return () => {
        alive = false;
      };
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [target, onClose]);

  if (!target) return null;
  const isImage = !!target.imageUrl;
  const meta = [fileExtension(target.name), target.file ? formatSize(target.file.size) : "", text ? (zh ? `${text.split("\n").length} 行` : `${text.split("\n").length} lines`) : ""]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay/40 p-4 animate-in fade-in duration-fast"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={target.name}
        className={cn(
          "flex max-h-[82vh] w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_64px_-16px_hsl(var(--shadow-hue)/0.35)] animate-in zoom-in-[0.97] fade-in duration-base",
          isImage ? "max-w-[min(960px,92vw)]" : "max-w-[760px]",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border/70 px-4">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-foreground">{target.name}</div>
          </div>
          <span className="shrink-0 text-[12px] text-muted-foreground">{meta}</span>
          <button
            type="button"
            title={zh ? "关闭" : "Close"}
            aria-label={zh ? "关闭" : "Close"}
            onClick={onClose}
            className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin bg-background/40">
          {isImage ? (
            <img src={target.imageUrl} alt={target.name} className="mx-auto block max-h-[72vh] w-auto object-contain" />
          ) : pdfUrl ? (
            <iframe title={target.name} src={pdfUrl} className="h-[72vh] w-full border-0" />
          ) : text != null ? (
            <pre className="whitespace-pre-wrap break-words px-5 py-4 font-mono text-[12.5px] leading-relaxed text-foreground/90">{text || (zh ? "（空文件）" : "(empty file)")}</pre>
          ) : (
            <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">{zh ? "这个文件没法在这里预览。" : "This file can't be previewed here."}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
