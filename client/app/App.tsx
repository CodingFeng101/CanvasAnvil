import { Suspense, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Toaster } from "sonner";
import { BrandIcon } from "@/app/BrandIcon";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { DEFAULT_WORKSPACE, WORKSPACES, isWorkspaceId, type WorkspaceId } from "@/app/workspaces";
import { SettingsDialog } from "@/app/SettingsDialog";
import { LandingPage } from "@/pages/LandingPage";
import { cn } from "@/shared/lib/utils";
import { setUiLanguage, t, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { SPRING, TWEEN } from "@/shared/motion";
import { applyTheme, useTheme, type Theme } from "@/shared/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

const APP_VIEW_STORAGE_KEY = "CanvasAnvil-app-view-v1";
const APP_WORKSPACE_STORAGE_KEY = "CanvasAnvil-active-workspace-v1";

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
 * appear -- canvas on the left, chat on the right -- rather than a lone
 * spinner on a blank page, so the switch reads as the layout filling in.
 */
function WorkspaceFallback() {
  return (
    <div className="flex h-full w-full animate-fade-in" aria-busy="true">
      <div className="flex-[68] p-6">
        <SkeletonBlock className="h-full w-full rounded-2xl" />
      </div>
      <div className="flex flex-[32] flex-col border-l border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <SkeletonBlock className="h-5 w-24 rounded-md" />
          <SkeletonBlock className="size-7 rounded-md" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 px-5">
          <SkeletonBlock className="size-12 rounded-2xl" />
          <SkeletonBlock className="h-5 w-2/3 rounded-md" />
          <SkeletonBlock className="h-4 w-full rounded-md" />
          <SkeletonBlock className="mt-4 h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
        <div className="border-t border-border/50 p-4">
          <SkeletonBlock className="h-[104px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

const THEME_ORDER: Theme[] = ["light", "dark", "system"];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

function ThemeToggle() {
  const uiLang = useUiLanguage();
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];

  const label =
    uiLang === "zh"
      ? { light: "浅色", dark: "深色", system: "跟随系统" }[theme]
      : { light: "Light", dark: "Dark", system: "System" }[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length])}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color] duration-fast ease-out-soft hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          {/* The icon swaps rather than cross-dissolving in place, so the
              three-way cycle stays legible at a glance. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ opacity: 0, rotate: -70, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 70, scale: 0.7 }}
              transition={TWEEN.fast}
              className="flex items-center justify-center"
            >
              <Icon className="size-[18px]" />
            </motion.span>
          </AnimatePresence>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One-click language switch beside the theme toggle. Inside a workspace the
 * only way to change language used to be the settings dialog, while the
 * portal had its own button in the header -- now both are one click.
 */
function LanguageToggle() {
  const uiLang = useUiLanguage();
  const next: UiLanguage = uiLang === "zh" ? "en" : "zh";
  const label = uiLang === "zh" ? "Switch to English" : "切换到中文";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => setUiLanguage(next)}
          className="flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-[13px] font-semibold text-muted-foreground transition-[background-color,color] duration-fast ease-out-soft hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={uiLang}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={TWEEN.fast}
            >
              {uiLang === "zh" ? "EN" : "中"}
            </motion.span>
          </AnimatePresence>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceSwitcher({
  active,
  onSelect,
}: {
  active: WorkspaceId;
  onSelect: (id: WorkspaceId) => void;
}) {
  const uiLang = useUiLanguage();

  return (
    <div className="flex min-w-max items-center gap-0.5 rounded-xl border border-border/60 bg-sunken p-1">
      {WORKSPACES.map(({ id, labelKey, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium",
              "transition-colors duration-fast ease-out-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* One shared element slides between tabs instead of three
                independent backgrounds fading in and out. */}
            {isActive && (
              <motion.span
                layoutId="workspace-tab"
                transition={SPRING.snap}
                className="absolute inset-0 rounded-lg bg-card shadow-xs ring-1 ring-border/60"
              />
            )}
            <Icon className="relative z-10 size-4" />
            <span className="relative z-10">{t(uiLang, labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(APP_VIEW_STORAGE_KEY) !== "workspace";
  });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(readStoredWorkspace);

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
  }, [activeWorkspace]);

  if (showLanding) {
    return (
      <MotionConfig reducedMotion="user">
        <LandingPage
          onStart={(workspace) => {
            if (workspace) setActiveWorkspace(workspace);
            setShowLanding(false);
          }}
        />
      </MotionConfig>
    );
  }

  const active = WORKSPACES.find((workspace) => workspace.id === activeWorkspace) ?? WORKSPACES[0];
  const ActiveWorkspace = active.Component;

  return (
    // `reducedMotion="user"` is the single gate for the JS side; index.css
    // carries the equivalent for CSS transitions.
    <MotionConfig reducedMotion="user">
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden font-sans">
        <Toaster position="top-center" richColors />

        <header className="h-14 shrink-0 border-b border-border/60 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 z-50">
          <button
            type="button"
            className="group flex items-center gap-2 justify-self-start rounded-lg px-1.5 py-1 transition-colors duration-fast ease-out-soft hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            onClick={() => setShowLanding(true)}
          >
            <BrandIcon className="h-7 w-7 transition-transform duration-base ease-out-soft group-hover:-rotate-6" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.015em]">CanvasAnvil</span>
          </button>

          <div className="justify-self-center max-w-full overflow-x-auto">
            <WorkspaceSwitcher active={activeWorkspace} onSelect={setActiveWorkspace} />
          </div>

          <div className="flex items-center gap-1 justify-self-end">
            <LanguageToggle />
            <ThemeToggle />
            <SettingsDialog />
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <ErrorBoundary>
            {/* Keyed so switching canvases unmounts the previous one rather than
                reusing its state under a different workspace. Entrance only —
                an exit animation would hold two heavy canvases alive at once. */}
            <Suspense fallback={<WorkspaceFallback />}>
              {/* Opacity only, deliberately. A `y` here left a residual inline
                  transform on the wrapper, which makes it the containing block
                  for every `position: fixed` descendant -- so any modal or
                  lightbox opened inside a workspace was clipped to below the
                  header instead of covering the viewport. */}
              <motion.div
                key={active.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={TWEEN.base}
                className="h-full w-full"
              >
                <ActiveWorkspace />
              </motion.div>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </MotionConfig>
  );
}
