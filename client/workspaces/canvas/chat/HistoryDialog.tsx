import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { t, useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { ImageVersion } from "@/workspaces/canvas/canvas/lineage";

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ImageVersion[];
  activeElementId: string | null;
  onSelectVersion: (elementId: string) => void;
}

/** A grid of version thumbnails for the currently selected picture -- same layout the diagram canvas uses for its own history. */
export function HistoryDialog({ open, onOpenChange, versions, activeElementId, onSelectVersion }: HistoryDialogProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            {t(uiLang, "history.title")}
          </DialogTitle>
        </DialogHeader>

        {versions.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground text-sm">{t(uiLang, "history.empty")}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
            {versions.map((version, index) => {
              const isActive = version.elementId === activeElementId;
              return (
                <button
                  key={version.elementId}
                  type="button"
                  onClick={() => {
                    onSelectVersion(version.elementId);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "border rounded-md p-2 text-left transition-colors hover:border-primary",
                    isActive ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                >
                  <div className="aspect-video bg-muted rounded overflow-hidden flex items-center justify-center">
                    <img
                      src={version.url}
                      alt={tr(`版本 ${index + 1}`, `Version ${index + 1}`)}
                      className="object-contain w-full h-full p-1"
                    />
                  </div>
                  <div className="text-xs text-center mt-1 text-muted-foreground">
                    {tr(`版本 ${index + 1}`, `Version ${index + 1}`)}
                    {isActive ? tr("（当前）", " (current)") : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
