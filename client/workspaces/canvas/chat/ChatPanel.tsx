import { useEffect, useRef, useState } from "react";
import { Maximize2, Paintbrush, PanelRightClose, PanelRightOpen, Sparkles, Wand2 } from "lucide-react";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "@contracts/ai";
import { cn } from "@/shared/lib/utils";
import { generateImage, type ImageQuality, type ImageSize } from "@/ai/client";
import { ButtonWithTooltip, ChatEmptyState, ChatInput, ResetWarningModal } from "@/shared/chat";
import { chatStorageKey, loadChatHistory, saveChatHistory } from "@/shared/chat/chat-storage";
import { t, useUiLanguage } from "@/shared/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { AnnotatedEditOptions, AnnotatedEditPreview, AnnotatedEditResult } from "@/workspaces/canvas/canvas/annotated-edit";
import type { ImageVersion } from "@/workspaces/canvas/canvas/lineage";
import { referencedChatImageIds, withCanvasImageRef, withChatImageRef } from "@/workspaces/canvas/chat/canvas-image-ref";
import {
  loadChatImages,
  pruneChatImages,
  saveChatImages,
  shrinkForChat,
  type ChatImageMap,
} from "@/workspaces/canvas/chat/chat-images";
import { ChatMessageDisplay, type CanvasChatMessage } from "@/workspaces/canvas/chat/ChatMessageDisplay";
import { VersionStrip } from "@/workspaces/canvas/chat/version-strip";

const STORAGE_KEY = chatStorageKey("canvas");
const IMAGE_OPTIONS_STORAGE_KEY = "CanvasAnvil-canvas-image-options-v1";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function loadImageOptions(): { size: ImageSize; quality: ImageQuality } {
  const fallback: { size: ImageSize; quality: ImageQuality } = { size: "auto", quality: "auto" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(IMAGE_OPTIONS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const size: ImageSize = IMAGE_SIZES.includes(parsed?.size) ? parsed.size : fallback.size;
    const quality: ImageQuality = IMAGE_QUALITIES.includes(parsed?.quality) ? parsed.quality : fallback.quality;
    return { size, quality };
  } catch {
    return fallback;
  }
}

interface ChatPanelProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Places the picture on the canvas and returns the element it was placed as, so the chat message can reference it. */
  onImageGenerated: (dataUrl: string, prompt: string) => Promise<string | null>;
  /** Looks up a picture's current data URL by canvas element id, for messages reloaded with their image data stripped out. */
  resolveCanvasImage?: (elementId: string) => string | null;
  /** Whether the current canvas selection resolves to an image, so the annotate-edit action has something to work on. */
  canAnnotateEdit: boolean;
  onAnnotatedEdit: (instruction: string, options?: AnnotatedEditOptions) => Promise<AnnotatedEditResult>;
  /** Renders the picture + markup the edit is about to send, so the chat message can show it. */
  onPreviewAnnotatedEdit: () => Promise<AnnotatedEditPreview>;
  /** Every version of the currently selected picture, oldest first. */
  imageVersions: ImageVersion[];
  activeImageElementId: string | null;
  onSelectVersion: (elementId: string) => void;
  /** Wipes the canvas; called together with clearing the chat log so "clear" means everything, in one action. */
  onClearAll: () => void;
}

