import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paintbrush } from "lucide-react";
import { CanvasPaneProvider, useCanvasPaneState } from "@/shared/canvas-pane";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/resizable";
import { CanvasSheet, sheetHandleClass } from "@/shared/ui/canvas-sheet";
import { useUiLanguage } from "@/shared/i18n";
import { useTheme } from "@/shared/theme";
import {
  previewAnnotatedEdit,
  runAnnotatedEdit,
  type AnnotatedEditOptions,
} from "@/workspaces/canvas/canvas/annotated-edit";
import { CanvasBoard } from "@/workspaces/canvas/canvas/CanvasBoard";
import { insertGeneratedImage } from "@/workspaces/canvas/canvas/insert-image";
import { getLineageReturnTo, getLineageVersions, type ImageVersion, type SelectedImageInfo } from "@/workspaces/canvas/canvas/lineage";
import { openCanvasFor, updateWorkValue } from "@/shared/references/bus";
import { appendInbox, PPT_INBOX_KEY, type SlideInboxEntry } from "@/shared/references/inbox";
import { peekPendingReference, takePendingReference, type BoardReturnTo } from "@/shared/references/pending";
import { useWork } from "@/shared/works/work-context";
import { ChatPanel } from "@/workspaces/canvas/chat/ChatPanel";

