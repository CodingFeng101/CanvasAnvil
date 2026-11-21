import { Suspense, lazy, useEffect, useState } from "react";
import { getPreferences, usePreferences } from "@/shared/preferences";
import { MotionConfig, motion } from "motion/react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/app/AppSidebar";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { DEFAULT_WORKSPACE, WORKSPACES, isWorkspaceId, type WorkspaceId } from "@/app/workspaces";
import { WorkHost, WorksProvider } from "@/app/works/works-provider";
import { LandingPage } from "@/pages/LandingPage";
import { MiniPlayer } from "@/app/MiniPlayer";
import { readDocsHash } from "@/pages/docs/route";
import { openSettings } from "@/shared/settings-bus";
import { cn } from "@/shared/lib/utils";
import { TWEEN } from "@/shared/motion";
import { applyTheme } from "@/shared/theme";
import { setStatsCanvas, startUsageStats } from "@/shared/usage-stats";

// Its own chunk: markdown rendering and every page's text load only when the docs open.
const DocsPage = lazy(() => import("@/pages/docs/DocsPage"));

// Settings → Usage counts tokens and images from here on.
startUsageStats();

const APP_VIEW_STORAGE_KEY = "CanvasAnvil-app-view-v1";
const APP_WORKSPACE_STORAGE_KEY = "CanvasAnvil-active-workspace-v1";
/** Older links to the tutorials page; they now open Settings → Videos. */
const TUTORIALS_HASH = "#tutorials";

const isTutorialsHash = () => typeof window !== "undefined" && window.location.hash === TUTORIALS_HASH;

/** Drop the hash without adding a history entry. */
function clearHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function readStoredWorkspace(): WorkspaceId {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  const saved = localStorage.getItem(APP_WORKSPACE_STORAGE_KEY);
  // The diagram workspace's id was "flow" before the rename.
  if (saved === "flow") return "diagram";
  return isWorkspaceId(saved) ? saved : DEFAULT_WORKSPACE;
}

/** A shimmering block for the loading skeleton. */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-muted/60", className)}>
      <div className="absolute inset-0 animate-sheen bg-[linear-gradient(110deg,transparent_30%,hsl(var(--card)/0.6)_50%,transparent_70%)] bg-[length:200%_100%]" />
    </div>
  );
}

/**
 * Shown while a workspace's chunk loads: the shape of the screen about to
 * appear -- chat on the left, the canvas sheet on the right -- rather than a
 * lone spinner, so the switch reads as the layout filling in.
 */
function WorkspaceFallback() {
  return (
    <div className="flex h-full w-full animate-fade-in" aria-busy="true">
      <div className="flex flex-[32] flex-col px-5 py-4">
        <SkeletonBlock className="h-4 w-28 rounded-md" />
        <div className="flex flex-1 flex-col justify-center gap-3">
          <SkeletonBlock className="h-7 w-2/3 rounded-md" />
          <SkeletonBlock className="h-4 w-full rounded-md" />
          <SkeletonBlock className="mt-4 h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
        <SkeletonBlock className="h-[104px] w-full rounded-2xl" />
      </div>
      <div className="flex-[68] py-2 pr-2">
        <SkeletonBlock className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function App() {
  const prefs = usePreferences();
  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window === "undefined") return true;
    const startOn = getPreferences().startOn;
    if (startOn !== "last") return startOn === "home";
    return localStorage.getItem(APP_VIEW_STORAGE_KEY) !== "workspace";
  });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(readStoredWorkspace);
  // The docs sit over whichever view was open, at #/docs/<page>.
  const [docsSlug, setDocsSlug] = useState(readDocsHash);
  useEffect(() => {
    const onHash = () => setDocsSlug(readDocsHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // The videos live in Settings → Videos: the landing page's link (and an old
  // #tutorials link) opens the workspace with that section showing.
  const openTutorials = () => {
    setShowLanding(false);
    openSettings("tutorials");
  };

  useEffect(() => {
    if (!isTutorialsHash()) return;
    clearHash();
    openTutorials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The inline script in index.html sets the class before first paint; this
  // keeps it correct across a hot reload that drops the class.
  useEffect(() => {
    applyTheme();
  }, []);

  useEffect(() => {
    localStorage.setItem(APP_VIEW_STORAGE_KEY, showLanding ? "landing" : "workspace");
  }, [showLanding]);

  useEffect(() => {
    localStorage.setItem(APP_WORKSPACE_STORAGE_KEY, activeWorkspace);
    setStatsCanvas(activeWorkspace);
  }, [activeWorkspace]);

  if (docsSlug !== null) {
    return (
      <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <DocsPage slug={docsSlug} />
        </Suspense>
        <MiniPlayer />
      </MotionConfig>
    );
  }

  if (showLanding) {
    return (
      <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>
        <LandingPage
          onStart={(workspace) => {
            if (workspace) setActiveWorkspace(workspace);
            setShowLanding(false);
          }}
          onOpenTutorials={openTutorials}
        />
      </MotionConfig>
    );
  }

  const active = WORKSPACES.find((workspace) => workspace.id === activeWorkspace) ?? WORKSPACES[0];
  const ActiveWorkspace = active.Component;

  return (
    // `reducedMotion="user"` is the single gate for the JS side; index.css
    // carries the equivalent for CSS transitions.
    <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>
      <WorksProvider activeWorkspace={active.id} onActivateWorkspace={setActiveWorkspace}>
      <div className="paper-grain flex h-screen w-screen flex-col overflow-hidden bg-background font-sans md:flex-row">
        <Toaster position="top-center" richColors />
        <MiniPlayer />

        <AppSidebar active={activeWorkspace} onSelect={setActiveWorkspace} onHome={() => setShowLanding(true)} />

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            {/* Keyed so switching canvases unmounts the previous one rather than
                reusing its state under a different workspace. Entrance only —
                an exit animation would hold two heavy canvases alive at once. */}
            {/* Opacity only, deliberately. A `y` here left a residual inline
                transform on the wrapper, which makes it the containing block
                for every `position: fixed` descendant -- so any modal or
                lightbox opened inside a workspace was clipped to below the
                sidebar's edge instead of covering the viewport.

                The fade sits above WorkHost and Suspense so it mounts with the
                canvas switch itself. Mounted below them -- after the works are
                read, or under a boundary that later suspends -- its entrance
                never ran and the canvas stayed at opacity 0. */}
            <motion.div
              key={active.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={TWEEN.base}
              className="h-full w-full"
            >
              <WorkHost fallback={<WorkspaceFallback />}>
                <Suspense fallback={<WorkspaceFallback />}>
                  <ActiveWorkspace />
                </Suspense>
              </WorkHost>
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>
      </WorksProvider>
    </MotionConfig>
  );
}
