import React, { useState } from "react";
import { Toaster } from "sonner";
import { FileCode, Hammer, Layers, Presentation, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/SettingsDialog";
import { LandingPage } from "@/pages/LandingPage";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { getUiLanguage, type UiLanguage } from "@/lib/ui-language";
import { useUiLanguage } from "@/lib/use-ui-language";
import { FlowWorkspaceShell } from "@/workspaces/flow/FlowWorkspaceShell";
import { CadWorkspaceShell } from "@/workspaces/cad/CadWorkspaceShell";
import { PptWorkspaceShell } from "@/workspaces/ppt/PptWorkspaceShell";

type WorkspaceType = "flow" | "cad" | "ppt";
const APP_VIEW_STORAGE_KEY = "unified-ai-workspace-app-view-v1";
const APP_WORKSPACE_STORAGE_KEY = "unified-ai-workspace-active-workspace-v1";

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
      const uiLang: UiLanguage = getUiLanguage();
      return (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-[720px] w-full rounded-xl border border-border/60 bg-background p-5">
            <div className="text-base font-medium mb-2">UI Error</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words mb-4">
              {String(this.state.error?.message || "Unknown error")}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" onClick={() => window.location.reload()}>
                {t(uiLang, "app.refresh")}
              </Button>
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                {t(uiLang, "app.tryContinue")}
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
  const uiLang = useUiLanguage();
  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(APP_VIEW_STORAGE_KEY);
    if (saved === "workspace") return false;
    if (saved === "landing") return true;
    return true;
  });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>(() => {
    if (typeof window === "undefined") return "flow";
    const saved = localStorage.getItem(APP_WORKSPACE_STORAGE_KEY);
    return saved === "cad" || saved === "ppt" || saved === "flow" ? saved : "flow";
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(APP_VIEW_STORAGE_KEY, showLanding ? "landing" : "workspace");
  }, [showLanding]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(APP_WORKSPACE_STORAGE_KEY, activeWorkspace);
  }, [activeWorkspace]);

  if (showLanding) return <LandingPage onStart={() => setShowLanding(false)} />;

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden font-sans">
      <Toaster position="top-center" richColors />

      <header className="h-14 border-b border-border/40 flex items-center px-6 justify-between bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 z-50 shadow-sm">
        <div
          className="flex items-center gap-2.5 font-semibold text-lg tracking-tight text-foreground/90 cursor-pointer"
          onClick={() => setShowLanding(true)}
        >
          <div className="relative p-1.5 bg-blue-600/10 rounded-lg shadow-sm ring-1 ring-blue-600/20">
            <Square className="w-5 h-5 text-blue-600" />
            <div className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5 ring-1 ring-blue-600/25">
              <Hammer className="w-3 h-3 text-blue-700" />
            </div>
          </div>
          <span>CanvasAnvil</span>
        </div>

        <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/50 shadow-inner">
          <button
            onClick={() => setActiveWorkspace("flow")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === "flow"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <Layers className="w-4 h-4" />
            {t(uiLang, "nav.flow")}
          </button>
          <button
            onClick={() => setActiveWorkspace("cad")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === "cad"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <FileCode className="w-4 h-4" />
            {t(uiLang, "nav.cad")}
          </button>
          <button
            onClick={() => setActiveWorkspace("ppt")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
              activeWorkspace === "ppt"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
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

      <div className="flex-1 overflow-hidden relative">
        <ErrorBoundary>
          {activeWorkspace === "flow" && <FlowWorkspaceShell />}
          {activeWorkspace === "cad" && <CadWorkspaceShell />}
          {activeWorkspace === "ppt" && <PptWorkspaceShell />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
