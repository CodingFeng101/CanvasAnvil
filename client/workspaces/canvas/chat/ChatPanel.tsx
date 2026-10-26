import { useState } from "react";
import { Maximize2, PanelRightClose, PanelRightOpen, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { generateImage, type ImageQuality, type ImageSize } from "@/ai/client";
import { ButtonWithTooltip, ChatInput, ResetWarningModal } from "@/shared/chat";
import { chatStorageKey, loadChatHistory, saveChatHistory } from "@/shared/chat/chat-storage";
import { t, useUiLanguage } from "@/shared/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { AnnotatedEditOptions, AnnotatedEditPreview, AnnotatedEditResult } from "@/workspaces/canvas/canvas/annotated-edit";
import type { ImageVersion } from "@/workspaces/canvas/canvas/lineage";
import { withCanvasImageRef } from "@/workspaces/canvas/chat/canvas-image-ref";
import { ChatMessageDisplay, type CanvasChatMessage } from "@/workspaces/canvas/chat/ChatMessageDisplay";
import { HistoryDialog } from "@/workspaces/canvas/chat/HistoryDialog";

const IMAGE_SIZES: ImageSize[] = [
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1792x1024",
  "1024x1792",
];
const IMAGE_QUALITIES: ImageQuality[] = ["auto", "low", "medium", "high"];

const STORAGE_KEY = chatStorageKey("canvas");
const IMAGE_OPTIONS_STORAGE_KEY = "CanvasAnvil-canvas-image-options-v1";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
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
  onImageGenerated: (dataUrl: string) => Promise<string | null>;
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
  const [showHistory, setShowHistory] = useState(false);
  const [imageOptions, setImageOptions] = useState(loadImageOptions);

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

    try {
      const url = await generateImage({ prompt, size: imageOptions.size, quality: imageOptions.quality });
      if (!url) throw new Error("empty result");
      const elementId = await onImageGenerated(url);
      const assistantMessage: CanvasChatMessage = {
        id: makeId(),
        role: "assistant",
        content: `[[IMAGE|${withCanvasImageRef(prompt.slice(0, 60), elementId)}|${url}]]`,
      };
      persist([...withUser, assistantMessage]);
    } catch (error) {
      console.error("Canvas image generation failed", error);
      const assistantMessage: CanvasChatMessage = {
        id: makeId(),
        role: "assistant",
        content: tr("生成失败，请重试。", "Generation failed. Please try again."),
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

    const preview = await onPreviewAnnotatedEdit();
    const userMessage: CanvasChatMessage = {
      id: makeId(),
      role: "user",
      content:
        preview.ok && preview.previewUrl
          ? `[[IMAGE|${tr("标注", "Annotation")}|${preview.previewUrl}]]\n${instructionText}`
          : instructionText,
    };
    const withUser = [...messages, userMessage];
    persist(withUser);
    setInput("");
    setIsGenerating(true);

    try {
      const result = await onAnnotatedEdit(instruction, { size: imageOptions.size, quality: imageOptions.quality });
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
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAll = () => {
    persist([]);
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
        <ChatMessageDisplay messages={messages} isGenerating={isGenerating} resolveCanvasImage={resolveCanvasImage} />
      </div>

      <div className="p-4 border-t border-border/50 bg-card/50">
        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isLoading={isGenerating}
          onClearChat={() => setShowResetWarning(true)}
          onToggleHistory={() => setShowHistory(true)}
          historyDisabled={imageVersions.length === 0}
          uploadMode="none"
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

      <HistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        versions={imageVersions}
        activeElementId={activeImageElementId}
        onSelectVersion={onSelectVersion}
      />

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
