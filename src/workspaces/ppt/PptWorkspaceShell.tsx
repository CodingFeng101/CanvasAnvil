import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type PanelImperativeHandle,
} from "@/workspaces/ppt/ui/resizable";
import {
  PPT_OUTLINE_EDIT_SYSTEM_PROMPT,
  PPT_SLIDES_EDIT_SYSTEM_PROMPT,
} from "@/lib/system-prompts";
import { clearPersistedPptWorkspaceState } from "@/lib/ppt-persistence";
import type { ChatMessage } from "@/lib/ai-client";
import { PptWorkspace } from "@/workspaces/ppt/workspace/PptWorkspace";
import { ChatPanel as PptChatPanel } from "@/workspaces/ppt/chat/ChatPanel";
import type { HistoryItem } from "@/workspaces/ppt/chat/history-dialog";

type Attachment = {
  id: string;
  type: "xml" | "python" | "json";
  content: string;
  name: string;
};

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string };

const PPT_WORKSPACE_STORAGE_KEY = "CanvasAnvil-ppt-state-v1";
const PPT_RETURN_STAGE_STORAGE_KEY = "CanvasAnvil-ppt-return-stage-v1";
const PPT_HISTORY_STORAGE_KEY = "CanvasAnvil-history-ppt-v1";
const PPT_CHAT_STORAGE_KEY = "chat_history_v2_ppt";

export function PptWorkspaceShell() {
  const uiLang = useUiLanguage();
  const didMountRef = useRef(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pptIncomingEdit, setPptIncomingEdit] = useState<{ id: string; payload: string } | null>(null);
  const [pptDraftSlides, setPptDraftSlides] = useState<
    Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>
  >([]);
  const [pptResetTick, setPptResetTick] = useState(0);
  const [pptReady, setPptReady] = useState(false);
  const [pptStage, setPptStage] = useState<"start" | "outline" | "slides">(() => {
    if (typeof window === "undefined") return "start";
    try {
      const saved = localStorage.getItem(PPT_RETURN_STAGE_STORAGE_KEY);
      return saved === "outline" || saved === "slides" || saved === "start" ? saved : "start";
    } catch {
      return "start";
    }
  });
  const [pptCreationMode, setPptCreationMode] = useState<"idea" | "outline" | "beautify" | "image_transform">("idea");
  const [pptExportReviewActive, setPptExportReviewActive] = useState(false);
  const [pptEmbeddedEditorActive, setPptEmbeddedEditorActive] = useState(false);

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

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const showPptChat =
    (pptStage === "outline" || pptStage === "slides") &&
    pptCreationMode !== "image_transform" &&
    !pptExportReviewActive &&
    !pptEmbeddedEditorActive;
  const pptChatLocked = !showPptChat || !pptReady;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_HISTORY_STORAGE_KEY, JSON.stringify(versionHistory));
    } catch {
    }
  }, [versionHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_RETURN_STAGE_STORAGE_KEY, pptStage);
    } catch {
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
    }
    try {
      localStorage.removeItem(PPT_HISTORY_STORAGE_KEY);
    } catch {
    }
  }, [pptStage]);

  useEffect(() => {
    if (pptChatLocked && isChatCollapsed) {
      setIsChatCollapsed(false);
    }
  }, [pptChatLocked, isChatCollapsed]);

  useEffect(() => {
    if (!showPptChat || pptChatLocked) return;
    const timer = window.setTimeout(() => {
      const panel = chatPanelRef.current;
      if (!panel) return;
      try {
        if (!panel.isCollapsed?.()) return;
        panel.resize("32%");
        setIsChatCollapsed(false);
      } catch {
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showPptChat, pptChatLocked]);

  const toggleCollapse = () => {
    if (pptChatLocked) return;
    const panel = chatPanelRef.current;
    if (!panel) return;
    try {
      if (panel.isCollapsed?.() || isChatCollapsed) {
        panel.expand();
        setIsChatCollapsed(false);
      } else {
        panel.collapse();
        setIsChatCollapsed(true);
      }
    } catch {
      setIsChatCollapsed(false);
    }
  };

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
    type: "flow" | "cad" | "ppt",
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
    setPptIncomingEdit(null);
    setPptDraftSlides([]);
    setPptReady(false);
    setPptStage("start");
    setPptCreationMode("idea");
    setPptExportReviewActive(false);
    setPptEmbeddedEditorActive(false);
    setChatHistory([]);
    setAttachments([]);
    setVersionHistory([]);
    try {
      localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY);
    } catch {
    }
    void clearPersistedPptWorkspaceState().catch((e) => {
      console.error("Failed to clear persisted PPT workspace", e);
    });
    try {
      localStorage.removeItem(PPT_CHAT_STORAGE_KEY);
    } catch {
    }
    try {
      localStorage.removeItem(PPT_HISTORY_STORAGE_KEY);
    } catch {
    }
    setPptResetTick((x) => x + 1);
  };

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      style={{ height: "100%" }}
    >
      <ResizablePanel
        defaultSize={pptChatLocked ? "100%" : "68%"}
        minSize="30%"
        className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
      >
        <div className="h-full w-full relative bg-muted/20">
          <PptWorkspace
            key={`ppt-${pptResetTick}`}
            onAddToChat={handleAddToChat}
            onPptReadyChange={setPptReady}
            onPptStageChange={setPptStage}
            onCreationModeChange={setPptCreationMode}
            onExportReviewModeChange={setPptExportReviewActive}
            onEmbeddedEditorActiveChange={setPptEmbeddedEditorActive}
            incomingEdit={pptIncomingEdit}
            onIncomingEditHandled={() => setPptIncomingEdit(null)}
            onResetWorkspace={clearWorkspace}
          />
        </div>
      </ResizablePanel>

      {showPptChat && (
        <>
          <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/50 transition-colors w-1.5" />
          <ResizablePanel
            id="ppt-chat"
            panelRef={chatPanelRef}
            defaultSize="32%"
            minSize="20%"
            maxSize="70%"
            collapsible
            collapsedSize="56px"
            onResize={(panelSize) => setIsChatCollapsed(panelSize.inPixels <= 80)}
            className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
          >
            <PptChatPanel
              key="ppt"
              systemPrompt={pptStage === "slides" ? PPT_SLIDES_EDIT_SYSTEM_PROMPT : PPT_OUTLINE_EDIT_SYSTEM_PROMPT}
              initialMessages={chatHistory}
              onMessagesChange={setChatHistory}
              attachments={attachments}
              workspaceId="ppt"
              mode="ppt_image"
              hideHistoryButton
              collapsed={isChatCollapsed}
              collapseLocked={pptChatLocked}
              title={t(uiLang, "workspace.ppt.title")}
              inputPlaceholder={t(uiLang, "workspace.ppt.placeholder")}
              onToggleCollapse={toggleCollapse}
              onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              onClearAttachments={() => setAttachments([])}
              pptDraftSlides={pptDraftSlides}
              onRemovePptDraftSlide={(id) => setPptDraftSlides((prev) => prev.filter((s) => s.id !== id))}
              onClearPptDraftSlides={() => setPptDraftSlides([])}
              onClearWorkspace={clearWorkspace}
              history={versionHistory}
              onRestore={handleRestore}
              onClearVersionHistory={() => setVersionHistory([])}
              onCodeAction={handlePptCodeAction}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