export function CanvasWorkspace() {
  const uiLang = useUiLanguage();
  const { isDark } = useTheme();
  const pane = useCanvasPaneState({ kind: uiLang === "zh" ? "画面" : "Picture", icon: Paintbrush, variant: "canvas" });

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImageInfo | null>(null);
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [returnTo, setReturnTo] = useState<BoardReturnTo | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const work = useWork();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  // Written once the imperative API is available, purely to make that moment
  // trigger a re-render -- the chat panel resolves canvas image references on
  // render, and its first pass (mounted before the api ref is set) needs a
  // nudge to re-resolve once the canvas is actually ready.
  const [canvasReady, setCanvasReady] = useState(false);


  const handleSelectedImageChange = (info: SelectedImageInfo | null) => {
    setSelectedImage(info);
    const api = excalidrawApiRef.current;
    setVersions(info && api ? getLineageVersions(api, info.lineageId) : []);
    setReturnTo(info && api ? getLineageReturnTo(api, info.lineageId) : null);
  };

  /**
   * A slide brought here from a deck ("到自由画布修改"): onto the board, remembering where it goes
   * back. Taken only when the timer fires, after the board has put its saved scene in (or the
   * picture would be drawn over) and on the board that stays (a remount cancels the timer).
   */
  useEffect(() => {
    if (!canvasReady || peekPendingReference("canvas")?.intent.kind !== "board-edit") return;
    const timer = setTimeout(() => {
      const api = excalidrawApiRef.current;
      const waiting = api ? takePendingReference("canvas") : null;
      if (!api || !waiting || waiting.intent.kind !== "board-edit") return;
      const { returnTo: target } = waiting.intent;
      const picture = waiting.reference.items.find((item) => item.kind === "image" && item.dataUrl);
      if (!picture?.dataUrl) return;
      void insertGeneratedImage(api, picture.dataUrl, {
        note: tr(`来自 PPT「${target.deckName}」${target.slideLabel}`, `From the deck "${target.deckName}", ${target.slideLabel}`),
        returnTo: target,
      })
        .then(() => {
          // Brought here to be edited: the board opens whatever the auto-open setting says.
          pane.value.reveal();
          pane.value.show();
          toast.success(
            tr(
              `已放到白板上。圈出要改的地方让 AI 改，选中满意的版本后点「送回 PPT ${target.slideLabel}」。`,
              `On the board. Mark what to change and ask for it, then select the version you like and press "Send back to ${target.slideLabel}".`,
            ),
            { duration: 8000 },
          );
        })
        .catch((error) => {
          console.error("Failed to place the slide on the board", error);
          toast.error(tr("没能把这一页放到白板上", "Could not put the slide on the board"));
        });
    }, 400);
    return () => clearTimeout(timer);
    // Once the board is ready; the reference is removed as it is taken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady]);

  /** The selected version goes back to its slide as a new version, then the deck opens there. */
  const sendBack = async () => {
    const api = excalidrawApiRef.current;
    const target = returnTo;
    const elementId = selectedImage?.elementId;
    if (!api || !target || !elementId || sendingBack) return;
    const dataUrl = resolveCanvasImage(elementId);
    if (!dataUrl) return;
    const version = versions.find((v) => v.elementId === elementId);
    setSendingBack(true);
    try {
      const entry: SlideInboxEntry = {
        slideId: target.slideId,
        dataUrl,
        ...(version?.note ? { note: version.note } : {}),
        from: work?.name || tr("自由画布", "Free canvas"),
        createdAt: Date.now(),
      };
      const ok = await updateWorkValue<SlideInboxEntry[]>("ppt", target.workId, PPT_INBOX_KEY, (previous) => appendInbox(previous, entry));
      if (!ok) {
        toast.error(tr(`找不到 PPT「${target.deckName}」了，可能已被删除。`, `The deck "${target.deckName}" is gone; it may have been deleted.`));
        return;
      }
      await openCanvasFor("ppt", target.workId);
    } finally {
      setSendingBack(false);
    }
  };

  const handleImageGenerated = async (dataUrl: string, prompt: string): Promise<string | null> => {
    const api = excalidrawApiRef.current;
    if (!api) return null;
    try {
      const { elementId } = await insertGeneratedImage(api, dataUrl, { note: prompt });
      pane.value.reveal();
      return elementId;
    } catch (e) {
      console.error("Failed to place generated image on the canvas", e);
      return null;
    }
  };

  /** A picture's current bytes, looked up by the canvas element holding it -- null once it's gone (cleared, undone, never placed). */
  const resolveCanvasImage = (elementId: string): string | null => {
    const api = excalidrawApiRef.current;
    if (!api) return null;
    const element = api.getSceneElements().find((el) => el.id === elementId);
    if (!element || element.type !== "image" || !element.fileId) return null;
    return api.getFiles()[element.fileId]?.dataURL || null;
  };

  const handleAnnotatedEdit = async (instruction: string, options?: AnnotatedEditOptions) => {
    const api = excalidrawApiRef.current;
    if (!api) {
      return { ok: false, error: uiLang === "zh" ? "画布还没准备好。" : "The canvas isn't ready yet." };
    }
    return await runAnnotatedEdit(api, instruction, uiLang, options);
  };

  const handlePreviewAnnotatedEdit = async () => {
    const api = excalidrawApiRef.current;
    if (!api) {
      return { ok: false, error: uiLang === "zh" ? "画布还没准备好。" : "The canvas isn't ready yet." };
    }
    return await previewAnnotatedEdit(api, uiLang);
  };

  const handleClearAll = () => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    // Soft-deleted (via newElementWith) rather than an empty updateScene, so
    // this stays undoable like every other deletion on the board.
    const cleared = api.getSceneElements().map((el) => newElementWith(el, { isDeleted: true }));
    api.updateScene({ elements: cleared, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSelectedImage(null);
    setVersions([]);
  };

  const handleSelectVersion = (elementId: string) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const element = api.getSceneElements().find((el) => el.id === elementId);
    if (!element) return;
    api.updateScene({
      appState: { selectedElementIds: { [elementId]: true } },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
    api.scrollToContent(element, { fitToContent: true, animate: true });
  };

  return (
    <CanvasPaneProvider value={pane.value}>
    <ResizablePanelGroup orientation="horizontal" className="h-full" style={{ height: "100%" }}>
      <ResizablePanel
        id="canvas-chat"
        {...pane.chatPanelProps}
      >
        <div ref={pane.chatColumnRef} className={pane.chatColumnClassName}>
        <ChatPanel
          onImageGenerated={handleImageGenerated}
          resolveCanvasImage={resolveCanvasImage}
          canAnnotateEdit={selectedImage !== null}
          onAnnotatedEdit={handleAnnotatedEdit}
          onPreviewAnnotatedEdit={handlePreviewAnnotatedEdit}
          imageVersions={versions}
          activeImageElementId={selectedImage?.elementId ?? null}
          onSelectVersion={handleSelectVersion}
          sendBack={returnTo ? { label: returnTo.slideLabel, busy: sendingBack, onSend: () => void sendBack() } : null}
          onClearAll={handleClearAll}
        />
        </div>
      </ResizablePanel>

      <ResizableHandle className={sheetHandleClass} />

      <ResizablePanel id="canvas-board" {...pane.canvasPanelProps}>
        <CanvasSheet>
          <CanvasBoard
            theme={isDark ? "dark" : "light"}
            langCode={uiLang === "zh" ? "zh-CN" : "en"}
            onApiReady={(api) => {
              excalidrawApiRef.current = api;
              setCanvasReady(true);
            }}
            onSelectedImageChange={handleSelectedImageChange}
          />
        </CanvasSheet>
      </ResizablePanel>
    </ResizablePanelGroup>
    </CanvasPaneProvider>
  );
}
