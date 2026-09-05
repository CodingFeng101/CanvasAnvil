import { FileText } from "lucide-react";
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
          className="inline-flex max-w-[200px] items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-2 shadow-xs"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-foreground">
              {file.filename || "file"}
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {file.fileType === "pdf" ? "PDF" : "TXT"}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
