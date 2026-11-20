import { fileExtension } from "@/shared/chat/attachment-preview";
import { cn } from "@/shared/lib/utils";
import { MessageImage } from "@/shared/chat/message-image";

export type AttachedImage = { url: string; name?: string };
export type AttachedFile = { filename?: string; fileType?: "pdf" | "text"; charCount?: number };

/**
 * What the user attached, shown as a strip directly above their bubble.
 *
 * These used to render inside the bubble, which made a short question with a
 * screenshot look like a mostly-empty card wrapped around a picture. Keeping
 * them outside lets the bubble stay the size of the sentence and lines the
 * attachments up with it on the right.
 */
export function MessageAttachments({
  images = [],
  files = [],
  align = "end",
  className,
}: {
  images?: AttachedImage[];
  files?: AttachedFile[];
  align?: "start" | "end";
  className?: string;
}) {
  if (images.length === 0 && files.length === 0) return null;

  return (
    <div
      className={cn(
        "flex w-full flex-wrap gap-2",
        align === "end" ? "justify-end" : "justify-start",
        className,
      )}
    >
      {images.map((image, index) => (
        <MessageImage
          key={`att-img-${index}`}
          src={image.url}
          alt={image.name || "attachment"}
          // Compact here: the strip is a reference to what was sent, not the
          // place to read it. The lightbox is one click away.
          className="w-[104px] shrink-0 [&_img]:h-[104px] [&_img]:w-full [&_img]:object-cover"
        />
      ))}

      {files.map((file, index) => (
        <span
          key={`att-file-${index}`}
          title={file.filename}
          className="flex size-[104px] shrink-0 flex-col justify-between rounded-xl border border-border/80 bg-card p-2.5 shadow-xs"
        >
          <span className="line-clamp-3 break-all text-[12px] font-medium leading-snug text-foreground">{file.filename || "file"}</span>
          <span className="flex items-center gap-1.5">
            <span className="rounded border border-border/90 bg-background px-1 py-px text-[10px] font-medium tracking-wide text-muted-foreground">
              {file.fileType === "pdf" ? "PDF" : file.filename ? fileExtension(file.filename) : "TXT"}
            </span>
            {file.charCount ? <span className="truncate text-[10.5px] text-muted-foreground">{file.charCount >= 1000 ? `${(file.charCount / 1000).toFixed(1)}k` : file.charCount}</span> : null}
          </span>
        </span>
      ))}
    </div>
  );
}
