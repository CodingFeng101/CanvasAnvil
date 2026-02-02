import React, { useState, useEffect, useRef } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, type PanelImperativeHandle } from "@/components/ui/resizable";
import { ChatPanel } from '@/components/ChatPanel';
import { FlowchartWorkspace } from '@/components/workspaces/FlowchartWorkspace';
import { CadWorkspace } from '@/components/workspaces/CadWorkspace';
import { PptWorkspace } from '@/components/workspaces/PptWorkspace';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Layers, FileCode, Presentation, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DRAWIO_SYSTEM_PROMPT, CAD_SYSTEM_PROMPT, PPT_OUTLINE_EDIT_SYSTEM_PROMPT, PPT_SLIDES_EDIT_SYSTEM_PROMPT } from "@/lib/system-prompts";
import { generateImage, getAIConfig, type ChatMessage } from '@/lib/ai-client';
import { Toaster, toast } from 'sonner';
import { LandingPage } from '@/pages/LandingPage';
import { HistoryItem } from '@/components/history-dialog';
import { Button } from "@/components/ui/button";
import { getUiLanguage, setUiLanguage, type UiLanguage } from "@/lib/ui-language";
import { t } from "@/lib/i18n";

type WorkspaceType = 'flow' | 'cad' | 'ppt';

