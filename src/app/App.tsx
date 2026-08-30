import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { BrandIcon } from "@/app/BrandIcon";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { DEFAULT_WORKSPACE, WORKSPACES, isWorkspaceId, type WorkspaceId } from "@/app/workspaces";
import { SettingsDialog } from "@/components/SettingsDialog";
import { LandingPage } from "@/pages/LandingPage";
import { cn } from "@/shared/lib/utils";
import { t, useUiLanguage } from "@/shared/i18n";

const APP_VIEW_STORAGE_KEY = "CanvasAnvil-app-view-v1";
const APP_WORKSPACE_STORAGE_KEY = "CanvasAnvil-active-workspace-v1";

function readStoredWorkspace(): WorkspaceId {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  const saved = localStorage.getItem(APP_WORKSPACE_STORAGE_KEY);
  return isWorkspaceId(saved) ? saved : DEFAULT_WORKSPACE;
}

function WorkspaceFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  const uiLang = useUiLanguage();
  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(APP_VIEW_STORAGE_KEY) !== "workspace";
  });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(readStoredWorkspace);

  useEffect(() => {
    localStorage.setItem(APP_VIEW_STORAGE_KEY, showLanding ? "landing" : "workspace");
  }, [showLanding]);

  useEffect(() => {
    localStorage.setItem(APP_WORKSPACE_STORAGE_KEY, activeWorkspace);
  }, [activeWorkspace]);

  if (showLanding) {
    return (
      <LandingPage
        onStart={(workspace) => {
          if (workspace) setActiveWorkspace(workspace);
          setShowLanding(false);
        }}
      />
    );
  }

  const active = WORKSPACES.find((workspace) => workspace.id === activeWorkspace) ?? WORKSPACES[0];
  const ActiveWorkspace = active.Component;

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden font-sans">
      <Toaster position="top-center" richColors />

      <header className="h-16 border-b border-border/40 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 z-50 shadow-sm">
        <div
          className="flex items-center gap-2.5 font-semibold text-lg tracking-tight text-foreground/90 cursor-pointer justify-self-start"
          onClick={() => setShowLanding(true)}
        >
          <BrandIcon className="h-10 w-10" />
          <span>CanvasAnvil</span>
        </div>

        <div className="justify-self-center max-w-full overflow-x-auto">
          <div className="flex min-w-max items-center bg-muted/50 p-1 rounded-xl border border-border/50 shadow-inner">
            {WORKSPACES.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveWorkspace(id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out",
                  activeWorkspace === id
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 scale-100"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <Icon className="w-4 h-4" />
                {t(uiLang, labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="w-48 flex justify-end justify-self-end">
          <SettingsDialog />
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <ErrorBoundary>
          {/* Keyed so switching canvases unmounts the previous one rather than
              reusing its state under a different workspace. */}
          <Suspense fallback={<WorkspaceFallback />}>
            <ActiveWorkspace key={active.id} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
