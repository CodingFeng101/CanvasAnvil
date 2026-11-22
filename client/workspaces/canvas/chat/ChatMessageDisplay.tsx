import { useRef, useState } from "react";
import { Brain, Check, Copy, Paintbrush, Pencil } from "lucide-react";
import { CanvasCard } from "@/shared/canvas-pane";
import { MessageImage, Step, StepList, WorkingIndicator } from "@/shared/chat";
import { extractImageTags } from "@/shared/chat/ppt-message-tags";
import { ChatScrollArea } from "@/shared/chat/chat-scroll";
import { MessageEditor } from "@/shared/chat/message-editor";
import { MessageAction } from "@/shared/chat/message-action";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage } from "@/shared/i18n";
import type { ChatMessage } from "@/ai/client";
import { parseCanvasImageRef } from "@/workspaces/canvas/chat/canvas-image-ref";

export interface CanvasChatMessage extends ChatMessage {
  id: string;
}

/** Where an annotated edit is (see AnnotatedEditOptions.onStage). */
export type EditStage = { step: "reading" } | { step: "drawing"; understood: string | null };

interface ChatMessageDisplayProps {
  messages: CanvasChatMessage[];
  isGenerating: boolean;
  /** An annotated edit under way, shown as its steps: the AI's reading of the markup comes before the picture. */
  editStage?: EditStage | null;
  /** Resend one of your messages, edited: what came after it is replaced. */
  onEditMessage?: (index: number, text: string) => void;
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

export function ChatMessageDisplay({ messages, isGenerating, editStage, onEditMessage, resolveCanvasImage, chatImages }: ChatMessageDisplayProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  const endRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  };

  return (
    <ChatScrollArea contentClassName="py-5 px-4 space-y-4">
        {messages.map((message, index) => {
          const rehydrated = rehydrateCanvasImageTags(message.content || "", resolveCanvasImage, chatImages);
          const { images, rest } = extractImageTags(describeStrippedImageTags(rehydrated, uiLang));
          const text = rest.trim();
          const isUser = message.role === "user";
          const isEditing = editing?.id === message.id;
          return (
            <div
              key={message.id}
              data-chat-msg={message.role}
              className={cn("group/msg flex w-full animate-message-in", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] min-w-0 flex flex-col gap-2",
                  isUser ? "items-end" : "items-start",
                  isEditing && "w-full max-w-full",
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
                {isEditing ? (
                  <MessageEditor
                    value={editing.text}
                    onChange={(value) => setEditing({ id: message.id, text: value })}
                    onCancel={() => setEditing(null)}
                    onSubmit={(value) => {
                      setEditing(null);
                      onEditMessage?.(index, value);
                    }}
                  />
                ) : (
                  text && (
                    <div
                      className={cn(
                        "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                        isUser ? "bg-foreground/[0.06] text-foreground" : "px-0 font-voice text-[15px] text-foreground",
                      )}
                    >
                      {text}
                    </div>
                  )
                )}
                {isUser && text && !isEditing && (
                  <div className="-mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover/msg:opacity-100 focus-within:opacity-100">
                    <MessageAction label={copied === message.id ? tr("已复制", "Copied") : tr("复制", "Copy")} onClick={() => copy(message.id, text)}>
                      {copied === message.id ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                    </MessageAction>
                    {onEditMessage && images.length === 0 && (
                      <MessageAction label={tr("编辑", "Edit")} disabled={isGenerating} onClick={() => setEditing({ id: message.id, text })}>
                        <Pencil className="size-3.5" />
                      </MessageAction>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!isGenerating && messages[messages.length - 1]?.role === "assistant" && <CanvasCard className="mt-0" />}
        {isGenerating && editStage && (
          <StepList className="mb-1">
            <Step
              icon={Brain}
              title={
                editStage.step === "reading"
                  ? tr("正在理解标注…", "Reading the annotation…")
                  : editStage.understood
                    ? tr("理解了标注", "Read the annotation")
                    : tr("没能用文字读出标注，把标注图直接交给图像模型", "Couldn't put the annotation into words; the marked-up picture goes to the image model as is")
              }
              state={editStage.step === "reading" ? "running" : "done"}
              defaultOpen
              collapsible={editStage.step === "drawing" && !!editStage.understood}
            >
              {editStage.step === "drawing" && editStage.understood ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/80">{editStage.understood}</p>
              ) : null}
            </Step>
            <Step
              icon={Paintbrush}
              title={tr("按这个理解修改图片", "Editing the picture from it")}
              state={editStage.step === "drawing" ? "running" : "pending"}
              collapsible={false}
              last
            />
          </StepList>
        )}
        {isGenerating && (
          <div className="flex w-full justify-start">
            <WorkingIndicator kind="canvas" />
          </div>
        )}
        <div ref={endRef} />
    </ChatScrollArea>
  );
}
