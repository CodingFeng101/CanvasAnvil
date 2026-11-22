import { usePendingPrompt } from "@/shared/pending-prompt";
import { useSendAfterRender } from "@/shared/chat/use-send-after-render";
import { ChatTitle } from "@/shared/chat/chat-title";
import { CanvasOpenButton, useCanvasPane } from "@/shared/canvas-pane";
import { useEffect, useRef, useState } from "react";
import { Paintbrush } from "lucide-react";
import { notify } from "@/shared/ui/notify";
import type { WorkReference } from "@/shared/references/types";
import { StatusSelect } from "@/shared/chat/composer";
import { constraintsFor } from "@/shared/constraints";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "@contracts/ai";
import { cn } from "@/shared/lib/utils";
import { generateImage, type ImageQuality, type ImageSize } from "@/ai/client";
import { ChatEmptyState,
  ChatLandingExtras, ChatInput, ResetWarningModal } from "@/shared/chat";
import { chatStorageKey, loadChatHistory, saveChatHistory } from "@/shared/chat/chat-storage";
import { t, useUiLanguage } from "@/shared/i18n";
import type { AnnotatedEditOptions, AnnotatedEditPreview, AnnotatedEditResult } from "@/workspaces/canvas/canvas/annotated-edit";
import type { ImageVersion } from "@/workspaces/canvas/canvas/lineage";
import { referencedCanvasElementIds, referencedChatImageIds, withCanvasImageRef, withChatImageRef } from "@/workspaces/canvas/chat/canvas-image-ref";
import {
  loadChatImages,
  pruneChatImages,
  saveChatImages,
  shrinkForChat,
  type ChatImageMap,
} from "@/workspaces/canvas/chat/chat-images";
import { peekPendingReference } from "@/shared/references/pending";
import { ChatMessageDisplay, type CanvasChatMessage, type EditStage } from "@/workspaces/canvas/chat/ChatMessageDisplay";
import { VersionStrip } from "@/workspaces/canvas/chat/version-strip";
import { canvasStore } from "@/workspaces/canvas/storage";
import { useReportBusy, useReportLastPrompt, useWork, useWorkStore } from "@/shared/works/work-context";
import { nameFromText } from "@/shared/works/works-index";

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
  /** The selected picture came from a slide: send the selected version back to it. */
  sendBack?: { label: string; busy: boolean; onSend: () => void } | null;
  /** Wipes the canvas; called together with clearing the chat log so "clear" means everything, in one action. */
  onClearAll: () => void;
  /** Editing an earlier message: the pictures the dropped turns put on the board come off it again. */
  onRemoveImages: (elementIds: string[]) => void;
  /** A picture is being generated at this size / it is done (or failed). */
  onDrawingStart: (size: ImageSize) => void;
  onDrawingEnd: () => void;
}

