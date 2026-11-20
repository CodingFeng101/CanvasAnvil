import { useCallback, useEffect, useRef, useState } from "react";
import { Presentation } from "lucide-react";
import { CanvasPaneProvider, useCanvasPaneState } from "@/shared/canvas-pane";
import type { CreationRequest, CreationResult } from "@/workspaces/ppt/lib/creation-intent";
import { t, useUiLanguage } from "@/shared/i18n";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/resizable";
import { CanvasSheet, sheetHandleClass } from "@/shared/ui/canvas-sheet";
import { PPT_OUTLINE_EDIT_SYSTEM_PROMPT, PPT_SLIDES_EDIT_SYSTEM_PROMPT } from "@/workspaces/ppt/lib/prompts";
import {
  PPT_CHAT_STORAGE_KEY,
  PPT_HISTORY_STORAGE_KEY,
  PPT_RETURN_STAGE_STORAGE_KEY,
  PPT_STATE_KEY,
  PPT_WORKSPACE_STORAGE_KEY,
  pptStore,
} from "@/workspaces/ppt/storage";
import type { ChatMessage } from "@/ai/client";
import { PptCanvas } from "@/workspaces/ppt/canvas/PptCanvas";
import { ChatPanel as PptChatPanel } from "@/workspaces/ppt/chat/ChatPanel";
import type { HistoryItem } from "@/shared/chat";
import { useWork } from "@/shared/works/work-context";

type Attachment = {
  id: string;
  type: "xml" | "python" | "json";
  content: string;
  name: string;
};

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string };


