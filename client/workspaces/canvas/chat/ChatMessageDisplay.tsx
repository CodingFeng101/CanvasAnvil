import { useEffect, useRef } from "react";
import { MessageImage, Shimmer } from "@/shared/chat";
import { extractImageTags } from "@/shared/chat/ppt-message-tags";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage } from "@/shared/i18n";
import type { ChatMessage } from "@/ai/client";
import { parseCanvasImageRef } from "@/workspaces/canvas/chat/canvas-image-ref";

export interface CanvasChatMessage extends ChatMessage {
  id: string;
}

interface ChatMessageDisplayProps {
  messages: CanvasChatMessage[];
  isGenerating: boolean;
  /** Looks up a picture's current data URL by canvas element id; null once it's gone (cleared, undone). */
  resolveCanvasImage?: (elementId: string) => string | null;
  /** Pictures that were never on the canvas, by chat-image id (see chat-images.ts). */
  chatImages?: Record<string, string>;
}

/**
 * Chat history is persisted with image data stripped out (quota safety, see
 * chat-storage.ts's `stripImagePayloads`), which leaves a `[image-data]`
 * placeholder in place of the data URL. A stripped tag whose label carries a
 * canvas element reference (see canvas-image-ref.ts) can be repaired here by
 * looking that picture back up on the canvas -- it never actually left, only
 * the chat's own copy of the bytes did.
 */
function rehydrateCanvasImageTags(
  text: string,
  resolveCanvasImage?: (elementId: string) => string | null,
  chatImages?: Record<string, string>,
): string {
  return text.replace(/^\[\[IMAGE\|([^|]*)\|\[image-data\]\]\]$/gm, (full, rawLabel) => {
    const { label, elementId, chatImageId } = parseCanvasImageRef(String(rawLabel || ""));
    const dataUrl = chatImageId
      ? chatImages?.[chatImageId]
      : elementId
        ? resolveCanvasImage?.(elementId)
        : null;
    return dataUrl ? `[[IMAGE|${label}|${dataUrl}]]` : full;
  });
}

/**
 * Whatever `rehydrateCanvasImageTags` could not repair (no reference, or the
 * picture is genuinely gone) falls through as plain text instead of the raw
 * `[[IMAGE|...]]` marker `extractImageTags` would otherwise leave untouched.
 *
 * Reaching here means the picture is *not* on the canvas: a tag with a
 * reference got this far because that element is gone, and one without (the
 * annotation preview) was never placed there.
 */
function describeStrippedImageTags(text: string, uiLang: "zh" | "en"): string {
  return text.replace(/^\[\[IMAGE\|([^|]*)\|\[image-data\]\]\]$/gm, (_match, rawLabel) => {
    const { label, elementId } = parseCanvasImageRef(String(rawLabel || ""));
    const trimmed = label.trim();
    if (uiLang === "zh") {
      return `[图片${trimmed ? `：${trimmed}` : ""}${elementId ? "，已从画布移除" : ""}]`;
    }
    return `[Image${trimmed ? `: ${trimmed}` : ""}${elementId ? ", removed from the canvas" : ""}]`;
  });
}

export function ChatMessageDisplay({ messages, isGenerating, resolveCanvasImage, chatImages }: ChatMessageDisplayProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isGenerating]);

  return (
    <ScrollArea className="h-full w-full scrollbar-thin">
      <div className="py-5 px-4 space-y-4">
        {messages.map((message) => {
          const rehydrated = rehydrateCanvasImageTags(message.content || "", resolveCanvasImage, chatImages);
          const { images, rest } = extractImageTags(describeStrippedImageTags(rehydrated, uiLang));
          const text = rest.trim();
          return (
            <div
              key={message.id}
              className={cn("flex w-full animate-message-in", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] min-w-0 flex flex-col gap-2",
                  message.role === "user" ? "items-end" : "items-start",
                )}
              >
                {images.map((img, i) => (
                  <MessageImage
                    key={`${message.id}-img-${i}`}
                    src={img.url}
                    alt={parseCanvasImageRef(img.name || "").label || "generated"}
                    className="max-w-[260px]"
                  />
                ))}
                {text && (
                  <div
                    className={cn(
                      "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                      message.role === "user"
                        ? "bg-muted text-foreground rounded-br-md border border-border/60"
                        : "text-foreground",
                    )}
                  >
                    {text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isGenerating && (
          <div className="flex w-full justify-start">
            <Shimmer as="span" className="py-1 text-sm" duration={1.6}>
              {tr("生成中…", "Generating…")}
            </Shimmer>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
