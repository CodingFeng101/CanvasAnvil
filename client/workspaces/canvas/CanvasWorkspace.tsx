import { useRef, useState } from "react";
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
import { getLineageVersions, type ImageVersion, type SelectedImageInfo } from "@/workspaces/canvas/canvas/lineage";
import { ChatPanel } from "@/workspaces/canvas/chat/ChatPanel";

export function CanvasWorkspace() {
  const uiLang = useUiLanguage();
  const { isDark } = useTheme();
  const pane = useCanvasPaneState({ kind: uiLang === "zh" ? "画面" : "Picture", icon: Paintbrush, variant: "canvas" });

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImageInfo | null>(null);
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  // Written once the imperative API is available, purely to make that moment
  // trigger a re-render -- the chat panel resolves canvas image references on
  // render, and its first pass (mounted before the api ref is set) needs a
  // nudge to re-resolve once the canvas is actually ready.
  const [, setCanvasReady] = useState(false);


  const handleSelectedImageChange = (info: SelectedImageInfo | null) => {
    setSelectedImage(info);
    const api = excalidrawApiRef.current;
    setVersions(info && api ? getLineageVersions(api, info.lineageId) : []);
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
