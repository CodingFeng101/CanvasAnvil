import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/shared/lib/utils";
import { t, useUiLanguage } from "@/shared/i18n";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type PanelImperativeHandle,
} from "@/shared/ui/resizable";
import { CadDesignSession } from "./lib/design/design-session";
import type { ChatMessage } from "@/ai/client";
import { HouseDesignerFrame } from "@/workspaces/cad/designer/HouseDesignerFrame";
import { ChatPanel as CadChatPanel } from "@/workspaces/cad/chat/ChatPanel";
import { layoutToSpec } from "@/workspaces/cad/lib/design/layout";

type Attachment = {
  id: string;
  type: "xml" | "python" | "json";
  content: string;
  name: string;
};

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string };

const CAD_WORKSPACE_STORAGE_KEY = "CanvasAnvil-cad-state-v2";
const CAD_CHAT_STORAGE_KEY = "chat_history_v2_cad";

const tryParseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Not a JSON payload.
      }
    }
    return null;
  }
};

/**
 * Interior design: the chat holds the requirements, the design plan and its analysis images;
 * the canvas is the house designer alone. Delivery (quote, drawings, DXF, renders) comes from the designer.
 */
export function CadWorkspace() {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);

  const [cadPlan, setCadPlan] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(CAD_WORKSPACE_STORAGE_KEY);
      return raw ? JSON.parse(raw)?.cadPlan ?? null : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CAD_WORKSPACE_STORAGE_KEY, JSON.stringify({ cadPlan: cadPlan ?? null, updatedAt: Date.now() }));
    } catch {
      // Keep the previous copy when storage is unavailable.
    }
  }, [cadPlan]);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [cadResetTick, setCadResetTick] = useState(0);
  const [composerRequest, setComposerRequest] = useState<{ id: number; text: string; send?: boolean }>();
  const [designSession] = useState(() => new CadDesignSession());
  useEffect(() => {
    void designSession.hydrate().catch((error) => console.error("CAD design restore failed", error));
  }, [designSession]);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);

  const [canRecognize, setCanRecognize] = useState(false);
  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => setCanRecognize(!!config?.cadRecognizer))
      .catch(() => {});
  }, []);

  const uploadFloorplan = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.bmp,.pdf,.dxf,.dwg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const width = window.prompt(tr("外墙外皮总宽（mm，用来定比例；不知道可留空）", "Overall outer width in mm (sets the scale; leave blank if unknown)"), "");
      if (width === null) return;
      const height = window.prompt(tr("外墙外皮总深（mm，可留空）", "Overall outer depth in mm (optional)"), "");
      const form = new FormData();
      form.append("file", file);
      if (Number(width) > 0) form.append("totalWidth", String(Number(width)));
      if (Number(height) > 0) form.append("totalHeight", String(Number(height)));
      const id = toast.loading(tr("正在识别原始户型…", "Recognizing the floorplan…"));
      try {
        const response = await fetch("/api/cad/recognize", { method: "POST", body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || result.error || response.statusText);
        const strip = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.map(strip)
            : value && typeof value === "object"
              ? Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_")).map(([key, item]) => [key, strip(item)]))
              : value;
        await designSession.loadDraft(strip(result.draft) as never, result.underlay ?? undefined);
        toast.success(
          tr(`已识别 ${result.draft?.walls?.length ?? 0} 面墙，原图已作为底图。`, `Recognized ${result.draft?.walls?.length ?? 0} walls; the original is shown as underlay.`),
          { id, description: (result.warnings ?? []).slice(-2).join("；") || undefined },
        );
        setComposerRequest({
          id: Date.now(),
          text: tr(
            "这是我家的原始户型（已识别墙体和门窗）。请保留现有墙体和门窗，补上房间名称，并按我的需求摆放家具。",
            "This is my existing floorplan (walls and openings recognized). Keep the walls and openings, name the rooms and furnish them for my needs.",
          ),
        });
      } catch (error) {
        toast.error(tr("识别失败：", "Recognition failed: ") + (error as Error).message, { id });
      }
    };
    input.click();
  };

  const toggleCollapse = () => {
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

  const handleCadCodeAction = async (code: string, type: "diagram" | "cad" | "ppt"): Promise<CodeActionResult> => {
    if (type !== "cad") return { ok: true };
    const parsed = tryParseJson(String(code || "").trim());
    if (!parsed) return { ok: false, retry: false, error: tr("JSON 无效", "Invalid JSON") };
    const parsedType = String(parsed?.type || "").trim().toLowerCase();
    if (parsedType === "cad_spec" || parsedType === "cad_ops" || parsedType === "cad_spec_patch" || parsedType === "cad_layout") {
      try {
        await designSession.applyModelOutput(parsedType === "cad_layout" ? { type: "cad_spec", spec: layoutToSpec(parsed.layout).spec } : parsed);
        return { ok: true };
      } catch (reason) {
        return { ok: false, error: String(reason) };
      }
    }
    if (parsedType === "cad_plan") {
      setCadPlan(parsed);
      return { ok: true };
    }
    return { ok: false, error: tr("无法识别 CAD 数据类型", "Unrecognized CAD payload type") };
  };

  const clearWorkspace = async () => {
    try {
      await designSession.clear();
    } catch (reason) {
      toast.error(String(reason));
      return;
    }
    setCadPlan(null);
    setChatHistory([]);
    setAttachments([]);
    for (const key of [CAD_WORKSPACE_STORAGE_KEY, CAD_CHAT_STORAGE_KEY, "CanvasAnvil-history-cad-v1"]) {
      try {
        localStorage.removeItem(key);
      } catch {
        // A blocked localStorage only means the old copy lingers.
      }
    }
    setCadResetTick((x) => x + 1);
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full" style={{ height: "100%" }}>
      <ResizablePanel
        defaultSize="68%"
        minSize="30%"
        className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
      >
        <div className="h-full w-full p-2">
          <HouseDesignerFrame
            key={`cad-ws-${cadResetTick}`}
            session={designSession}
            hasPlan={!!cadPlan}
            onFocus={toggleCollapse}
            onFixIssue={(issue) => {
              setComposerRequest({ id: Date.now(), text: tr(`请修复这个户型问题：${issue.msg}`, `Please fix this design issue: ${issue.msg}`) });
              if (isChatCollapsed) toggleCollapse();
            }}
            canRecognize={canRecognize}
            onUpload={uploadFloorplan}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/50 transition-colors w-1.5" />
      <ResizablePanel
        id="cad-chat"
        panelRef={chatPanelRef}
        defaultSize="32%"
        minSize="20%"
        maxSize="70%"
        collapsible
        collapsedSize="56px"
        onResize={(panelSize) => setIsChatCollapsed(panelSize.inPixels <= 80)}
        className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
      >
        <CadChatPanel
          key={`cad-chat-${cadResetTick}`}
          initialMessages={chatHistory}
          onMessagesChange={setChatHistory}
          attachments={attachments}
          workspaceId="cad"
          mode="text"
          collapsed={isChatCollapsed}
          title={t(uiLang, "workspace.cad.title")}
          inputPlaceholder={t(uiLang, "workspace.cad.placeholder")}
          onToggleCollapse={toggleCollapse}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onClearAttachments={() => setAttachments([])}
          onClearWorkspace={clearWorkspace}
          designSession={designSession}
          composerRequest={composerRequest}
          cadContext={{ plan: cadPlan }}
          onCodeAction={handleCadCodeAction}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
