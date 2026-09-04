import { Check, Loader2 } from "lucide-react";
import type { CreationProgress } from "@/workspaces/ppt/canvas/lib/creation-machine";
import type { CreationStep } from "@/workspaces/ppt/canvas/types";

/** Circumference of the r=40 progress ring, for the stroke-dash trick. */
const RING_LENGTH = 251.2;

interface GenerationProgressProps {
  step: CreationStep;
  progress: CreationProgress;
  tr: (zh: string, en: string) => string;
}

/**
 * The full-screen view shown while a deck is being written and rendered.
 *
 * It is the only thing on screen for the whole run, deliberately: there is no
 * way to cancel or navigate away mid-generation, so there is nothing else to
 * offer.
 */
export function GenerationProgress({ step, progress, tr }: GenerationProgressProps) {
  // A run with no known total shows an empty ring rather than jumping to 100%.
  const ratio = progress.total > 0 ? Math.max(0, Math.min(1, progress.current / progress.total)) : 0;
  const percent = Math.round(ratio * 100);
  const isRendering = step === "generating_images";

  return (
    <div className="w-full h-full bg-sunken flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-soft-lg text-center space-y-6">
          <div className="relative w-20 h-20 mx-auto">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle
                className="text-foreground/80 stroke-current"
                strokeWidth="8"
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
              />
              <circle
                className="text-primary stroke-current transition-all duration-300 ease-in-out origin-center -rotate-90"
                strokeWidth="8"
                strokeLinecap="round"
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                strokeDasharray={`${ratio * RING_LENGTH} ${RING_LENGTH}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{percent}%</div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{tr("AI 正在创作中", "AI is creating")}</h3>
            <p className="text-sm text-muted-foreground">
              {progress.message || tr("正在渲染图片…", "Rendering images...")}
            </p>
          </div>

          <div className="flex justify-center gap-2 text-xs text-muted-foreground">
            <div className={`flex items-center gap-1 ${isRendering ? "text-primary" : ""}`}>
              {isRendering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              <span>{tr("渲染图片", "Render images")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