const HISTORY_STORAGE_KEY = 'unified-ai-workspace-history';
const CAD_WORKSPACE_STORAGE_KEY = 'unified-ai-workspace-cad-state-v1';
const FLOW_WORKSPACE_STORAGE_KEY = 'unified-ai-workspace-flow-state-v1';
const PPT_WORKSPACE_STORAGE_KEY = "unified-ai-workspace-ppt-state-v1";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI crashed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-[720px] w-full rounded-xl border border-border/60 bg-background p-5">
            <div className="text-base font-medium mb-2">页面发生错误</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words mb-4">
              {String(this.state.error?.message || "Unknown error")}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" onClick={() => window.location.reload()}>
                {t(getUiLanguage(), "app.refresh")}
              </Button>
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                {t(getUiLanguage(), "app.tryContinue")}
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function App() {
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());

  useEffect(() => {
    setUiLanguage(uiLang);
  }, [uiLang]);

  useEffect(() => {
    const onLang = () => setUiLang(getUiLanguage());
    window.addEventListener("ui-language-changed", onLang as any);
    return () => window.removeEventListener("ui-language-changed", onLang as any);
  }, []);

  const initialFlowState = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(FLOW_WORKSPACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as any;
    } catch {
      return null;
    }
  })();

  const initialCadState = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(CAD_WORKSPACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as any;
    } catch {
      return null;
    }
  })();

  const [showLanding, setShowLanding] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>('flow');
  const [attachments, setAttachments] = useState<{ id: string; type: 'xml' | 'python' | 'json'; content: string; name: string }[]>([]);
  
  // Workspace specific states
  const [generatedXml, setGeneratedXml] = useState<string | undefined>(() => {
    const v = initialFlowState?.generatedXml;
    return typeof v === "string" ? v : undefined;
  });
  const [cad2dSvg, setCad2dSvg] = useState<string | undefined>(() => {
    const v = initialCadState?.cad2dSvg;
    return typeof v === "string" ? v : undefined;
  });
  const [cadPlan, setCadPlan] = useState<any>(() => (initialCadState?.cadPlan ?? null));
  const [cadImages, setCadImages] = useState<{ title: string; url: string }[]>(() => {
    const v = initialCadState?.cadImages;
    return Array.isArray(v)
      ? v
          .filter((x: any) => x && typeof x.title === "string" && typeof x.url === "string")
          .map((x: any) => ({ title: x.title, url: x.url }))
      : [];
  });
  const [cadImagesLoading, setCadImagesLoading] = useState(false);
  const [cadBom, setCadBom] = useState<{ columns: string[]; rows: any[] } | null>(() => {
    const v = initialCadState?.cadBom;
    if (!v || typeof v !== "object") return null;
    const columns = Array.isArray((v as any).columns) ? (v as any).columns.filter((c: any) => typeof c === "string") : [];
    const rows = Array.isArray((v as any).rows) ? (v as any).rows : [];
    return { columns, rows };
  });
  const [cadFocusPanel, setCadFocusPanel] = useState<"2d" | "renders" | "bom" | null>(() => {
    const v = initialCadState?.cadFocusPanel;
    return v === "2d" || v === "renders" || v === "bom" ? v : null;
  });
  const [pptIncomingEdit, setPptIncomingEdit] = useState<{ id: string; payload: string } | null>(null);
  const [pptDraftSlides, setPptDraftSlides] = useState<Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>>([]);
  const [pptResetTick, setPptResetTick] = useState(0);
  const cadImageObjectUrlsRef = useRef<string[]>([]);

  // Chat History Management (Per Workspace)
  const [chatHistories, setChatHistories] = useState<Record<WorkspaceType, ChatMessage[]>>({
    flow: [],
    cad: [],
    ppt: []
  });

  // Version History Management (Per Workspace)
  const [versionHistories, setVersionHistories] = useState<Record<WorkspaceType, HistoryItem[]>>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
          if (saved) {
              try {
                  return JSON.parse(saved);
              } catch (e) {
                  console.error("Failed to parse history", e);
              }
          }
      }
      return { flow: [], cad: [], ppt: [] };
  });

  // Persist history
  useEffect(() => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(versionHistories));
  }, [versionHistories]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        FLOW_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          generatedXml: typeof generatedXml === "string" ? generatedXml : null,
          updatedAt: Date.now(),
        })
      );
    } catch {
    }
  }, [generatedXml]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        CAD_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          cad2dSvg: typeof cad2dSvg === "string" ? cad2dSvg : null,
          cadPlan: cadPlan ?? null,
          cadImages,
          cadBom,
          cadFocusPanel,
          updatedAt: Date.now(),
        })
      );
    } catch {
    }
  }, [cad2dSvg, cadPlan, cadImages, cadBom, cadFocusPanel]);

  useEffect(() => {
    const nextObjectUrls = cadImages
      .map((x) => x?.url)
      .filter((u): u is string => typeof u === "string" && u.startsWith("blob:"));
    const prevObjectUrls = cadImageObjectUrlsRef.current;
    for (const u of prevObjectUrls) {
      if (!nextObjectUrls.includes(u)) {
        try {
          URL.revokeObjectURL(u);
        } catch {
        }
      }
    }
    cadImageObjectUrlsRef.current = nextObjectUrls;
  }, [cadImages]);

  // Layout State
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [pptReady, setPptReady] = useState(false);
  const [pptStage, setPptStage] = useState<"outline" | "slides">("outline");
  const pptChatLocked = activeWorkspace === "ppt" && !pptReady;

  useEffect(() => {
    if (pptChatLocked && isChatCollapsed) {
      setIsChatCollapsed(false);
    }
  }, [pptChatLocked, isChatCollapsed]);

  useEffect(() => {
    if (activeWorkspace === "ppt" && !pptChatLocked) {
      setIsChatCollapsed(false);
    }
  }, [activeWorkspace, pptChatLocked]);

  const handleToggleCollapse = () => {
      if (pptChatLocked) return;
      const panel = chatPanelRef.current;
      if (panel) {
          try {
              if (panel.isCollapsed?.() || isChatCollapsed) {
                  panel.expand();
                  setIsChatCollapsed(false);
              } else {
                  panel.collapse();
                  setIsChatCollapsed(true);
              }
          } catch (e) {
              console.error("Failed to toggle chat panel", e);
              setIsChatCollapsed(false);
          }
      }
  };

  const chatUi = (() => {
    if (activeWorkspace === "flow") {
      return {
        title: t(uiLang, "workspace.flow.title"),
        placeholder: t(uiLang, "workspace.flow.placeholder")
      };
    }
    if (activeWorkspace === "cad") {
      return {
        title: t(uiLang, "workspace.cad.title"),
        placeholder: t(uiLang, "workspace.cad.placeholder")
      };
    }
    if (activeWorkspace === "ppt") {
      return {
        title: t(uiLang, "workspace.ppt.title"),
        placeholder: t(uiLang, "workspace.ppt.placeholder")
      };
    }
    return { title: t(uiLang, "workspace.default.title"), placeholder: undefined as any };
  })();

  const handleAddToChat = (code: string, type: 'xml' | 'python' | 'json' = 'xml', name: string = 'attachment') => {
    if (activeWorkspace === "ppt" && type === "json") {
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
          return [...next, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, slideId, title, json, kind, imageUrl: imageUrl || undefined }];
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
            { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, slideId: m[1], title: "", json: String(code || ""), kind: "outline" }
          ]);
          return;
        }
      }
    }

    setAttachments(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        content: code,
        name
      }
    ]);
  };

  const getSystemPrompt = (type: WorkspaceType) => {
    switch (type) {
      case 'flow': return DRAWIO_SYSTEM_PROMPT;
      case 'cad': return CAD_SYSTEM_PROMPT;
      case 'ppt': {
        return pptStage === "slides" ? PPT_SLIDES_EDIT_SYSTEM_PROMPT : PPT_OUTLINE_EDIT_SYSTEM_PROMPT;
      }
      default: return DRAWIO_SYSTEM_PROMPT;
    }
  };

  const handleMessagesChange = React.useCallback((msgs: ChatMessage[]) => {
    setChatHistories(prev => {
        if (prev[activeWorkspace] === msgs) return prev;
        return { ...prev, [activeWorkspace]: msgs };
    });
  }, [activeWorkspace]);

  const getChatModel = (type: WorkspaceType) => {
    return undefined;
  };

  const addToHistory = (content: string, type: HistoryItem["type"]) => {
      const newItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          content,
          type
      };
      setVersionHistories(prev => ({
          ...prev,
          [activeWorkspace]: [...prev[activeWorkspace], newItem]
      }));
  };

  const handleRestore = (workspace: WorkspaceType, item: HistoryItem) => {
      if (workspace === 'flow') {
          if (item.type === 'xml') setGeneratedXml(item.content);
          return;
      }

      if (workspace === 'ppt') {
          if (item.type === 'json') setPptIncomingEdit({ id: `${Date.now()}`, payload: item.content });
          return;
      }

      if (workspace === 'cad') {
          if (item.type === 'svg') {
              setCad2dSvg(item.content);
              return;
          }
          if (item.type === 'json') {
              try {
                  const parsed = JSON.parse(item.content);
                  if (parsed?.type === "cad_plan") setCadPlan(parsed);
                  if (parsed?.type === "cad_bom") setCadBom({ columns: parsed.columns || [], rows: parsed.rows || [] });
                  if (parsed?.type === "cad_images") {
                      const next = Array.isArray(parsed.prompts)
                          ? parsed.prompts
                              .filter((p: any) => p && typeof p.title === "string" && typeof p.url === "string")
                              .map((p: any) => ({ title: p.title, url: p.url }))
                          : [];
                      if (next.length > 0) setCadImages(next);
                  }
              } catch {
              }
          }
      }
  };

  const applyStringEdits = (source: string, edits: { search: string; replace: string }[]) => {
      if (!Array.isArray(edits) || edits.length === 0) {
          throw new Error("Empty patch edits");
      }

      let out = source;

      for (const e of edits) {
          if (!e || typeof e.search !== "string" || typeof e.replace !== "string") {
              throw new Error("Invalid patch edit item");
          }
          const search = e.search;
          const replace = e.replace;
          if (!search) {
              throw new Error("Empty search pattern in patch edit");
          }
          if (!out.includes(search)) {
              throw new Error("Search pattern not found in current content");
          }
          out = out.replace(search, replace);
      }

      return out;
  };

  const validateDrawioXml = (xml: string): string | null => {
    const text = String(xml || "").trim();
    if (!text) return "XML 为空";

    let doc: Document;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(text, "text/xml");
    } catch {
      return "XML 解析失败";
    }

    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      return "XML 不合法：包含语法错误或未转义字符（例如 < > & \"）";
    }

    const rootEl = doc.querySelector("mxGraphModel > root");
    if (!rootEl) {
      return "XML 结构不正确：缺少 <mxGraphModel><root>...</root></mxGraphModel>";
    }

    const allCells = Array.from(rootEl.querySelectorAll("mxCell"));
    if (allCells.length === 0) {
      return "XML 结构不正确：<root> 下没有 mxCell";
    }

    const notDirectChildren = allCells
      .filter((c) => c.parentElement !== rootEl)
      .map((c) => c.getAttribute("id") || "unknown");
    if (notDirectChildren.length > 0) {
      return `XML 结构不正确：所有 mxCell 必须是 <root> 的直接子元素（例如 ${notDirectChildren.slice(0, 3).join(", ")}）`;
    }

    const nestedCells = allCells
      .filter((c) => c.parentElement?.tagName === "mxCell")
      .map((c) => c.getAttribute("id") || "unknown");
    if (nestedCells.length > 0) {
      return `XML 结构不正确：mxCell 不能嵌套（例如 ${nestedCells.slice(0, 3).join(", ")}）`;
    }

    const ids = new Set<string>();
    const duplicateIds: string[] = [];
    const orphanCells: string[] = [];
    const parentRefs: Array<{ id: string; parent: string }> = [];
    const edges: Array<{ id: string; source: string | null; target: string | null }> = [];

    for (const cell of allCells) {
      const id = cell.getAttribute("id") || "";
      const parent = cell.getAttribute("parent");
      const isEdge = cell.getAttribute("edge") === "1";

      if (!id) return "XML 结构不正确：mxCell 缺少必需的 id 属性";
      if (ids.has(id)) duplicateIds.push(id);
      else ids.add(id);

      if (id !== "0") {
        if (!parent) orphanCells.push(id);
        else parentRefs.push({ id, parent });
      }

      if (isEdge) {
        edges.push({
          id,
          source: cell.getAttribute("source"),
          target: cell.getAttribute("target"),
        });
      }
    }

    if (duplicateIds.length > 0) {
      return `XML 结构不正确：mxCell id 重复（例如 ${duplicateIds.slice(0, 3).join(", ")}）`;
    }
    if (orphanCells.length > 0) {
      return `XML 结构不正确：缺少 parent 属性（例如 ${orphanCells.slice(0, 3).join(", ")}）`;
    }

    const cell0 = allCells.find((c) => c.getAttribute("id") === "0") || null;
    const cell1 = allCells.find((c) => c.getAttribute("id") === "1") || null;
    if (!cell0 || !cell1) {
      return 'XML 结构不正确：必须包含 <mxCell id="0"/> 与 <mxCell id="1" parent="0"/>';
    }
    if (cell0.getAttribute("parent")) {
      return 'XML 结构不正确：<mxCell id="0"/> 不应包含 parent 属性';
    }
    if (cell1.getAttribute("parent") !== "0") {
      return 'XML 结构不正确：<mxCell id="1" parent="0"/> 的 parent 必须为 "0"';
    }

    const badParents = parentRefs.filter((p) => !ids.has(p.parent));
    if (badParents.length > 0) {
      const details = badParents
        .slice(0, 3)
        .map((p) => `${p.id}(parent:${p.parent})`)
        .join(", ");
      return `XML 结构不正确：parent 引用不存在（例如 ${details}）`;
    }

    const invalidConnections: string[] = [];
    for (const edge of edges) {
      if (edge.source && !ids.has(edge.source)) {
        invalidConnections.push(`${edge.id}(source:${edge.source})`);
      }
      if (edge.target && !ids.has(edge.target)) {
        invalidConnections.push(`${edge.id}(target:${edge.target})`);
      }
    }
    if (invalidConnections.length > 0) {
      return `XML 结构不正确：连线 source/target 引用不存在（例如 ${invalidConnections.slice(0, 3).join(", ")}）`;
    }

    return null;
  };

  if (showLanding) {
      return <LandingPage onStart={() => setShowLanding(false)} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden font-sans">
      <Toaster position="top-center" richColors />
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-border/40 flex items-center px-6 justify-between bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 z-50 shadow-sm">
        <div className="flex items-center gap-2.5 font-semibold text-lg tracking-tight text-foreground/90 cursor-pointer" onClick={() => setShowLanding(true)}>
          <div className="p-1.5 bg-blue-600/10 rounded-lg shadow-sm ring-1 ring-blue-600/20">
            <Layout className="w-5 h-5 text-blue-600" />
          </div>
          <span>Unified AI Workspace</span>
        </div>
        
        <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/50 shadow-inner">
          <button
            onClick={() => setActiveWorkspace('flow')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === 'flow' 
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Layers className="w-4 h-4" />
            {t(uiLang, "nav.flow")}
          </button>
          <button
            onClick={() => setActiveWorkspace('cad')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === 'cad' 
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <FileCode className="w-4 h-4" />
            {t(uiLang, "nav.cad")}
          </button>
          <button
            onClick={() => setActiveWorkspace('ppt')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === 'ppt' 
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Presentation className="w-4 h-4" />
            {t(uiLang, "nav.ppt")}
          </button>
        </div>

        <div className="w-48 flex justify-end">
          <SettingsDialog />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <ErrorBoundary>
          <ResizablePanelGroup orientation="horizontal" className="h-full" style={{ height: '100%' }}>
          <ResizablePanel
            defaultSize={pptChatLocked ? "100%" : "68%"}
            minSize="30%"
            className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
          >
            <div className="h-full w-full relative bg-muted/20">
              {activeWorkspace === 'flow' && (
                <FlowchartWorkspace
                  initialXml={generatedXml}
                  onXmlChange={setGeneratedXml}
                  onAddToChat={(code) => handleAddToChat(code, 'xml', 'diagram.xml')}
                />
              )}
              {activeWorkspace === 'cad' && (
                <CadWorkspace
                  svg2d={cad2dSvg}
                  plan={cadPlan}
                  images={cadImages}
                  imagesLoading={cadImagesLoading}
                  bom={cadBom}
                  focusPanel={cadFocusPanel}
                  onAddToChat={(payload) => {
                    const trimmed = String(payload || "").trim();
                    if (!trimmed) return;
                    if (trimmed.startsWith("<svg")) {
                      handleAddToChat(payload, 'xml', 'plan.svg');
                      return;
                    }
                    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                      handleAddToChat(payload, 'json', 'cad.json');
                      return;
                    }
                    handleAddToChat(payload, 'python', 'script.py');
                  }}
                />
              )}
              {activeWorkspace === 'ppt' && (
                <PptWorkspace
                  key={`ppt-${pptResetTick}`}
                  onAddToChat={(code, name) => handleAddToChat(code, 'json', name)}
                  onPptReadyChange={setPptReady}
                  onPptStageChange={setPptStage}
                  incomingEdit={pptIncomingEdit}
                  onIncomingEditHandled={() => setPptIncomingEdit(null)}
                  onResetWorkspace={() => {
                    setPptIncomingEdit(null);
                    setPptDraftSlides([]);
                    setPptReady(false);
                    setPptStage("outline");
                    try { localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY); } catch {}
                    setPptResetTick((x) => x + 1);
                  }}
                />
              )}
            </div>
          </ResizablePanel>

          {!pptChatLocked && (
            <>
              <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/50 transition-colors w-1.5" />

              <ResizablePanel
                id="chat"
                panelRef={chatPanelRef}
                defaultSize="32%"
                minSize="20%"
                maxSize="70%"
                collapsible={!pptChatLocked}
                collapsedSize="56px"
                onResize={(panelSize) => setIsChatCollapsed(panelSize.inPixels <= 80)}
                className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
              >
                <ChatPanel
                  key={activeWorkspace}
                  systemPrompt={getSystemPrompt(activeWorkspace)}
                  initialMessages={chatHistories[activeWorkspace]}
                  onMessagesChange={handleMessagesChange}
                  attachments={attachments}
                  chatModel={getChatModel(activeWorkspace)}
                  workspaceId={activeWorkspace}
                  mode={activeWorkspace === 'ppt' ? 'ppt_image' : 'text'}
                  hideHistoryButton={activeWorkspace === 'ppt'}
                  collapsed={isChatCollapsed}
                  collapseLocked={pptChatLocked}
                  title={chatUi.title}
                  inputPlaceholder={chatUi.placeholder}
                  onToggleCollapse={handleToggleCollapse}
                  onRemoveAttachment={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                  onClearAttachments={() => setAttachments([])}
                  pptDraftSlides={activeWorkspace === "ppt" ? pptDraftSlides : []}
                  onRemovePptDraftSlide={(id) => setPptDraftSlides(prev => prev.filter(s => s.id !== id))}
                  onClearPptDraftSlides={() => setPptDraftSlides([])}
                  onClearWorkspace={() => {
                    if (activeWorkspace === "flow") {
                      setGeneratedXml(undefined);
                      try { localStorage.removeItem(FLOW_WORKSPACE_STORAGE_KEY); } catch {}
                    }
                    if (activeWorkspace === "cad") {
                      setCad2dSvg(undefined);
                      setCadPlan(null);
                      setCadImages([]);
                      setCadImagesLoading(false);
                      setCadBom(null);
                      setCadFocusPanel(null);
                      try { localStorage.removeItem(CAD_WORKSPACE_STORAGE_KEY); } catch {}
                      try { localStorage.removeItem("unified-ai-workspace-cad-renders-v1"); } catch {}
                    }
                    if (activeWorkspace === "ppt") {
                      setPptIncomingEdit(null);
                      setPptDraftSlides([]);
                      setPptReady(false);
                      setPptStage("outline");
                      try { localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY); } catch {}
                      setPptResetTick((x) => x + 1);
                    }
                    setVersionHistories((prev) => ({ ...prev, [activeWorkspace]: [] }));
                  }}
                  history={versionHistories[activeWorkspace]}
                  onRestore={(item) => handleRestore(activeWorkspace, item)}
                  onClearVersionHistory={() => {
                    setVersionHistories(prev => ({ ...prev, [activeWorkspace]: [] }));
                  }}
                  cadContext={activeWorkspace === "cad" ? { plan: cadPlan, svg2d: cad2dSvg } : undefined}
                  flowContext={activeWorkspace === "flow" ? { xml: generatedXml } : undefined}
                  onCodeAction={(code, type) => {
                    if (type === 'flow') {
                      const raw = String(code || "");
                      const trimmed = raw.trim();
                      if (!trimmed) return { ok: false, retry: false, error: "Empty input" };

                      if (trimmed.startsWith("{")) {
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
                              }
                            }
                            return null;
                          }
                        };

                        try {
                          const parsed = tryParseJson(trimmed);
                          if (!parsed) return;
                          if (parsed?.type === "flow_patch" && parsed?.target === "drawio_xml") {
                            const current = generatedXml || "";
                            if (parsed?.mode === "replace" && typeof parsed.full === "string") {
                              const err = validateDrawioXml(parsed.full);
                              if (err) {
                                toast.error(`XML 校验失败：${err}。请让 AI 修复后重试，或重新生成 mode=replace。`);
                                return { ok: false, retry: true, error: err };
                              }
                              setGeneratedXml(parsed.full);
                              addToHistory(parsed.full, "xml");
                              return { ok: true };
                            }
                            if (parsed?.mode === "patch" && Array.isArray(parsed.edits)) {
                              try {
                                const next = applyStringEdits(current, parsed.edits);
                                const err = validateDrawioXml(next);
                                if (err) {
                                  toast.error(`XML 校验失败：${err}。请让 AI 改用 mode=replace，或修复后重试。`);
                                  return { ok: false, retry: true, error: err };
                                }
                                setGeneratedXml(next);
                                addToHistory(next, "xml");
                                return { ok: true };
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : String(e);
                                toast.error(`补丁应用失败：${msg}。请让 AI 改用 mode=replace，或从当前 XML 精确复制 search 片段。`);
                                return { ok: false, retry: true, error: msg };
                              }
                            }
                          }
                          if (typeof parsed?.type === "string") {
                            return;
                          }
                        } catch {
                          return;
                        }
                      }
                      const err = validateDrawioXml(raw);
                      if (err) {
                        toast.error(`XML 校验失败：${err}。请让 AI 修复后重试。`);
                        return { ok: false, retry: true, error: err };
                      }
                      setGeneratedXml(raw);
                      addToHistory(raw, 'xml');
                      return { ok: true };
                    } else if (type === 'cad') {
                      const raw = String(code || "");
                      const trimmed = raw.trim();
                      if (!trimmed) return;

                      if (trimmed.startsWith("<svg")) {
                        setCad2dSvg(raw);
                        setCadFocusPanel("2d");
                        addToHistory(raw, 'svg');
                        return;
                      }

                      if (trimmed.startsWith("{")) {
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
                              }
                            }
                            return null;
                          }
                        };

                        try {
                          const parsed = tryParseJson(trimmed);
                          if (!parsed) return;
                          if (parsed?.type === "cad_plan") {
                            setCadPlan(parsed);
                            addToHistory(JSON.stringify(parsed), 'json');
                            return;
                          }
                          if (parsed?.type === "cad_bom") {
                            const fallbackColumns = ["品类", "名称", "规格", "数量", "单位", "备注"];
                            const columns = Array.isArray(parsed.columns) && parsed.columns.length > 0
                              ? parsed.columns.map((x: any) => String(x))
                              : fallbackColumns;
                            const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
                            setCadBom({ columns, rows });
                            setCadFocusPanel("bom");
                            addToHistory(JSON.stringify({ type: "cad_bom", columns, rows }), 'json');
                            return;
                          }
                          if (parsed?.type === "cad_images") {
                            const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
                            const items = prompts
                              .map((p: any) => ({
                                title: typeof p?.title === "string" ? p.title : "视角",
                                prompt: typeof p?.prompt === "string" ? p.prompt : ""
                              }))
                              .filter((p: any) => p.prompt);

                            (async () => {
                              setCadFocusPanel("renders");
                              setCadImagesLoading(true);
                              setCadImages([]);
                              try {
                                const results: { title: string; url: string; prompt: string }[] = [];

                                const presetRenderPrompt = [
                                  "orthographic 2D technical construction drawing sheet, CAD-like linework",
                                  "black and white printing, clean readable annotations, clear dimension text",
                                  "include drawing border/frame and bottom-right title block",
                                  "no perspective, no 3D, no photorealism",
                                  "no watermark, no logo, no decorative typography"
                                ].join(", ");

                                const planText = cadPlan ? JSON.stringify(cadPlan) : "";
                                const svgText = typeof cad2dSvg === "string" ? cad2dSvg : "";

                                const maxPlanChars = 6000;
                                const maxSvgChars = 6000;

                                const planShort = planText.length > maxPlanChars ? planText.slice(0, maxPlanChars) : planText;
                                const svgShort = svgText.length > maxSvgChars ? svgText.slice(0, maxSvgChars) : svgText;

                                const list = items.slice(0, 7);
                                const batchSize = 3;
                                for (let i = 0; i < list.length; i += batchSize) {
                                  const batch = list.slice(i, i + batchSize);
                                  const settled = await Promise.allSettled(
                                    batch.map(async (p) => {
                                      const fullPrompt = [
                                        presetRenderPrompt,
                                        "",
                                        "Plan:",
                                        planShort,
                                        "",
                                        "2D SVG:",
                                        svgShort,
                                        "",
                                        "Sheet:",
                                        p.prompt
                                      ].filter(Boolean).join("\n");
                                      const url = await generateImage({ prompt: fullPrompt });
                                      return url ? { title: p.title, url, prompt: p.prompt } : null;
                                    })
                                  );
                                  for (const s of settled) {
                                    if (s.status === "fulfilled" && s.value?.url) results.push(s.value);
                                  }
                                }

                                const final = results.map((r) => ({ title: r.title, url: r.url }));
                                setCadImages(final);
                                addToHistory(JSON.stringify({ type: "cad_images", prompts: results }), 'json');
                              } catch (e) {
                                console.error("CAD image generation failed", e);
                                setCadImages([]);
                              } finally {
                                setCadImagesLoading(false);
                                setCadFocusPanel("renders");
                              }
                            })();
                            return;
                          }
                          if (parsed?.type === "cad_patch") {
                            const target = parsed?.target;
                            const mode = parsed?.mode;
                            if (target === "2d_svg") {
                              const current = cad2dSvg || "";
                              if (mode === "replace" && typeof parsed.full === "string") {
                                setCad2dSvg(parsed.full);
                                addToHistory(parsed.full, 'svg');
                                return;
                              }
                              if (mode === "patch" && Array.isArray(parsed.edits)) {
                                try {
                                  const next = applyStringEdits(current, parsed.edits);
                                  setCad2dSvg(next);
                                  addToHistory(next, 'svg');
                                } catch (e) {
                                  const msg = e instanceof Error ? e.message : String(e);
                                  toast.error(`补丁应用失败：${msg}。请让 AI 改用 mode=replace，或从当前内容精确复制 search 片段。`);
                                }
                                return;
                              }
                            }
                            return;
                          }

                          if (typeof parsed?.type === "string") {
                            return;
                          }
                        } catch (e) {
                          console.error("Failed to parse CAD JSON", e);
                        }
                      }
                    } else if (type === 'ppt') {
                      try {
                        JSON.parse(code);
                        setPptIncomingEdit({ id: `${Date.now()}`, payload: code });
                        addToHistory(code, 'json');
                      } catch (e) {
                        console.error("Failed to parse PPT JSON", e);
                      }
                    }
                    return { ok: true };
                  }}
                />
              </ResizablePanel>
            </>
          )}
          </ResizablePanelGroup>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