export function PptWorkspace() {
  const uiLang = useUiLanguage();
  const work = useWork();
  const pane = useCanvasPaneState({ kind: uiLang === "zh" ? "演示文稿" : "Deck", icon: Presentation, variant: "ppt" });
  const didMountRef = useRef(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pptIncomingEdit, setPptIncomingEdit] = useState<{ id: string; payload: string } | null>(null);
  const [pptDraftSlides, setPptDraftSlides] = useState<
    Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>
  >([]);
  const [pptResetTick, setPptResetTick] = useState(0);
  const [, setPptReady] = useState(false);
  const [pptStage, setPptStage] = useState<"start" | "outline" | "slides">(() => {
    if (typeof window === "undefined") return "start";
    try {
      const saved = localStorage.getItem(PPT_RETURN_STAGE_STORAGE_KEY);
      return saved === "outline" || saved === "slides" || saved === "start" ? saved : "start";
    } catch {
      return "start";
    }
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [versionHistory, setVersionHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PPT_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });


  /** The first message of a deck goes to the canvas, which owns the template, the files and the flows. */
  const [creationRequest, setCreationRequest] = useState<(CreationRequest & { id: string }) | null>(null);
  const creationResolvers = useRef(new Map<string, (result: CreationResult) => void>());
  const [draftText, setDraftText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; previewSrc: string } | null>(null);
  const revealCanvas = pane.value.reveal;
  const startCreation = useCallback(
    (request: CreationRequest) =>
      new Promise<CreationResult>((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        creationResolvers.current.set(id, resolve);
        setCreationRequest({ ...request, id });
        // The deck is made on the canvas: open it to show the work going on.
        revealCanvas();
      }),
    [revealCanvas],
  );
  const handleCreationHandled = useCallback((id: string, result: CreationResult) => {
    creationResolvers.current.get(id)?.(result);
    creationResolvers.current.delete(id);
    setCreationRequest((current) => (current?.id === id ? null : current));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_HISTORY_STORAGE_KEY, JSON.stringify(versionHistory));
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
  }, [versionHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_RETURN_STAGE_STORAGE_KEY, pptStage);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
  }, [pptStage]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (pptStage !== "start") return;
    setChatHistory([]);
    setAttachments([]);
    setVersionHistory([]);
    setPptDraftSlides([]);
    try {
      localStorage.removeItem(PPT_CHAT_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    try {
      localStorage.removeItem(PPT_HISTORY_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
  }, [pptStage]);


  const addToHistory = (content: string, type: HistoryItem["type"]) => {
    const item: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      content,
      type,
    };
    setVersionHistory((prev) => [...prev, item]);
  };

  const handleRestore = (item: HistoryItem) => {
    if (item.type === "json") {
      setPptIncomingEdit({ id: `${Date.now()}`, payload: item.content });
    }
  };

  const handleAddToChat = (code: string, name: string) => {
    const tryAddSlide = (slide: any) => {
      if (!slide || typeof slide !== "object") return;
      const slideId = typeof slide.id === "string" && slide.id.trim() ? slide.id.trim() : "";
      if (!slideId) return;
      const title = typeof slide.title === "string" ? slide.title : "";
      const imageUrl = typeof slide.imageUrl === "string" ? slide.imageUrl : "";
      const kind: "outline" | "slide_image" = imageUrl ? "slide_image" : "outline";
      const json = JSON.stringify(slide, null, 2);
      setPptDraftSlides((prev) => {
        const next = prev.filter((x) => x.slideId !== slideId);
        return [
          ...next,
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            slideId,
            title,
            json,
            kind,
            imageUrl: imageUrl || undefined,
          },
        ];
      });
    };

    try {
      const parsed = JSON.parse(code);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).slides)) {
        for (const s of (parsed as any).slides) tryAddSlide(s);
        return;
      }
      tryAddSlide(parsed);
      return;
    } catch {
      const m = String(name || "").match(/^(slide-\d+)\.json$/i);
      if (m) {
        setPptDraftSlides((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, slideId: m[1], title: "", json: String(code || ""), kind: "outline" },
        ]);
        return;
      }
    }

    setAttachments((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        type: "json",
        content: code,
        name,
      },
    ]);
  };

  const handlePptCodeAction = async (
    code: string,
    type: "diagram" | "cad" | "ppt",
  ): Promise<CodeActionResult> => {
    if (type !== "ppt") return { ok: true };
    try {
      JSON.parse(code);
      setPptIncomingEdit({ id: `${Date.now()}`, payload: code });
      addToHistory(code, "json");
      return { ok: true };
    } catch {
      return { ok: false, retry: false, error: "Invalid PPT JSON" };
    }
  };

  const clearWorkspace = () => {
    // The canvas is remounted below; a flow still running in the old one will never answer.
    for (const resolve of creationResolvers.current.values()) resolve({ ok: false });
    creationResolvers.current.clear();
    if (work) {
      // My works: the workspace remounts on a new draft; a saved deck stays listed.
      work.startOver();
      return;
    }
    setCreationRequest(null);
    setPptIncomingEdit(null);
    setPptDraftSlides([]);
    setPptReady(false);
    setPptStage("start");
    setChatHistory([]);
    setAttachments([]);
    setVersionHistory([]);
    try {
      localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    void pptStore.clear(PPT_STATE_KEY).catch((e) => {
      console.error("Failed to clear persisted PPT workspace", e);
    });
    try {
      localStorage.removeItem(PPT_CHAT_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    try {
      localStorage.removeItem(PPT_HISTORY_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    setPptResetTick((x) => x + 1);
  };

  return (
    <CanvasPaneProvider value={pane.value}>
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      style={{ height: "100%" }}
    >
      {/* The chat is there from the start: a deck is asked for in it, as on the other canvases. */}
      <ResizablePanel
        id="ppt-chat"
        {...pane.chatPanelProps}
      >
        <div ref={pane.chatColumnRef} className={pane.chatColumnClassName}>
        <PptChatPanel
          key="ppt"
          systemPrompt={pptStage === "slides" ? PPT_SLIDES_EDIT_SYSTEM_PROMPT : PPT_OUTLINE_EDIT_SYSTEM_PROMPT}
          initialMessages={chatHistory}
          onMessagesChange={setChatHistory}
          attachments={attachments}
          workspaceId="ppt"
          hideHistoryButton
          title={t(uiLang, "workspace.ppt.title")}
          inputPlaceholder={t(uiLang, "workspace.ppt.placeholder")}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onClearAttachments={() => setAttachments([])}
          pptDraftSlides={pptDraftSlides}
          onClearPptDraftSlides={() => setPptDraftSlides([])}
          onClearWorkspace={clearWorkspace}
          onStartOver={work ? clearWorkspace : undefined}
          history={versionHistory}
          onRestore={handleRestore}
          onClearVersionHistory={() => setVersionHistory([])}
          onCodeAction={handlePptCodeAction}
          stage={pptStage}
          onStartCreation={startCreation}
          selectedTemplate={selectedTemplate}
          onDraftChange={setDraftText}
        />
        </div>
      </ResizablePanel>

      <ResizableHandle className={sheetHandleClass} />

      <ResizablePanel id="ppt-canvas" {...pane.canvasPanelProps}>
        <CanvasSheet>
          <PptCanvas
            key={`ppt-${pptResetTick}`}
            onAddToChat={handleAddToChat}
            onPptReadyChange={setPptReady}
            onPptStageChange={setPptStage}
            incomingEdit={pptIncomingEdit}
            onIncomingEditHandled={() => setPptIncomingEdit(null)}
            onResetWorkspace={clearWorkspace}
            creationRequest={creationRequest}
            onCreationHandled={handleCreationHandled}
            draftText={draftText}
            onTemplateChange={setSelectedTemplate}
          />
        </CanvasSheet>
      </ResizablePanel>
    </ResizablePanelGroup>
    </CanvasPaneProvider>
  );
}