export function ChatPanel({
  className,
  collapsed = false,
  onToggleCollapse,
  onImageGenerated,
  resolveCanvasImage,
  canAnnotateEdit,
  onAnnotatedEdit,
  onPreviewAnnotatedEdit,
  imageVersions,
  activeImageElementId,
  onSelectVersion,
  onClearAll,
}: ChatPanelProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);

  const [messages, setMessages] = useState<CanvasChatMessage[]>(() =>
    loadChatHistory(STORAGE_KEY, []).map((m) => ({ ...m, id: makeId() })),
  );
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [imageOptions, setImageOptions] = useState(loadImageOptions);
  const [focusTick, setFocusTick] = useState(0);

  /** An example from the empty state goes into the input, not straight to the model, so it can be adjusted first. */
  const pickExample = (text: string) => {
    setInput(text);
    setFocusTick((tick) => tick + 1);
  };
  // Bumped by "clear". A request still in flight when the user clears belongs
  // to the conversation that was just wiped: without this, its reply would
  // write the old history back and drop its picture onto the emptied canvas.
  const clearEpochRef = useRef(0);
  // The ref is the source of truth for writes (an edit can land before the
  // initial load has); the state is only there to re-render once it arrives.
  const chatImagesRef = useRef<ChatImageMap>({});
  const [chatImages, setChatImages] = useState<ChatImageMap>({});

  useEffect(() => {
    let cancelled = false;
    void loadChatImages()
      .then((stored) => {
        if (cancelled) return;
        // History is trimmed as it is saved, so stored pictures can outlive
        // the messages that showed them; drop those on the way in.
        const referenced = referencedChatImageIds(messages.map((m) => m.content || ""));
        const kept = pruneChatImages(stored, referenced);
        chatImagesRef.current = { ...kept, ...chatImagesRef.current };
        setChatImages(chatImagesRef.current);
        if (Object.keys(kept).length !== Object.keys(stored).length) {
          void saveChatImages(chatImagesRef.current).catch((e) => console.error("Failed to prune chat images", e));
        }
      })
      .catch((e) => console.error("Failed to load chat images", e));
    return () => {
      cancelled = true;
    };
    // Once, against the history this panel mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeChatImages = (next: ChatImageMap) => {
    chatImagesRef.current = next;
    setChatImages(next);
    void saveChatImages(next).catch((e) => console.error("Failed to persist chat images", e));
  };

  const updateImageOptions = (next: Partial<{ size: ImageSize; quality: ImageQuality }>) => {
    setImageOptions((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(IMAGE_OPTIONS_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Losing the preference just means it defaults back to "auto" next time.
      }
      return merged;
    });
  };

  const persist = (next: CanvasChatMessage[]) => {
    setMessages(next);
    saveChatHistory(STORAGE_KEY, next);
  };

  const handleSubmit = async () => {
    const prompt = input.trim();
    if (!prompt || isGenerating) return;

    const userMessage: CanvasChatMessage = { id: makeId(), role: "user", content: prompt };
    const withUser = [...messages, userMessage];
    persist(withUser);
    setInput("");
    setIsGenerating(true);
    const epoch = clearEpochRef.current;

    try {
      const url = await generateImage({ prompt, size: imageOptions.size, quality: imageOptions.quality });
      if (!url) throw new Error("empty result");
      if (epoch !== clearEpochRef.current) return;
      const elementId = await onImageGenerated(url, prompt);
      const assistantMessage: CanvasChatMessage = {
        id: makeId(),
        role: "assistant",
        content: `[[IMAGE|${withCanvasImageRef(prompt.slice(0, 60), elementId)}|${url}]]`,
      };
      persist([...withUser, assistantMessage]);
    } catch (error) {
      console.error("Canvas image generation failed", error);
      if (epoch !== clearEpochRef.current) return;
      const reason = errorMessage(error);
      const assistantMessage: CanvasChatMessage = {
        id: makeId(),
        role: "assistant",
        content: tr(
          `生成失败${reason ? `：${reason}` : ""}，请重试。`,
          `Generation failed${reason ? `: ${reason}` : ""}. Please try again.`,
        ),
      };
      persist([...withUser, assistantMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnnotatedEdit = async () => {
    if (!canAnnotateEdit || isGenerating) return;
    const instruction = input.trim();
    const instructionText =
      instruction || tr("根据画布上的标注修改选中的图片", "Edit the selected image based on the canvas annotation");

    // Busy from the click on: building the preview composites the picture,
    // which takes long enough for a second click to start a second edit.
    setIsGenerating(true);
    const epoch = clearEpochRef.current;
    let withUser = messages;

    try {
      const preview = await onPreviewAnnotatedEdit().catch((error): AnnotatedEditPreview => {
        console.error("Rendering the annotation preview failed", error);
        return { ok: false };
      });
      let previewTag = "";
      if (preview.ok && preview.previewUrl) {
        const chatImageId = makeId();
        const thumbnail = await shrinkForChat(preview.previewUrl);
        writeChatImages({ ...chatImagesRef.current, [chatImageId]: thumbnail });
        previewTag = `[[IMAGE|${withChatImageRef(tr("标注", "Annotation"), chatImageId)}|${thumbnail}]]\n`;
      }
      const userMessage: CanvasChatMessage = {
        id: makeId(),
        role: "user",
        content: `${previewTag}${instructionText}`,
      };
      withUser = [...messages, userMessage];
      persist(withUser);
      setInput("");

      const result = await onAnnotatedEdit(instruction, {
        size: imageOptions.size,
        quality: imageOptions.quality,
        isCancelled: () => epoch !== clearEpochRef.current,
      });
      if (epoch !== clearEpochRef.current) return;
      const assistantMessage: CanvasChatMessage = result.ok
        ? {
            id: makeId(),
            role: "assistant",
            content: [
              result.describedChange ? tr(`AI 理解的修改：${result.describedChange}`, `AI read the edit as: ${result.describedChange}`) : "",
              `[[IMAGE|${withCanvasImageRef(instruction.slice(0, 60), result.elementId)}|${result.url}]]`,
            ]
              .filter(Boolean)
              .join("\n"),
          }
        : {
            id: makeId(),
            role: "assistant",
            content: result.error || tr("编辑失败，请重试。", "Edit failed. Please try again."),
          };
      persist([...withUser, assistantMessage]);
    } catch (error) {
      // runAnnotatedEdit only catches the model call; compositing the
      // annotation before it can still throw, and used to leave the user's
      // message hanging with no reply.
      console.error("Annotated edit failed", error);
      if (epoch !== clearEpochRef.current) return;
      const reason = errorMessage(error);
      persist([
        ...withUser,
        {
          id: makeId(),
          role: "assistant",
          content: tr(
            `编辑失败${reason ? `：${reason}` : ""}，请重试。`,
            `Edit failed${reason ? `: ${reason}` : ""}. Please try again.`,
          ),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAll = () => {
    clearEpochRef.current += 1;
    persist([]);
    writeChatImages({});
    onClearAll();
    setShowResetWarning(false);
  };

  if (collapsed) {
    return (
      <div className={cn("h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl", className)}>
        <ButtonWithTooltip
          tooltipContent={t(uiLang, "chat.expand")}
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="hover:bg-accent transition-colors"
        >
          <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
        </ButtonWithTooltip>
      </div>
    );
  }

  const qualityLabel = (quality: ImageQuality) =>
    quality === "auto"
      ? tr("自动", "Auto")
      : quality === "low"
        ? tr("低", "Low")
        : quality === "medium"
          ? tr("中", "Medium")
          : tr("高", "High");

  return (
    <div className={cn("h-full flex flex-col bg-card animate-slide-in-right relative", className)}>
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold tracking-tight whitespace-nowrap">
            {t(uiLang, "workspace.canvas.title")}
          </span>
          {onToggleCollapse && (
            <ButtonWithTooltip
              tooltipContent={t(uiLang, "chat.collapse")}
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="hover:bg-accent transition-colors rounded-md"
            >
              <PanelRightClose className="w-4 h-4 text-muted-foreground" />
            </ButtonWithTooltip>
          )}
        </div>
      </div>

      <div className="flex-1 w-full overflow-hidden">
        {messages.length === 0 && !isGenerating ? (
          <ChatEmptyState
            icon={Paintbrush}
            title={t(uiLang, "empty.canvas.title")}
            description={t(uiLang, "empty.canvas.desc")}
            examplesLabel={t(uiLang, "empty.examplesLabel")}
            examples={[t(uiLang, "empty.canvas.ex1"), t(uiLang, "empty.canvas.ex2"), t(uiLang, "empty.canvas.ex3")]}
            onPickExample={pickExample}
          />
        ) : (
          <ChatMessageDisplay
            messages={messages}
            isGenerating={isGenerating}
            resolveCanvasImage={resolveCanvasImage}
            chatImages={chatImages}
          />
        )}
      </div>

      <div className="p-4 border-t border-border/50 bg-card/50">
        <VersionStrip
          versions={imageVersions}
          activeElementId={activeImageElementId}
          onSelectVersion={onSelectVersion}
        />
        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isLoading={isGenerating}
          onClearChat={() => setShowResetWarning(true)}
          uploadMode="none"
          focusKey={focusTick || undefined}
          placeholder={t(uiLang, "workspace.canvas.placeholder")}
          toolbarExtras={
            <>
              <ButtonWithTooltip
                tooltipContent={
                  canAnnotateEdit
                    ? t(uiLang, "workspace.canvas.annotateEdit")
                    : t(uiLang, "workspace.canvas.annotateEditHint")
                }
                variant="ghost"
                size="sm"
                onClick={handleAnnotatedEdit}
                disabled={!canAnnotateEdit || isGenerating}
                className="h-8 w-8 p-0 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
              >
                <Wand2 className="h-4 w-4" />
              </ButtonWithTooltip>

              <div className="w-px h-5 bg-border mx-1" />

              <Select
                value={imageOptions.size}
                onValueChange={(value) => updateImageOptions({ size: value as ImageSize })}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  title={tr("图片尺寸", "Image size")}
                >
                  <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={size} className="text-xs">
                      {size === "auto" ? tr("自动尺寸", "Auto size") : size.replace("x", " × ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={imageOptions.quality}
                onValueChange={(value) => updateImageOptions({ quality: value as ImageQuality })}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  title={tr("清晰度", "Quality")}
                >
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_QUALITIES.map((quality) => (
                    <SelectItem key={quality} value={quality} className="text-xs">
                      {qualityLabel(quality)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      </div>


      <ResetWarningModal
        open={showResetWarning}
        onOpenChange={setShowResetWarning}
        onClear={clearAll}
        labels={{
          description: tr(
            "将同时清空对话记录和画布上的所有内容。此操作无法撤销。",
            "This clears both the chat log and everything on the canvas. This cannot be undone.",
          ),
        }}
      />
    </div>
  );
}
