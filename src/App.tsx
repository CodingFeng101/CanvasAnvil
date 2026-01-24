import React, { useState, useEffect, useRef } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, type PanelImperativeHandle } from "@/components/ui/resizable";
import { ChatPanel } from '@/components/ChatPanel';
import { FlowchartWorkspace } from '@/components/workspaces/FlowchartWorkspace';
import { CadWorkspace } from '@/components/workspaces/CadWorkspace';
import { PptWorkspace } from '@/components/workspaces/PptWorkspace';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Layers, FileCode, Presentation, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DRAWIO_SYSTEM_PROMPT, CAD_SYSTEM_PROMPT, PPT_SYSTEM_PROMPT } from '@/lib/system-prompts';
import { getAIConfig, type ChatMessage } from '@/lib/ai-client';
import { Toaster } from 'sonner';
import { LandingPage } from '@/pages/LandingPage';
import { HistoryItem } from '@/components/history-dialog';

type WorkspaceType = 'flow' | 'cad' | 'ppt';

const HISTORY_STORAGE_KEY = 'unified-ai-workspace-history';

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>('flow');
  const [attachments, setAttachments] = useState<{ id: string; type: 'xml' | 'python' | 'json'; content: string; name: string }[]>([]);
  
  // Workspace specific states
  const [generatedXml, setGeneratedXml] = useState<string | undefined>(undefined);
  const [generatedCadCode, setGeneratedCadCode] = useState<string | undefined>(undefined);
  const [pptIncomingEdit, setPptIncomingEdit] = useState<{ id: string; payload: string } | null>(null);

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

  // Layout State
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [pptReady, setPptReady] = useState(false);
  const pptChatLocked = activeWorkspace === "ppt" && !pptReady;

  useEffect(() => {
    if (pptChatLocked && isChatCollapsed) {
      setIsChatCollapsed(false);
      chatPanelRef.current?.expand();
    }
  }, [pptChatLocked, isChatCollapsed]);

  useEffect(() => {
    if (activeWorkspace === "ppt" && !pptChatLocked) {
      setIsChatCollapsed(false);
      chatPanelRef.current?.expand();
    }
  }, [activeWorkspace, pptChatLocked]);

  const handleToggleCollapse = () => {
      if (pptChatLocked) return;
      const panel = chatPanelRef.current;
      if (panel) {
          if (panel.isCollapsed?.() || isChatCollapsed) {
              panel.expand();
              setIsChatCollapsed(false);
          } else {
              panel.collapse();
              setIsChatCollapsed(true);
          }
      }
  };

  const chatUi = (() => {
    if (activeWorkspace === "flow") {
      return {
        title: "流程图助手",
        placeholder: "描述流程…"
      };
    }
    if (activeWorkspace === "cad") {
      return {
        title: "CAD 助手",
        placeholder: "描述 CAD…"
      };
    }
    if (activeWorkspace === "ppt") {
      return {
        title: "PPT 助手",
        placeholder: "描述 PPT…"
      };
    }
    return { title: "AI 助手", placeholder: undefined as any };
  })();

  const handleAddToChat = (code: string, type: 'xml' | 'python' | 'json' = 'xml', name: string = 'attachment') => {
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
      case 'ppt': return PPT_SYSTEM_PROMPT;
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

  const addToHistory = (content: string, type: 'xml' | 'python' | 'json') => {
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

  const handleRestore = (item: HistoryItem) => {
      if (item.type === 'xml') setGeneratedXml(item.content);
      if (item.type === 'python') setGeneratedCadCode(item.content);
      if (item.type === 'json') setPptIncomingEdit({ id: `${Date.now()}`, payload: item.content });
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
            流程图
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
            CAD设计
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
            PPT演示
          </button>
        </div>

        <div className="w-48 flex justify-end">
          <SettingsDialog />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <ResizablePanelGroup orientation="horizontal" className="h-full" style={{ height: '100%' }}>
          <ResizablePanel defaultSize={pptChatLocked ? "100%" : "68%"} minSize="30%">
            <div className="h-full w-full relative bg-muted/20">
              {activeWorkspace === 'flow' && (
                <FlowchartWorkspace
                  initialXml={generatedXml}
                  onAddToChat={(code) => handleAddToChat(code, 'xml', 'diagram.xml')}
                />
              )}
              {activeWorkspace === 'cad' && (
                <CadWorkspace
                  code={generatedCadCode}
                  onAddToChat={(code) => handleAddToChat(code, 'python', 'script.py')}
                />
              )}
              {activeWorkspace === 'ppt' && (
                <PptWorkspace
                  onAddToChat={(code, name) => handleAddToChat(code, 'json', name)}
                  onPptReadyChange={setPptReady}
                  incomingEdit={pptIncomingEdit}
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
                onResize={(panelSize) => {
                  setIsChatCollapsed(panelSize.inPixels <= 80);
                }}
                className={cn("transition-all duration-300")}
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
                  history={versionHistories[activeWorkspace]}
                  onRestore={handleRestore}
                  onCodeAction={(code, type) => {
                    if (type === 'flow') {
                      setGeneratedXml(code);
                      addToHistory(code, 'xml');
                    } else if (type === 'cad') {
                      setGeneratedCadCode(code);
                      addToHistory(code, 'python');
                    } else if (type === 'ppt') {
                      try {
                        JSON.parse(code);
                        setPptIncomingEdit({ id: `${Date.now()}`, payload: code });
                        addToHistory(code, 'json');
                      } catch (e) {
                        console.error("Failed to parse PPT JSON", e);
                      }
                    }
                  }}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default App;