export function ChatPanel({
  className,
  onImageGenerated,
  resolveCanvasImage,
  canAnnotateEdit,
  onAnnotatedEdit,
  onPreviewAnnotatedEdit,
  imageVersions,
  activeImageElementId,
  onSelectVersion,
  sendBack,
  onClearAll,
  onRemoveImages,
  onDrawingStart,
  onDrawingEnd,
}: ChatPanelProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);

  const work = useWork();
  const imageStore = useWorkStore(canvasStore);
  // Brought here from another canvas (a slide to edit on the board): the chat says so, so the
  // panel opens on the conversation rather than on the empty start screen.
  const arrivedRef = useRef(false);
  const [messages, setMessages] = useState<CanvasChatMessage[]>(() => {
    const loaded = loadChatHistory(STORAGE_KEY, []).map((m) => ({ ...m, id: makeId() }));
    const waiting = peekPendingReference("canvas");
    if (waiting?.intent.kind !== "board-edit") return loaded;
    const { deckName, slideLabel } = waiting.intent.returnTo;
    arrivedRef.current = true;
    const note = tr(
      `PPT「${deckName}」${slideLabel}已放到白板上。圈出要改的地方，告诉我怎么改；选中满意的版本后点「送回 PPT ${slideLabel}」。`,
      `${slideLabel} of the deck "${deckName}" is on the board. Mark what to change and tell me how; then select the version you like and press "Send back to ${slideLabel}".`,
    );
    return [...loaded, { id: makeId(), role: "assistant", content: note }];
  });
  useEffect(() => {
    if (arrivedRef.current) saveChatHistory(STORAGE_KEY, messages);
    // Once, for the note added on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [input, setInput] = useState("");
  const canvasPane = useCanvasPane();
  // A sentence written on the portal lands here once, unsent.
  usePendingPrompt("canvas", setInput);
  const [isGenerating, setIsGenerating] = useState(false);
  /** An annotated edit under way: reading the markup, then drawing from what it was read as. */
  const [editStage, setEditStage] = useState<EditStage | null>(null);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [imageOptions, setImageOptions] = useState(loadImageOptions);
  const [focusTick] = useState(0);

  // My works: no switching mid-generation; the first request names the work.
  useReportBusy(isGenerating);
  useReportLastPrompt([...messages].reverse().find((m) => m.role === "user")?.content);
  const firstRequest = messages.find((m) => m.role === "user")?.content;
  useEffect(() => {
    if (!work || !firstRequest) return;
    const nameHint = nameFromText(firstRequest);
    work.report({ touched: true, ...(nameHint ? { nameHint } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstRequest]);

  /** An example from the empty state goes into the input, not straight to the model, so it can be adjusted first. */
  // An example is sent as it is, not left in the box to send by hand.
  const sendExample = useSendAfterRender(() => handleSubmit());
  const pickExample = (text: string) => {
    setInput(text);
    sendExample();
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
    void loadChatImages(imageStore)
      .then((stored) => {
        if (cancelled) return;
        // History is trimmed as it is saved, so stored pictures can outlive
        // the messages that showed them; drop those on the way in.
        const referenced = referencedChatImageIds(messages.map((m) => m.content || ""));
        const kept = pruneChatImages(stored, referenced);
        chatImagesRef.current = { ...kept, ...chatImagesRef.current };
        setChatImages(chatImagesRef.current);
        if (Object.keys(kept).length !== Object.keys(stored).length) {
          void saveChatImages(chatImagesRef.current, imageStore).catch((e) => console.error("Failed to prune chat images", e));
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
    void saveChatImages(next, imageStore).catch((e) => console.error("Failed to persist chat images", e));
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

  // Once a picture is on the canvas, the empty box suggests editing it by its
  // annotation (Tab puts the words in); sending those words runs that edit.
  // A picture that came from elsewhere (a referenced work, a slide sent to the board) counts too:
  // it is selected as it lands.
  const hasPicture = canAnnotateEdit || messages.some((m) => m.role === "assistant" && m.content.includes("[[IMAGE|"));
  const annotateSuggestion = tr("按标注修改选中的图片", "Edit the selected picture by its annotation");

  const handleSubmit = () => {
    const prompt = input.trim();
    if (!prompt || isGenerating) return;
    if (prompt.startsWith(annotateSuggestion)) {
      if (!canAnnotateEdit) {
        notify.info(tr("先选中要改的图片", "Select the picture to edit first"), { description: t(uiLang, "workspace.canvas.annotateEditHint") });
        return;
      }
      void handleAnnotatedEdit(prompt.slice(annotateSuggestion.length).replace(/^[\s:：,，。.]+/, ""));
      return;
    }
    setInput("");
    canvasPane?.requested();
    void generateFrom(prompt, messages);
  };

  /**
   * Editing a message of yours: what came after it goes, and so do the pictures those turns put on
   * the board (a picture still shown by an earlier message stays); then the picture is drawn again.
   */
  const handleEditMessage = (index: number, text: string) => {
    if (isGenerating || messages[index]?.role !== "user") return;
    const kept = new Set(referencedCanvasElementIds(messages.slice(0, index).map((m) => m.content || "")));
    const dropped = referencedCanvasElementIds(messages.slice(index).map((m) => m.content || "")).filter((id) => !kept.has(id));
    if (dropped.length) onRemoveImages(dropped);
    void generateFrom(text, messages.slice(0, index));
  };

  const generateFrom = async (prompt: string, base: CanvasChatMessage[]) => {
    const userMessage: CanvasChatMessage = { id: makeId(), role: "user", content: prompt };
    const withUser = [...base, userMessage];
    persist(withUser);
    setIsGenerating(true);
    const epoch = clearEpochRef.current;
    onDrawingStart(imageOptions.size);

    try {
      const constraints = constraintsFor("canvas");
      const url = await generateImage({
        prompt: constraints ? `${prompt}

${constraints}` : prompt,
        size: imageOptions.size,
        quality: imageOptions.quality,
      });
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
      onDrawingEnd();
      setIsGenerating(false);
    }
  };

  const handleAnnotatedEdit = async (override?: string) => {
    if (!canAnnotateEdit || isGenerating) return;
    const instruction = (override ?? input).trim();
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
        onStage: (stage) => {
          if (epoch === clearEpochRef.current) setEditStage(stage);
        },
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
      setEditStage(null);
      setIsGenerating(false);
    }
  };

  const clearAll = () => {
    clearEpochRef.current += 1;
    if (work) {
      // My works: start over on a new draft; a saved work keeps its board and chat.
      setShowResetWarning(false);
      work.startOver();
      return;
    }
    persist([]);
    writeChatImages({});
    onClearAll();
    setShowResetWarning(false);
  };


  const qualityLabel = (quality: ImageQuality) =>
    quality === "auto"
      ? tr("自动", "Auto")
      : quality === "low"
        ? tr("低", "Low")
        : quality === "medium"
          ? tr("中", "Medium")
          : tr("高", "High");

  const placeReference = async (reference: WorkReference) => {
    const tags: string[] = [];
    for (const item of reference.items) {
      if (item.kind !== "image" || !item.dataUrl) continue;
      const note = tr(`引用自「${reference.workName}」· ${item.label}`, `From "${reference.workName}" · ${item.label}`);
      const elementId = await onImageGenerated(item.dataUrl, note);
      // The chat shows the picture from the board (its bytes stay out of the history).
      if (elementId) tags.push(`[[IMAGE|${withCanvasImageRef(item.label, elementId)}|[image-data]]]`);
    }
    if (tags.length) {
      // Said in the chat, so the conversation knows the picture is there (and offers to edit it by its marks).
      const note = tr(
        `已把「${reference.workName}」的 ${tags.length} 张图放到白板上。圈出要改的地方，告诉我怎么改。`,
        `${tags.length} picture(s) from "${reference.workName}" are on the board. Mark what to change and tell me how.`,
      );
      persist([...messages, { id: makeId(), role: "assistant", content: [note, ...tags].join("\n") }]);
    } else notify.error(tr("没能放到白板上", "Could not place them on the board"), { description: tr("引用里没有可放的图片，或白板还没准备好，稍后再试。", "The reference has no picture to place, or the board is not ready; try again shortly.") });
  };

  return (
    <div className={cn("h-full flex flex-col bg-transparent animate-fade-in relative", className)}>
      <div className="flex h-12 shrink-0 flex-col justify-center px-4">
        <div className="flex items-center justify-between">
          <ChatTitle fallback={t(uiLang, "workspace.canvas.title")} />
          <div className="flex items-center gap-1">
          <CanvasOpenButton />
          </div>
        </div>
      </div>

      <div className="flex-1 w-full overflow-hidden">
        {messages.length === 0 && !isGenerating ? (
          <ChatEmptyState
            icon={Paintbrush}
            title={t(uiLang, "empty.canvas.title")}
            description={t(uiLang, "empty.canvas.desc")}
          />
        ) : (
          <ChatMessageDisplay
            messages={messages}
            isGenerating={isGenerating}
            editStage={editStage}
            onEditMessage={handleEditMessage}
            resolveCanvasImage={resolveCanvasImage}
            chatImages={chatImages}
          />
        )}
      </div>

      <div className={`chat-measure px-4 pb-4 pt-2${(messages.length === 0 && !isGenerating) ? " [--chat-measure:720px]" : ""}`}>
        <VersionStrip
          versions={imageVersions}
          activeElementId={activeImageElementId}
          onSelectVersion={onSelectVersion}
          sendBack={sendBack}
        />
        <ChatInput
          constraintScope="canvas"
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isLoading={isGenerating}
          uploadMode="none"
          // A referenced picture goes onto the board, as a new picture with its source noted.
          referenceAccept={["image"]}
          onReference={(reference) => void placeReference(reference)}
          focusKey={focusTick || undefined}
          placeholder={t(uiLang, "workspace.canvas.placeholder")}
          suggestion={hasPicture && !isGenerating ? annotateSuggestion : undefined}
          // Pictures come from the image model; marks on a picture are read by the text model first.
          statusChannels={hasPicture ? ["image", "text"] : ["image"]}
          statusExtras={
            <>
              <StatusSelect<ImageSize>
                label={tr("图片尺寸", "Image size")}
                value={imageOptions.size}
                changed={imageOptions.size !== "auto"}
                onChange={(size) => updateImageOptions({ size })}
                options={IMAGE_SIZES.map((size) => ({ value: size, label: size === "auto" ? tr("自动尺寸", "Auto size") : size.replace("x", " × ") }))}
              />
              <StatusSelect<ImageQuality>
                label={tr("清晰度", "Quality")}
                value={imageOptions.quality}
                changed={imageOptions.quality !== "auto"}
                onChange={(quality) => updateImageOptions({ quality })}
                options={IMAGE_QUALITIES.map((quality) => ({ value: quality, label: quality === "auto" ? tr("自动清晰度", "Auto quality") : qualityLabel(quality) }))}
              />
            </>
          }
        />
      </div>
      {(messages.length === 0 && !isGenerating) && <ChatLandingExtras icon={Paintbrush} images={["/examples/portal/canvas-pic-v1-sm.webp", "/examples/portal/canvas-ex2-sm.webp", "/examples/portal/canvas-ex3-sm.webp"]} examples={[t(uiLang, "empty.canvas.ex1"), t(uiLang, "empty.canvas.ex2"), t(uiLang, "empty.canvas.ex3")]} onPickExample={pickExample} />}


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
